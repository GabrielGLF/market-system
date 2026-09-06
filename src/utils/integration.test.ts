import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { buildCashAudit } from './cashAudit';
import { evaluateRepricing, minPriceForMargin, applyStockIn } from './inventory';
import { exportDatabaseToJson, importDatabaseFromJson, validateBackupData } from './export';
import type { Sale, Product, CashMovement, StoreSettings, Category } from '../types';

/**
 * Testes de integração do ciclo de confiabilidade:
 *  - Backup: roundtrip export → import preserva os dados; arquivo inválido é rejeitado.
 *  - Auditoria de caixa: reconstrução linha a linha bate com o esperado.
 *  - Reprecificação: margem mínima, preço sugerido e gatilhos de alerta.
 *  - Compra em lote: várias linhas em uma transação — ou entra tudo, ou nada.
 */

const nowIso = () => new Date().toISOString();

async function seedProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const p: Product = {
    id: crypto.randomUUID(),
    name: 'Arroz 5kg',
    sku: 'ARZ-5',
    barcode: String(Math.floor(1e12 + Math.random() * 9e12)),
    categoryId: '',
    costPrice: 10,
    sellPrice: 15,
    stock: 20,
    minStock: 5,
    unit: 'UN',
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
  await db.products.add(p);
  return p;
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

describe('Backup — roundtrip e validação', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
  });

  it('export → import preserva os dados idênticos', async () => {
    await seedProduct({ name: 'Feijão 1kg', costPrice: 6, sellPrice: 8.5, stock: 30 });
    await db.settings.add({ id: 's1', companyName: 'Mercearia Teste' } as StoreSettings);
    await db.categories.add({ id: 'c1', name: 'Mercearia', color: '#10b981' } as Category);

    const json = await exportDatabaseToJson();

    // Destrói a base e restaura
    await Promise.all(db.tables.map(t => t.clear()));
    expect((await db.products.toArray()).length).toBe(0);

    await importDatabaseFromJson(json);

    const products = await db.products.toArray();
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('Feijão 1kg');
    expect(products[0].sellPrice).toBe(8.5);
    expect((await db.settings.toArray())[0].companyName).toBe('Mercearia Teste');
    expect((await db.categories.toArray())[0].name).toBe('Mercearia');
  });

  it('rejeita arquivo corrompido sem tocar na base', async () => {
    await seedProduct();
    const before = await db.products.toArray();

    expect(validateBackupData('não é objeto')).not.toBeNull();
    expect(validateBackupData({ foo: [] })).not.toBeNull();
    expect(validateBackupData({ products: 'não é lista' })).not.toBeNull();

    await expect(importDatabaseFromJson('{json quebrado')).rejects.toThrow();

    // Base intacta
    expect(await db.products.toArray()).toEqual(before);
  });

  it('limpa tabelas ausentes no backup (restauração é substituição completa)', async () => {
    await seedProduct();
    const json = await exportDatabaseToJson();

    // Adiciona um produto extra que NÃO está no backup
    await seedProduct({ name: 'Produto fora do backup' });
    expect((await db.products.toArray()).length).toBe(2);

    await importDatabaseFromJson(json);
    const after = await db.products.toArray();
    expect(after.length).toBe(1);
    expect(after[0].name).not.toBe('Produto fora do backup');
  });
});

// ---------------------------------------------------------------------------
// Auditoria de caixa
// ---------------------------------------------------------------------------

describe('Auditoria de caixa — reconstrução linha a linha', () => {
  it('fundo + vendas + suprimento − sangria = esperado', () => {
    const sales: Sale[] = [
      {
        id: 's1', saleNumber: 'V-1', date: '2026-09-06T10:00:00.000Z',
        items: [], subtotal: 50, discount: 0, total: 50,
        paymentMethods: [{ method: 'CASH', amount: 50, details: { receivedAmount: 50, change: 0 } }],
        status: 'COMPLETED',
      },
      {
        id: 's2', saleNumber: 'V-2', date: '2026-09-06T11:00:00.000Z',
        items: [], subtotal: 100, discount: 0, total: 100,
        paymentMethods: [{ method: 'CASH', amount: 80, details: { receivedAmount: 100, change: 20 } }],
        status: 'COMPLETED',
      },
      {
        id: 's3', saleNumber: 'V-3', date: '2026-09-06T12:00:00.000Z',
        items: [], subtotal: 30, discount: 0, total: 30,
        paymentMethods: [{ method: 'PIX', amount: 30 }],
        status: 'COMPLETED',
      },
    ] as unknown as Sale[];

    const movements: CashMovement[] = [
      { id: 'm1', sessionId: 'cs1', type: 'SUPPLY', amount: 100, reason: 'troco', date: '2026-09-06T09:30:00.000Z' },
      { id: 'm2', sessionId: 'cs1', type: 'BLEED', amount: 150, reason: 'depósito', date: '2026-09-06T13:00:00.000Z' },
    ];

    const result = buildCashAudit(200, sales, movements, 280);

    // 200 (fundo) + 50 + 80 (vendas cash, já líquidas de troco) + 100 (suprimento) − 150 (sangria) = 280
    expect(result.rebuiltExpected).toBe(280);
    expect(result.reconstructionGap).toBe(0);
    expect(result.entries.length).toBe(5); // abertura + 2 vendas cash + suprimento + sangria (pix não entra)
    expect(result.entries[0].kind).toBe('OPENING');
  });

  it('venda cancelada não entra na gaveta', () => {
    const sales: Sale[] = [
      {
        id: 's1', saleNumber: 'V-1', date: '2026-09-06T10:00:00.000Z',
        items: [], subtotal: 50, discount: 0, total: 50,
        paymentMethods: [{ method: 'CASH', amount: 50 }],
        status: 'CANCELLED',
      },
    ] as unknown as Sale[];

    const result = buildCashAudit(100, sales, [], 100);
    expect(result.rebuiltExpected).toBe(100);
    expect(result.entries.length).toBe(1);
  });

  it('detecta gap quando o esperado armazenado diverge da reconstrução', () => {
    const result = buildCashAudit(100, [], [], 150);
    expect(result.reconstructionGap).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Reprecificação
// ---------------------------------------------------------------------------

describe('Reprecificação — margem mínima e alertas', () => {
  it('preço mínimo preserva a margem alvo (arredondado p/ cima)', () => {
    // custo 10, margem 20% → 12.5 exato
    expect(minPriceForMargin(10, 20)).toBe(12.5);
    // custo 10.10, margem 20% → 12.625 → teto 12.63
    expect(minPriceForMargin(10.10, 20)).toBe(12.63);
    expect(minPriceForMargin(0, 20)).toBe(0);
  });

  it('alerta quando a compra empurra a margem abaixo do mínimo', () => {
    // Custo médio sobe de 10 para 12 com preço de venda 14 → margem 14,3%
    const alert = evaluateRepricing(14, 10, 12, 20, 5);
    expect(alert.shouldAlert).toBe(true);
    expect(alert.newMarginPct).toBeCloseTo(14.29, 1);
    expect(alert.suggestedMinPrice).toBe(15);
  });

  it('não alerta quando a margem continua saudável', () => {
    const alert = evaluateRepricing(20, 10, 10.5, 20, 5);
    expect(alert.shouldAlert).toBe(false);
  });

  it('alerta em queda grande mesmo com margem acima do mínimo', () => {
    // Margem nova 24% (acima de 20), mas queda de 9 p.p.
    const alert = evaluateRepricing(25, 7, 19, 20, 5);
    expect(alert.shouldAlert).toBe(true);
    expect(alert.marginDropPp).toBeGreaterThan(5);
  });

  it('não alerta quando o custo caiu', () => {
    const alert = evaluateRepricing(15, 12, 10, 20, 5);
    expect(alert.shouldAlert).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Compra em lote (transação atômica com múltiplas linhas)
// ---------------------------------------------------------------------------

describe('Compra em lote — atomicidade e custo médio', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
  });

  it('N linhas em uma transação: estoque, custo médio e movimentações corretos', async () => {
    const p1 = await seedProduct({ name: 'A', stock: 10, costPrice: 10 });
    const p2 = await seedProduct({ name: 'B', stock: 5, costPrice: 4 });

    await db.transaction('rw', [db.products, db.stockMovements], async () => {
      await applyStockIn({ productId: p1.id, quantity: 10, unitCost: 6, reason: 'nota X', supplier: 'Forn', invoiceNumber: '123' });
      await applyStockIn({ productId: p2.id, quantity: 15, unitCost: 5, reason: 'nota X', supplier: 'Forn', invoiceNumber: '123' });
    });

    const [a, b] = await Promise.all([db.products.get(p1.id), db.products.get(p2.id)]);
    expect(a!.stock).toBe(20);
    expect(a!.costPrice).toBe(8);   // (10×10 + 10×6) / 20
    expect(a!.lastPurchaseCost).toBe(6);
    expect(a!.lastSupplier).toBe('Forn');
    expect(b!.stock).toBe(20);
    expect(b!.costPrice).toBeCloseTo(4.75, 6); // (5×4 + 15×5) / 20

    const movements = await db.stockMovements.toArray();
    expect(movements.length).toBe(2);
    expect(movements.every(m => m.type === 'IN' && m.supplier === 'Forn' && m.invoiceNumber === '123')).toBe(true);
  });

  it('erro na 2ª linha desfaz a 1ª (nada entra parcialmente)', async () => {
    const p1 = await seedProduct({ name: 'A', stock: 10, costPrice: 10 });
    await seedProduct({ name: 'B', stock: 5, costPrice: 4 });

    await expect(
      db.transaction('rw', [db.products, db.stockMovements], async () => {
        await applyStockIn({ productId: p1.id, quantity: 10, unitCost: 6 });
        // Produto inexistente → lança → transação inteira desfaz
        await applyStockIn({ productId: 'id-inexistente', quantity: 5, unitCost: 3 });
      })
    ).rejects.toThrow();

    const a = await db.products.get(p1.id);
    expect(a!.stock).toBe(10); // não aplicou a 1ª linha
    expect((await db.stockMovements.toArray()).length).toBe(0);
  });
});
