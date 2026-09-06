import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import {
  computeWeightedAverageCost,
  applyStockIn,
  applyStockOut,
  applyStockAdjust,
} from './inventory';
import type { Product } from '../types';

/**
 * Testes do motor de estoque com custo médio ponderado.
 * Cobre: fórmula pura, entradas com atualização de custo, saídas pelo custo
 * médio, balanço e validações de impossibilidade.
 */

const nowIso = () => new Date().toISOString();

async function seedProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const p: Product = {
    id: crypto.randomUUID(),
    name: 'Refrigerante 2L',
    sku: 'REF-2L',
    barcode: String(Math.floor(1e12 + Math.random() * 9e12)),
    categoryId: 'cat-1',
    costPrice: 0,
    sellPrice: 10,
    stock: 0,
    minStock: 2,
    unit: 'UN',
    isActive: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
  await db.products.add(p);
  return p;
}

beforeEach(async () => {
  await db.products.clear();
  await db.stockMovements.clear();
});

describe('computeWeightedAverageCost (puro)', () => {
  it('média ponderada clássica entre estoque atual e compra', () => {
    // 10 un a R$4 + 10 un a R$6 = 20 un a R$5
    expect(computeWeightedAverageCost(10, 4, 10, 6)).toBe(5);
  });

  it('pondera corretamente quando as quantidades diferem', () => {
    // 30 un a R$2 + 10 un a R$6 = 40 un → (60+60)/40 = 3
    expect(computeWeightedAverageCost(30, 2, 10, 6)).toBe(3);
  });

  it('estoque zero: preço da compra vira o novo custo', () => {
    expect(computeWeightedAverageCost(0, 9, 5, 7.5)).toBe(7.5);
  });

  it('estoque negativo (inconsistência histórica): recomeça pelo preço da compra', () => {
    expect(computeWeightedAverageCost(-3, 4, 5, 6)).toBe(6);
  });

  it('compra de quantidade zero não altera o custo', () => {
    expect(computeWeightedAverageCost(10, 4, 0, 100)).toBe(4);
  });
});

describe('applyStockIn (entrada de compra)', () => {
  it('atualiza estoque, custo médio, lastPurchase e grava movimentação auditável', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 4 });

    const { movement, product } = await applyStockIn({
      productId: p.id,
      quantity: 10,
      unitCost: 6,
      supplier: 'Distribuidora ABC',
      invoiceNumber: '123',
    });

    expect(product.stock).toBe(20);
    expect(product.costPrice).toBe(5); // (10×4 + 10×6)/20
    expect(product.lastPurchaseCost).toBe(6);
    expect(product.lastSupplier).toBe('Distribuidora ABC');

    expect(movement.type).toBe('IN');
    expect(movement.costPrice).toBe(6);
    expect(movement.avgCostAfter).toBe(5);
    expect(movement.totalCost).toBe(60);
    expect(movement.supplier).toBe('Distribuidora ABC');
    expect(movement.invoiceNumber).toBe('123');
    expect(movement.previousStock).toBe(10);
    expect(movement.newStock).toBe(20);

    // Persistido no banco
    const dbP = await db.products.get(p.id);
    expect(dbP?.costPrice).toBe(5);
    expect((await db.stockMovements.toArray())).toHaveLength(1);
  });

  it('segunda compra posterior repondera sobre o custo médio vigente', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 4 });

    await applyStockIn({ productId: p.id, quantity: 10, unitCost: 6 }); // média → 5
    const { product } = await applyStockIn({ productId: p.id, quantity: 20, unitCost: 3 });
    // (20 × 5 + 20 × 3) / 40 = 4
    expect(product.costPrice).toBe(4);
  });

  it('rejeita quantidade não positiva e custo negativo', async () => {
    const p = await seedProduct();
    await expect(applyStockIn({ productId: p.id, quantity: 0, unitCost: 5 })).rejects.toThrow();
    await expect(applyStockIn({ productId: p.id, quantity: 5, unitCost: -1 })).rejects.toThrow();
  });

  it('rejeita produto inexistente sem deixar movimentação órfã', async () => {
    await expect(applyStockIn({ productId: 'inexistente', quantity: 1, unitCost: 1 })).rejects.toThrow();
    expect(await db.stockMovements.count()).toBe(0);
  });
});

describe('applyStockOut (saída por perda)', () => {
  it('sai pelo custo médio e registra o valor da perda', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 5 });

    const { movement, product } = await applyStockOut({
      productId: p.id,
      quantity: 4,
      reason: 'Avaria',
    });

    expect(product.stock).toBe(6);
    expect(movement.type).toBe('OUT');
    expect(movement.costPrice).toBe(5);      // custo médio, não outro valor
    expect(movement.avgCostAfter).toBe(5);   // saída não muda a média
    expect(movement.totalCost).toBe(20);     // perda em R$
  });

  it('rejeita saída maior que o estoque sem mutar nada', async () => {
    const p = await seedProduct({ stock: 3, costPrice: 5 });
    await expect(applyStockOut({ productId: p.id, quantity: 4, reason: 'x' })).rejects.toThrow();
    const dbP = await db.products.get(p.id);
    expect(dbP?.stock).toBe(3);
    expect(await db.stockMovements.count()).toBe(0);
  });
});

describe('applyStockAdjust (balanço)', () => {
  it('sobra física registra ganho pelo custo médio', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 4 });
    const { movement, product } = await applyStockAdjust({
      productId: p.id,
      countedStock: 12,
      reason: 'Balanço',
    });
    expect(product.stock).toBe(12);
    expect(movement.quantity).toBe(2);
    expect(movement.totalCost).toBe(8);
  });

  it('falta física registra perda pelo custo médio', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 4 });
    const { movement } = await applyStockAdjust({
      productId: p.id,
      countedStock: 7,
      reason: 'Balanço',
    });
    expect(movement.quantity).toBe(3);
    expect(movement.totalCost).toBe(12);
  });

  it('contagem igual ao sistema é rejeitada (nada a ajustar)', async () => {
    const p = await seedProduct({ stock: 10, costPrice: 4 });
    await expect(applyStockAdjust({ productId: p.id, countedStock: 10, reason: 'x' })).rejects.toThrow();
  });
});
