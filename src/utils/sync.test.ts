import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../db';
import type { Sale } from '../types';
import {
  installSyncHooks,
  setSyncPaused,
  buildSyncRows,
  computeBackoffMs,
  toJsonSafe,
  enqueueSync,
  flushPendingSync
} from './sync';

/**
 * Testes do motor de sincronização (outbox transacional).
 * Usam fake-indexeddb para exercitar os hooks Dexie reais: toda gravação em
 * tabela sincronizada gera entrada pendente NA MESMA transação, coalescida
 * pela chave `entity:entityId`.
 */

// O enqueue é adiado por um macrotask (depois do commit da transação de
// negócio) — os testes disparam o timer e aguardam o flush terminar.
const tick = async () => {
  await new Promise<void>(r => setTimeout(r, 0));
  await flushPendingSync();
};

function makeSale(id: string, total = 10): Sale {
  return {
    id,
    saleNumber: `V-${id.slice(0, 4)}`,
    date: new Date().toISOString(),
    items: [],
    subtotal: total,
    discount: 0,
    total,
    costTotal: 5,
    profit: 5,
    paymentMethods: [{ method: 'CASH', amount: total }],
    status: 'COMPLETED'
  };
}

// `clear()` dispara o hook 'deleting' do Dexie — o teardown pausa o sync para
// os clears de higiene não gerarem entradas fantasmas no outbox.
const clearAll = async () => {
  setSyncPaused(true);
  await db.syncOutbox.clear();
  await db.sales.clear();
  setSyncPaused(false);
};

beforeEach(async () => {
  installSyncHooks();
  setSyncPaused(false);
  await clearAll();
});

afterEach(async () => {
  await clearAll();
});

describe('outbox transacional (hooks Dexie)', () => {
  it('enfileira entrada pendente ao gravar uma venda', async () => {
    await db.sales.put(makeSale('sale-1'));
    await tick();
    const pending = await db.syncOutbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].entity).toBe('sales');
    expect(pending[0].entityId).toBe('sale-1');
    expect(pending[0].op).toBe('PUT');
    expect(pending[0].attempts).toBe(0);
  });

  it('coalesce gravações repetidas na mesma entrada', async () => {
    await db.sales.put(makeSale('sale-1', 10));
    await db.sales.put(makeSale('sale-1', 20));
    await db.sales.update('sale-1', { total: 30 });
    await tick();

    const pending = await db.syncOutbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0].entityId).toBe('sale-1');
  });

  it('tabelas não sincronizadas não geram outbox', async () => {
    await db.products.put({
      id: 'prod-1', name: 'X', sku: 'S', barcode: 'B', categoryId: 'c',
      costPrice: 1, sellPrice: 2, stock: 5, minStock: 1, unit: 'UN',
      isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('seed pausado não enfileira nada', async () => {
    setSyncPaused(true);
    await db.sales.put(makeSale('sale-2'));
    await tick();
    expect(await db.syncOutbox.count()).toBe(0);
    setSyncPaused(false);
  });

  it('enqueueSync coalesce preservando createdAt e resetando tentativas', async () => {
    await enqueueSync('sales', 'sale-3');
    const first = (await db.syncOutbox.get('sales:sale-3'))!;
    await db.syncOutbox.update('sales:sale-3', { attempts: 4 });
    await enqueueSync('sales', 'sale-3');

    const second = (await db.syncOutbox.get('sales:sale-3'))!;
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.attempts).toBe(0);
  });
});

describe('buildSyncRows (estado mais fresco + tombstones)', () => {
  it('monta PUT com o estado atual do registro', async () => {
    const { rows } = await buildSyncRows(
      [{ id: 'k', entity: 'sales', entityId: 'sale-1', op: 'PUT', createdAt: '', updatedAt: '', attempts: 0 }],
      async () => makeSale('sale-1', 42)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].entity).toBe('sales');
    expect(rows[0].op).toBe('PUT');
    expect((rows[0].row as Sale).total).toBe(42);
  });

  it('registro apagado localmente vira DELETE (espelho acompanha a verdade local)', async () => {
    const { rows, keysToClear } = await buildSyncRows(
      [{ id: 'k', entity: 'sales', entityId: 'sale-1', op: 'PUT', createdAt: '', updatedAt: '', attempts: 0 }],
      async () => undefined
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].op).toBe('DELETE');
    expect((rows[0].row as { id: string }).id).toBe('sale-1');
    expect(keysToClear).toEqual(['k']);
  });

  it('registro recriado após exclusão volta a ser PUT', async () => {
    const { rows } = await buildSyncRows(
      [{ id: 'k', entity: 'sales', entityId: 'sale-1', op: 'DELETE', createdAt: '', updatedAt: '', attempts: 0 }],
      async () => makeSale('sale-1')
    );
    expect(rows[0].op).toBe('PUT');
  });
});

describe('utilitários', () => {
  it('toJsonSafe remove undefined e clona', () => {
    const obj = { a: 1, b: undefined, c: { d: 'x' } };
    const clean = toJsonSafe(obj);
    expect(clean).toEqual({ a: 1, c: { d: 'x' } });
    expect('b' in (clean as object)).toBe(false);
    expect(clean).not.toBe(obj);
  });

  it('computeBackoffMs cresce exponencialmente e respeita o teto', () => {
    expect(computeBackoffMs(1)).toBe(5000);
    expect(computeBackoffMs(2)).toBe(10000);
    expect(computeBackoffMs(7)).toBeGreaterThan(computeBackoffMs(3));
    expect(computeBackoffMs(99)).toBeLessThanOrEqual(300000);
    expect(computeBackoffMs(0)).toBe(5000);
  });
});