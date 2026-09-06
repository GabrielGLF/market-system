import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  loadCompletedSalesBetween,
  loadSalesBetween,
  loadRecentSales,
  aggregateByDay,
  buildSalesVelocity,
  buildCustomerStats,
  aggregateMovementsByType,
  productByIdMap,
  dayStartIso,
  dayEndIso,
  periodStartIso,
  localMidnightIso,
} from './analytics';
import { searchProducts, getProductByCode, resetCache } from './pdvSearch';
import type { Sale, Product, StockMovement } from '../types';

/**
 * Testes da camada de analytics (consultas por janela indexada) e do motor de
 * busca do PDV. Usam fake-indexeddb para exercitar os índices reais do Dexie.
 */

const nowIso = () => new Date().toISOString();

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: crypto.randomUUID(),
    saleNumber: `V-${Math.floor(Math.random() * 100000)}`,
    date: nowIso(),
    items: [],
    subtotal: 100,
    discount: 0,
    total: 100,
    costTotal: 40,
    profit: 60,
    paymentMethods: [{ method: 'CASH', amount: 100 }],
    status: 'COMPLETED',
    ...overrides,
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    name: 'Produto Teste',
    sku: 'SKU-1',
    barcode: '1234567890123',
    categoryId: 'cat-1',
    costPrice: 4,
    sellPrice: 10,
    stock: 10,
    minStock: 2,
    unit: 'UN',
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

async function seedSales(n: number, daysAgo: number, extras: Partial<Sale> = {}) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const sales = Array.from({ length: n }, () =>
    makeSale({ date: d.toISOString(), ...extras })
  );
  await db.sales.bulkAdd(sales);
  return sales;
}

beforeEach(async () => {
  await db.sales.clear();
  await db.products.clear();
  await db.stockMovements.clear();
  resetCache();
});

describe('janelas de data (índice date)', () => {
  it('retorna só vendas concluídas dentro da janela', async () => {
    await seedSales(3, 0); // hoje
    await seedSales(2, 10); // fora da janela de 7 dias
    await db.sales.bulkAdd([
      makeSale({ status: 'CANCELLED' }), // hoje, mas cancelada
    ]);

    const from = localMidnightIso(6);
    const sales = await loadCompletedSalesBetween(from);

    expect(sales).toHaveLength(3);
    expect(sales.every(s => s.status === 'COMPLETED')).toBe(true);
    expect(sales.every(s => s.date >= from)).toBe(true);
  });

  it('respeita limite superior exclusivo', async () => {
    await seedSales(2, 0);
    const day = localMidnightIso(0);
    const sales = await loadCompletedSalesBetween(day, dayEndIso(day));
    expect(sales).toHaveLength(2);
  });

  it('loadSalesBetween inclui todos os status (telas com filtro)', async () => {
    await seedSales(2, 0, { status: 'COMPLETED' });
    await db.sales.add(makeSale({ status: 'CANCELLED' }));
    const sales = await loadSalesBetween(localMidnightIso(6));
    expect(sales).toHaveLength(3);
  });

  it('loadRecentSales devolve as mais recentes primeiro', async () => {
    await seedSales(3, 5);
    await seedSales(2, 0);
    const recent = await loadRecentSales(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].date >= recent[1].date).toBe(true);
    expect(new Date(recent[0].date).getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
  });

  it('periodStartIso cobre os períodos de negócio', () => {
    const now = new Date();
    expect(new Date(periodStartIso('today')).getDate()).toBe(now.getDate());
    expect(new Date(periodStartIso('month')).getDate()).toBe(1);
    expect(new Date(periodStartIso('year')).getMonth()).toBe(0);
    expect(periodStartIso('all')).toBe('0000-00-00T00:00:00.000Z');
  });
});

describe('limites de dia local', () => {
  it('dayStart/dayEnd delimitam o dia local completo', async () => {
    // Venda às 22h local de ontem (UTC já é hoje) — deve cair no dia local certo.
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(22, 0, 0, 0);
    await db.sales.add(makeSale({ date: d.toISOString() }));

    const dayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const sales = await loadCompletedSalesBetween(dayStartIso(dayIso), dayEndIso(dayIso));
    expect(sales).toHaveLength(1);
  });
});

describe('agregações', () => {
  it('aggregateByDay agrupa por dia ISO em uma passada', () => {
    const d1 = new Date('2026-09-05T10:00:00Z');
    const d2 = new Date('2026-09-06T15:00:00Z');
    const agg = aggregateByDay([
      makeSale({ date: d1.toISOString(), total: 50, profit: 20 }),
      makeSale({ date: d1.toISOString(), total: 30, profit: 10 }),
      makeSale({ date: d2.toISOString(), total: 70, profit: 30 }),
    ]);

    expect(agg.size).toBe(2);
    const day1 = agg.get('2026-09-05')!;
    expect(day1.revenue).toBe(80);
    expect(day1.profit).toBe(30);
    expect(day1.count).toBe(2);
  });

  it('buildSalesVelocity soma frações convertidas para pacotes', () => {
    const map = buildSalesVelocity([
      makeSale({
        items: [
          { productId: 'p1', quantity: 2, isAlternativeUnit: false } as Sale['items'][number],
          { productId: 'p1-alt', quantity: 4, isAlternativeUnit: true, originalUnitFactor: 10 } as Sale['items'][number],
          { productId: 'p2', quantity: 1, isAlternativeUnit: false } as Sale['items'][number],
        ],
      }),
    ]);

    // 2 pacotes + 4/10 de pacote = 2.4
    expect(map.get('p1')).toBeCloseTo(2.4, 5);
    expect(map.get('p2')).toBe(1);
  });

  it('buildCustomerStats agrega todas as vendas em uma passada', async () => {
    await db.sales.bulkAdd([
      makeSale({ customerId: 'c1', total: 100 }),
      makeSale({ customerId: 'c1', total: 50 }),
      makeSale({ customerId: 'c2', total: 30 }),
      makeSale({ customerId: 'c1', status: 'CANCELLED', total: 999 }),
    ]);

    const stats = await buildCustomerStats();
    expect(stats.get('c1')).toEqual({ totalPurchased: 150, salesCount: 2 });
    expect(stats.get('c2')).toEqual({ totalPurchased: 30, salesCount: 1 });
  });

  it('aggregateMovementsByType soma qty e valor por tipo', () => {
    const movements: StockMovement[] = [
      {
        id: '1', productId: 'p1', productName: 'P1', type: 'IN', quantity: 10,
        previousStock: 0, newStock: 10, reason: 'compra', date: nowIso(), costPrice: 5,
      },
      {
        id: '2', productId: 'p1', productName: 'P1', type: 'IN', quantity: 4,
        previousStock: 10, newStock: 14, reason: 'compra', date: nowIso(), costPrice: 5,
      },
      {
        id: '3', productId: 'p1', productName: 'P1', type: 'SALE', quantity: 2,
        previousStock: 14, newStock: 12, reason: 'venda', date: nowIso(), costPrice: 5,
      },
    ];

    const agg = aggregateMovementsByType(movements);
    expect(agg.get('IN')).toEqual({ qty: 14, value: 70 });
    expect(agg.get('SALE')).toEqual({ qty: 2, value: 10 });
  });

  it('productByIdMap dá lookup O(1)', () => {
    const products = [makeProduct(), makeProduct()];
    const map = productByIdMap(products);
    expect(map.get(products[0].id)).toBe(products[0]);
  });
});

describe('busca do PDV (pdvSearch)', () => {
  it('encontra por nome, SKU e código de barras', async () => {
    await db.products.bulkAdd([
      makeProduct({ name: 'Coca-Cola 2L', sku: 'COC2', barcode: '7891000001' }),
      makeProduct({ name: 'Pão Francês', sku: 'PAO1', barcode: '7891000002' }),
      makeProduct({ name: 'Leite Integral', sku: 'LEI1', barcode: '7891000003' }),
    ]);

    expect((await searchProducts('coca', null, 60))).toHaveLength(1);
    expect((await searchProducts('paO', null, 60))).toHaveLength(1);
    expect((await searchProducts('7891000003', null, 60))).toHaveLength(1);
    expect((await searchProducts('inexistente', null, 60))).toHaveLength(0);
  });

  it('filtra por categoria e produtos inativos', async () => {
    await db.products.bulkAdd([
      makeProduct({ name: 'Arroz', categoryId: 'cat-a' }),
      makeProduct({ name: 'Feijão', categoryId: 'cat-b' }),
      makeProduct({ name: 'Batata', categoryId: 'cat-a', isActive: false }),
    ]);

    const catA = await searchProducts('', 'cat-a', 60);
    expect(catA).toHaveLength(1);
    expect(catA[0].name).toBe('Arroz');
  });

  it('código de barras numérico completo usa caminho rápido do índice', async () => {
    await db.products.bulkAdd([
      makeProduct({ barcode: '7891234567890' }),
      makeProduct({ barcode: '1112223334445' }),
    ]);

    const found = await searchProducts('7891234567890', null, 60);
    expect(found).toHaveLength(1);
    expect(found[0].barcode).toBe('7891234567890');
  });

  it('reflete mutações incrementais (novo produto e desativação)', async () => {
    const p1 = makeProduct({ name: 'Refrigerante' });
    await db.products.add(p1);
    expect((await searchProducts('refri', null, 60))).toHaveLength(1);

    // Novo produto após a carga inicial → entra no cache via updatedAt
    const p2 = makeProduct({ name: 'Suco de Uva' });
    await db.products.add(p2);
    expect((await searchProducts('suco', null, 60))).toHaveLength(1);

    // Desativação → some do cache de ativos
    await db.products.update(p2.id, { isActive: false, updatedAt: new Date().toISOString() });
    expect((await searchProducts('suco', null, 60))).toHaveLength(0);
  });

  it('getProductByCode acha por código principal e de fração', async () => {
    await db.products.bulkAdd([
      makeProduct({ barcode: '7890000001', alternativeUnit: { name: 'UN', factor: 20, price: 1, barcode: '7890000002' } }),
    ]);

    const direct = await getProductByCode('7890000001');
    expect(direct?.isAlternative).toBe(false);

    const alt = await getProductByCode('7890000002');
    expect(alt?.isAlternative).toBe(true);
    expect(alt?.product.barcode).toBe('7890000001');

    expect(await getProductByCode('9999999999')).toBeNull();
  });

  it('respeita o limite de resultados', async () => {
    const products = Array.from({ length: 30 }, (_, i) =>
      makeProduct({ name: `Item ${String(i).padStart(2, '0')}` })
    );
    await db.products.bulkAdd(products);

    const results = await searchProducts('Item', null, 10);
    expect(results).toHaveLength(10);
  });
});
