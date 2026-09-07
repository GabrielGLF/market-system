import { db } from '../db';
import { exportDatabaseToJson } from './export';
import { getSupabaseClient, isCloudConfigured } from './cloudConfig';
import { canUseSubtleCrypto, isSecureContextSafe } from './browser';

/**
 * Backup automático na nuvem (Supabase Storage, bucket privado `backups`).
 *
 * Fluxo: export completo do Dexie → (opcional) criptografia AES-GCM com senha
 * derivada por PBKDF2 → upload em backups/{store_id}/{timestamp}.json.
 *
 * O agendamento é "preguiçoso": roda no carregamento do app; se o último
 * backup tem mais de 24h (e a nuvem está configurada), dispara em segundo
 * plano sem bloquear a UI. Falhas nunca derrubam o app — viram um aviso na
 * Central de Ações.
 */

const LAST_BACKUP_KEY = 'marketsystem.lastCloudBackupAt';
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------------------------------------------------------------------
// Criptografia (opcional): AES-GCM 256 com chave derivada por PBKDF2
// ---------------------------------------------------------------------------

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Formato do arquivo criptografado (JSON): versão + salt + iv + dados base64.
 * Sem a senha, o conteúdo do backup é inútil para qualquer um — inclusive para
 * o Supabase.
 */
export async function encryptJson(json: string, password: string): Promise<string> {
  if (!canUseSubtleCrypto() || !isSecureContextSafe()) {
    throw new Error('Criptografia exige HTTPS ou localhost (contexto seguro). Sem isso, faça o backup sem senha.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(password, salt);
  const data = new TextEncoder().encode(json);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  const b64 = (buf: ArrayBuffer | Uint8Array) => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  };

  return JSON.stringify({
    __encrypted: true,
    v: 1,
    kdf: 'PBKDF2-SHA256-210000',
    salt: b64(salt),
    iv: b64(iv),
    data: b64(cipher),
  });
}

export async function decryptJson(payload: string, password: string): Promise<string> {
  if (!canUseSubtleCrypto()) {
    throw new Error('Este dispositivo/navegador não suporta descriptografia (WebCrypto indisponível).');
  }
  const parsed = JSON.parse(payload) as { salt: string; iv: string; data: string };
  const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
    const raw = atob(s);
    const buf = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf;
  };

  const key = await deriveKey(password, unb64(parsed.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(parsed.iv) },
    key,
    unb64(parsed.data)
  );
  return new TextDecoder().decode(plain);
}

// ---------------------------------------------------------------------------
// Metadados do último backup
// ---------------------------------------------------------------------------

export function getLastBackupAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function setLastBackupAt(ts: number): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(ts));
  } catch {
    // localStorage indisponível — segue sem persistir.
  }
}

/** Idade do último backup em horas (null se nunca fez). */
export function getLastBackupAgeHours(): number | null {
  const ts = getLastBackupAt();
  if (!ts) return null;
  return Math.max(0, (Date.now() - ts) / 3_600_000);
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface CloudBackupResult {
  path: string;
  sizeBytes: number;
  encrypted: boolean;
}

/**
 * Exporta a base completa e envia ao Storage. `password` criptografa antes do
 * upload. Requer sessão Supabase ativa (o store_id vem do próprio servidor
 * via RLS — o cliente só usa o prefixo que o select de `store_members` permitir).
 */
export async function runCloudBackup(password?: string): Promise<CloudBackupResult> {
  if (!isCloudConfigured()) {
    throw new Error('Nuvem não configurada: informe a URL e a chave do Supabase.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Cliente Supabase indisponível.');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw new Error('Sem sessão na nuvem — conecte-se em Configurações antes do backup.');
  }

  // O prefixo da loja é derivado no SERVIDOR (RLS); aqui apenas consultamos as
  // lojas do usuário — o Storage rejeitará qualquer caminho fora do prefixo.
  const { data: stores, error: storesError } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', sessionData.session.user.id)
    .limit(1);
  if (storesError || !stores || stores.length === 0) {
    throw new Error('Nenhuma loja vinculada ao usuário (rode o passo 1 do 0001_cloud_sync.sql).');
  }
  const storeId = stores[0].store_id as string;

  const json = await exportDatabaseToJson();
  const payload = password ? await encryptJson(json, password) : json;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${storeId}/${ts}.json`;

  const { error: uploadError } = await supabase.storage
    .from('backups')
    .upload(path, payload, {
      contentType: 'application/json',
      upsert: false,
    });
  if (uploadError) throw new Error(`Falha no upload do backup: ${uploadError.message}`);

  setLastBackupAt(Date.now());
  await pruneOldBackups(storeId, 30);

  return { path, sizeBytes: payload.length, encrypted: Boolean(password) };
}

/** Mantém só os N backups mais recentes do prefixo da loja. */
async function pruneOldBackups(storeId: string, keep: number): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    const { data: files } = await supabase.storage.from('backups').list(storeId, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (!files || files.length <= keep) return;
    const stale = files.slice(keep).map(f => `${storeId}/${f.name}`);
    await supabase.storage.from('backups').remove(stale);
  } catch {
    // Poda é best-effort — nunca falha o backup por causa dela.
  }
}

export interface CloudBackupInfo {
  name: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
}

export async function listCloudBackups(): Promise<CloudBackupInfo[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Cliente Supabase indisponível.');

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) throw new Error('Sem sessão na nuvem.');

  const { data: stores } = await supabase
    .from('store_members')
    .select('store_id')
    .eq('user_id', sessionData.session.user.id)
    .limit(1);
  if (!stores || stores.length === 0) return [];
  const storeId = stores[0].store_id as string;

  const { data: files, error } = await supabase.storage.from('backups').list(storeId, {
    limit: 100,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw new Error(`Falha ao listar backups: ${error.message}`);

  return (files || [])
    .filter(f => f.name.endsWith('.json'))
    .map(f => ({
      name: f.name,
      path: `${storeId}/${f.name}`,
      createdAt: f.created_at || '',
      sizeBytes: f.metadata?.size || 0,
    }));
}

export async function downloadCloudBackup(path: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Cliente Supabase indisponível.');

  const { data, error } = await supabase.storage.from('backups').download(path);
  if (error || !data) throw new Error(`Falha ao baixar backup: ${error?.message || 'sem dados'}`);
  return data.text();
}

// ---------------------------------------------------------------------------
// Agendamento (lazy): chamado no boot do app
// ---------------------------------------------------------------------------

let autoRunning = false;

/**
 * Executa o backup automático se: nuvem configurada, sessão ativa e último
 * backup com mais de 24h. Nunca lança — resultado vai para o log e para o
 * indicador da Central de Ações.
 */
export async function runAutoBackupIfDue(password?: string): Promise<void> {
  if (autoRunning) return;
  if (!isCloudConfigured()) return;

  const last = getLastBackupAt();
  if (last && Date.now() - last < BACKUP_INTERVAL_MS) return;

  autoRunning = true;
  try {
    const result = await runCloudBackup(password);
    console.info(`[backup] Backup automático enviado: ${result.path}`);
  } catch (err) {
    // Sem sessão (modo local) é o caso mais comum — não é erro visível.
    console.warn('[backup] Backup automático adiado:', err instanceof Error ? err.message : err);
  } finally {
    autoRunning = false;
  }
}
