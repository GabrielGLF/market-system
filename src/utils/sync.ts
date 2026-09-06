import { db } from '../db';
import type { Table } from 'dexie';
import type { SyncEntity, SyncOutboxEntry } from '../types';
import { getSupabaseClient } from './serverAuth';

/**
 * Motor de sincronização OFFLINE-FIRST (padrão transactional outbox).
 *
 * Autoridade: o IndexedDB local é a fonte primária. Toda gravação em tabela
 * sincronizada gera, via hook Dexie e NA MESMA transação, uma entrada pendente
 * no outbox (`syncOutbox`). Quando há sessão de nuvem (Supabase) e rede, o
 * motor envia um upsert idempotente para o RPC `sync_push` (store_id derivado
 * no servidor via RLS). Falhas mantêm a entrada pendente com backoff — nenhum
 * dado local é perdido por estar offline.
 *
 * Nesta rodada o sync é SOMENTE de envio (espelho de auditoria/backup). Não há
 * pull: evita duplicar vendas nos relatórios locais de dispositivos diferentes.
 */

export const SYNC_ENTITIES: readonly SyncEntity[] = [
  'sales',
  'stockMovements',
  'cashSessions',
  'cashMovements',
  'debtRecords',
  'customers'
];

export const SYNC_MAX_BATCH = 500;

const LAST_SYNC_KEY = 'marketsystem.lastSyncAt';
const LAST_ERROR_KEY = 'marketsystem.syncLastError';

let hooksInstalled = false;
let syncPaused = false;
let syncInFlight = false;
let nextRetryAt = 0;

export function setSyncPaused(paused: boolean): void {
  syncPaused = paused;
}

export function computeBackoffMs(attempts: number, base = 5_000, max = 300_000): number {
  if (!Number.isFinite(attempts) || attempts <= 0) return base;
  return Math.min(max, base * 2 ** (attempts - 1));
}

function keyFor(entity: SyncEntity, entityId: string): string {
  return `${entity}:${entityId}`;
}

function getRecord(entity: SyncEntity, id: string): Promise<unknown | undefined> {
  switch (entity) {
    case 'sales': return db.sales.get(id);
    case 'stockMovements': return db.stockMovements.get(id);
    case 'cashSessions': return db.cashSessions.get(id);
    case 'cashMovements': return db.cashMovements.get(id);
    case 'debtRecords': return db.debtRecords.get(id);
    case 'customers': return db.customers.get(id);
  }
}

/** Clona para JSON puro (remove undefined, evita mutação de objetos de live query). */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

/**
 * Enfileira (ou atualiza) a entrada pendente da entidade em transação própria
 * no outbox. Transações implícitas do Dexie (ex.: `db.sales.put()`) têm escopo
 * de object stores congelado — por isso o enqueue é SEMPRE adiado para depois
 * do commit (ver scheduleEnqueue). Semântica at-least-once com auto-cura: se a
 * gravação de negócio abortar, a entrada vira "fantasma" — o push a converte
 * em DELETE (registro inexistente), que é no-op no servidor.
 */
export async function enqueueSync(
  entity: SyncEntity,
  entityId: string,
  op: SyncOutboxEntry['op'] = 'PUT'
): Promise<void> {
  if (syncPaused) return;
  const id = keyFor(entity, entityId);
  const now = new Date().toISOString();
  await db.transaction('rw', db.syncOutbox, async () => {
    const existing = await db.syncOutbox.get(id);
    await db.syncOutbox.put({
      id,
      entity,
      entityId,
      op,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      attempts: 0
    });
  });
  schedulePush();
}

// Coalesce os enqueues disparados por hooks num ÚNICO flush por macrotask.
let deferredFlush: ReturnType<typeof setTimeout> | null = null;
const deferredKeys = new Set<string>();
const pendingEnqueues: Array<Promise<void>> = [];

/**
 * Adia o enqueue para DEPOIS da transação de negócio atual. Dentro de hooks
 * Dexie não é possível tocar outras tabelas: transações implícitas têm escopo
 * congelado (NotFoundError) e `db.transaction()` vira sub-transação do pai
 * (SubTransactionError). Um macrotask garante que o commit/abort já ocorreu.
 */
function scheduleEnqueue(
  entity: SyncEntity,
  entityId: string,
  op: SyncOutboxEntry['op'] = 'PUT'
): void {
  if (syncPaused) return;
  deferredKeys.add(JSON.stringify([entity, entityId, op]));
  if (deferredFlush !== null) return;
  deferredFlush = setTimeout(() => {
    deferredFlush = null;
    const batch = [...deferredKeys];
    deferredKeys.clear();
    for (const raw of batch) {
      const [ent, id, opCode] = JSON.parse(raw) as [SyncEntity, string, SyncOutboxEntry['op']];
      pendingEnqueues.push(
        enqueueSync(ent, id, opCode).catch((err: unknown) => {
          // Best-effort: falha do outbox NUNCA quebra a gravação de negócio.
          console.error('[sync] Falha ao enfileirar outbox', ent, id, err);
        })
      );
    }
  }, 0);
}

/** Aguarda os enqueues pendentes terminarem (usado em testes; inofensivo no app). */
export async function flushPendingSync(): Promise<void> {
  while (pendingEnqueues.length > 0) {
    const batch = pendingEnqueues.splice(0);
    await Promise.allSettled(batch);
  }
}

function bindHooks<T>(entity: SyncEntity, table: Table<T, string>): void {
  table.hook('creating', (primKey) => {
    scheduleEnqueue(entity, String(primKey));
  });
  table.hook('updating', (_mods, primKey) => {
    scheduleEnqueue(entity, String(primKey));
  });
  table.hook('deleting', (primKey) => {
    scheduleEnqueue(entity, String(primKey), 'DELETE');
  });
}

/** Instala os hooks que alimentam o outbox — idempotente, chamado uma vez no App. */
export function installSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  bindHooks('sales', db.sales);
  bindHooks('stockMovements', db.stockMovements);
  bindHooks('cashSessions', db.cashSessions);
  bindHooks('cashMovements', db.cashMovements);
  bindHooks('debtRecords', db.debtRecords);
  bindHooks('customers', db.customers);
}

export interface SyncRow {
  entity: SyncEntity;
  op: SyncOutboxEntry['op'];
  row: unknown;
}

/**
 * Monta as linhas a enviar a partir das entradas pendentes, lendo o ESTADO
 * ATUAL de cada registro local (sempre o mais fresco). Registros que sumiram
 * localmente viram DELETE (o espelho acompanha a verdade local).
 */
export async function buildSyncRows(
  pending: SyncOutboxEntry[],
  read: (entity: SyncEntity, id: string) => Promise<unknown | undefined> = getRecord
): Promise<{ rows: SyncRow[]; keysToClear: string[] }> {
  const rows: SyncRow[] = [];
  const keysToClear: string[] = [];

  for (const entry of pending) {
    const record = await read(entry.entity, entry.entityId);
    if (record === undefined || record === null) {
      // Registro não existe mais localmente: espelho deve refletir a exclusão
      rows.push({ entity: entry.entity, op: 'DELETE', row: { id: entry.entityId } });
    } else {
      rows.push({ entity: entry.entity, op: 'PUT', row: toJsonSafe(record) });
    }
    keysToClear.push(entry.id);
  }

  return { rows, keysToClear };
}

export interface SyncResult {
  pushed: number;
  failed: number;
  error?: string;
}

export function getLastSyncAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

export function getLastSyncError(): string | null {
  return localStorage.getItem(LAST_ERROR_KEY);
}

export function getPendingSyncCount(): Promise<number> {
  return db.syncOutbox.count();
}

function markLastSync(now: Date): void {
  localStorage.setItem(LAST_SYNC_KEY, now.toISOString());
  localStorage.removeItem(LAST_ERROR_KEY);
}

function markSyncError(message: string): void {
  localStorage.setItem(LAST_ERROR_KEY, message);
}

/**
 * Envia o outbox pendente para a nuvem. Só atua com Supabase configurado E
 * sessão de nuvem ativa; caso contrário devolve erro descritivo sem tocar nada.
 * Idempotente: IDs UUID locais são a PK no servidor → reenvio é inofensivo.
 */
export async function syncNow(): Promise<SyncResult> {
  const client = getSupabaseClient();
  if (!client) {
    return { pushed: 0, failed: 0, error: 'Sincronização em nuvem não configurada.' };
  }

  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError || !data.session) {
    return { pushed: 0, failed: 0, error: 'Entre com a conta (nuvem) para sincronizar.' };
  }

  const pending = await db.syncOutbox.orderBy('updatedAt').limit(SYNC_MAX_BATCH).toArray();
  if (pending.length === 0) {
    markLastSync(new Date());
    return { pushed: 0, failed: 0 };
  }

  const { rows, keysToClear } = await buildSyncRows(pending);
  if (rows.length === 0) {
    await db.syncOutbox.bulkDelete(keysToClear);
    markLastSync(new Date());
    return { pushed: 0, failed: 0 };
  }

  const { error } = await client.rpc('sync_push', { p_rows: rows });

  if (error) {
    const message = error.message || 'Falha na sincronização.';
    markSyncError(message);
    const now = new Date().toISOString();
    await Promise.all(pending.map(entry =>
      db.syncOutbox.update(entry.id, {
        attempts: (entry.attempts ?? 0) + 1,
        lastError: message,
        lastAttemptAt: now
      })
    ));
    const maxAttempts = Math.max(...pending.map(e => (e.attempts ?? 0) + 1), 1);
    nextRetryAt = Date.now() + computeBackoffMs(maxAttempts);
    return { pushed: 0, failed: rows.length, error: message };
  }

  await db.syncOutbox.bulkDelete(keysToClear);
  markLastSync(new Date());
  return { pushed: rows.length, failed: 0 };
}

// ---------------------------------------------------------------------------
// Motor automático (intervalo + evento online + push rápido pós-gravação)
// ---------------------------------------------------------------------------

let engineTimer: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function maybePush(): Promise<void> {
  if (syncInFlight) return;
  if (Date.now() < nextRetryAt) return;
  syncInFlight = true;
  try {
    await syncNow();
  } finally {
    syncInFlight = false;
  }
}

/** Agenda um push rápido (pós-gravação local). */
export function schedulePush(delayMs = 5_000): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void maybePush();
  }, delayMs);
}

/** Liga o motor: intervalo de 30s + push imediato + push ao voltar a ficar online. */
export function startSyncEngine(): void {
  stopSyncEngine();
  if (typeof window === 'undefined') return;
  engineTimer = window.setInterval(() => { void maybePush(); }, 30_000);
  window.addEventListener('online', () => { void maybePush(); });
  void maybePush();
}

export function stopSyncEngine(): void {
  if (typeof window === 'undefined') return;
  if (engineTimer !== null) {
    window.clearInterval(engineTimer);
    engineTimer = null;
  }
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}