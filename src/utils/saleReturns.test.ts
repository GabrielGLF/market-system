import { describe, it, expect } from 'vitest';
import { computePartialReturn } from './saleReturns';
import type { Sale } from '../types';

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    saleNumber: '100001',
    date: '2026-01-01T10:00:00.000Z',
    items: [
      { productId: 'p1', productName: 'Arroz 5kg', quantity: 2, unit: 'UN', unitPrice: 28.5, costPrice: 22, subtotal: 57, discount: 0, total: 57 },
      { productId: 'p2', productName: 'Feijão 1kg', quantity: 1, unit: 'UN', unitPrice: 8.5, costPrice: 6, subtotal: 8.5, discount: 0, total: 8.5 }
    ],
    subtotal: 65.5,
    discount: 0,
    total: 65.5,
    costTotal: 50,
    profit: 15.5,
    paymentMethods: [{ method: 'CASH', amount: 65.5 }],
    status: 'COMPLETED',
    ...overrides
  };
}

describe('computePartialReturn', () => {
  it('devolve parte de um item: reduz qtd/total/custo/lucro e repõe estoque', () => {
    const result = computePartialReturn(makeSale(), [{ productId: 'p1', quantity: 1 }], 'Cliente desistiu');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.refund).toBeCloseTo(28.5, 2);
    expect(result.adjustedSale.total).toBeCloseTo(37, 2);
    expect(result.adjustedSale.costTotal).toBeCloseTo(28, 2);
    expect(result.adjustedSale.profit).toBeCloseTo(9, 2);
    expect(result.adjustedSale.status).toBe('COMPLETED');
    expect(result.adjustedSale.items).toHaveLength(2);
    expect(result.adjustedSale.items[0]).toMatchObject({ quantity: 1, total: 28.5 });
    expect(result.paymentRefunds).toEqual([{ method: 'CASH', amount: 28.5 }]);
    expect(result.restocks).toEqual([
      expect.objectContaining({ productId: 'p1', quantity: 1, costPrice: 22 })
    ]);
    expect(result.fullyReturned).toBe(false);
    // A trilha de devolução fica registrada na venda
    expect(result.adjustedSale.refunds).toHaveLength(1);
    expect(result.adjustedSale.refundedAmount).toBeCloseTo(28.5, 2);
  });

  it('aplica desconto global proporcional ao reembolso', () => {
    const sale = makeSale({ discount: 5.5, total: 60, profit: 10 });
    const result = computePartialReturn(sale, [{ productId: 'p1', quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 28.5 × (60/65.5) = 26.11
    expect(result.refund).toBeCloseTo(26.11, 2);
    expect(result.adjustedSale.total).toBeCloseTo(33.89, 2);
    // total ajustado = subtotal ajustado - desconto ajustado
    expect(result.adjustedSale.subtotal - result.adjustedSale.discount).toBeCloseTo(result.adjustedSale.total, 2);
  });

  it('divide o reembolso proporcionalmente entre as formas de pagamento', () => {
    const sale = makeSale({
      items: [
        { productId: 'p1', productName: 'Item 1', quantity: 1, unit: 'UN', unitPrice: 50, costPrice: 30, subtotal: 50, discount: 0, total: 50 },
        { productId: 'p2', productName: 'Item 2', quantity: 1, unit: 'UN', unitPrice: 50, costPrice: 30, subtotal: 50, discount: 0, total: 50 }
      ],
      subtotal: 100,
      total: 100,
      costTotal: 60,
      profit: 40,
      paymentMethods: [
        { method: 'CASH', amount: 60 },
        { method: 'PIX', amount: 40 }
      ]
    });
    const result = computePartialReturn(sale, [{ productId: 'p1', quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 50 devolvidos de um total de 100 pagos 60/40 → 30 dinheiro + 20 pix
    expect(result.refund).toBeCloseTo(50, 2);
    expect(result.paymentRefunds).toContainEqual({ method: 'CASH', amount: 30 });
    expect(result.paymentRefunds).toContainEqual({ method: 'PIX', amount: 20 });
    // Formas de pagamento líquidas da venda
    const cash = result.adjustedSale.paymentMethods.find(p => p.method === 'CASH');
    const pix = result.adjustedSale.paymentMethods.find(p => p.method === 'PIX');
    expect(cash?.amount).toBeCloseTo(30, 2);
    expect(pix?.amount).toBeCloseTo(20, 2);
  });

  it('converte fração vendida para pacote no restock', () => {
    const sale = makeSale({
      items: [
        { productId: 'p3-alt', productName: 'Cigarro (Avulso)', quantity: 3, unit: 'Avulso', unitPrice: 1, costPrice: 0.425, subtotal: 3, discount: 0, total: 3, isAlternativeUnit: true, originalUnitFactor: 20 },
        { productId: 'p2', productName: 'Feijão 1kg', quantity: 1, unit: 'UN', unitPrice: 8.5, costPrice: 6, subtotal: 8.5, discount: 0, total: 8.5 }
      ],
      subtotal: 11.5,
      total: 11.5,
      costTotal: 7.275,
      profit: 4.225,
      paymentMethods: [{ method: 'PIX', amount: 11.5 }]
    });
    const result = computePartialReturn(sale, [{ productId: 'p3-alt', quantity: 3 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refund).toBeCloseTo(3, 2);
    // 3 avulsos com fator 20 → 0.15 pacotes de volta ao estoque
    expect(result.restocks).toEqual([
      expect.objectContaining({ productId: 'p3', quantity: 0.15, costPrice: 0.425 })
    ]);
    expect(result.adjustedSale.items).toHaveLength(1); // linha avulsa removida
  });

  it('devolução de todos os itens marca a venda como cancelada', () => {
    const result = computePartialReturn(makeSale(), [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 }
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fullyReturned).toBe(true);
    expect(result.adjustedSale.status).toBe('CANCELLED');
    expect(result.adjustedSale.items).toHaveLength(0);
    expect(result.adjustedSale.total).toBe(0);
    expect(result.refund).toBeCloseTo(65.5, 2);
  });

  it('não devolve mais do que foi vendido (clamp)', () => {
    const result = computePartialReturn(makeSale(), [{ productId: 'p1', quantity: 99 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refund).toBeCloseTo(57, 2); // linha inteira, não 99×
    expect(result.adjustedSale.items).toHaveLength(1);
  });

  it('aplica desconto por item proporcional na linha devolvida', () => {
    const sale = makeSale({
      items: [
        { productId: 'p1', productName: 'Item com desc', quantity: 2, unit: 'UN', unitPrice: 10, costPrice: 6, subtotal: 20, discount: 4, total: 16 },
        { productId: 'p2', productName: 'Item 2', quantity: 1, unit: 'UN', unitPrice: 8.5, costPrice: 6, subtotal: 8.5, discount: 0, total: 8.5 }
      ],
      subtotal: 24.5,
      total: 24.5,
      costTotal: 18,
      profit: 6.5,
      paymentMethods: [{ method: 'CASH', amount: 24.5 }]
    });
    const result = computePartialReturn(sale, [{ productId: 'p1', quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // preço efetivo por unidade com desconto = 16/2 = 8
    expect(result.refund).toBeCloseTo(8, 2);
    const remaining = result.adjustedSale.items.find(i => i.productId === 'p1');
    expect(remaining).toMatchObject({ quantity: 1, subtotal: 10, discount: 2, total: 8 });
  });

  it('retorna erro quando nenhum item é selecionado', () => {
    const result = computePartialReturn(makeSale(), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('retorna erro quando todas as quantidades são zero', () => {
    const result = computePartialReturn(makeSale(), [{ productId: 'p1', quantity: 0 }]);
    expect(result.ok).toBe(false);
  });

  it('rateia pelo valor LÍQUIDO do dinheiro (recebido − troco), não pelo bruto', () => {
    // Cupom de R$ 70 pago com R$ 100 em cash (troco 30): o líquido é 70.
    const sale = makeSale({
      items: [
        { productId: 'p1', productName: 'Item 1', quantity: 1, unit: 'UN', unitPrice: 35, costPrice: 20, subtotal: 35, discount: 0, total: 35 },
        { productId: 'p2', productName: 'Item 2', quantity: 1, unit: 'UN', unitPrice: 35, costPrice: 20, subtotal: 35, discount: 0, total: 35 }
      ],
      subtotal: 70,
      total: 70,
      costTotal: 40,
      profit: 30,
      paymentMethods: [{ method: 'CASH', amount: 100, details: { receivedAmount: 100, change: 30 } }]
    });
    const result = computePartialReturn(sale, [{ productId: 'p1', quantity: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Devolve metade do cupom (35) — pelo líquido 70/70, não pelo bruto 100/70 (=50).
    expect(result.refund).toBeCloseTo(35, 2);
    expect(result.paymentRefunds).toEqual([{ method: 'CASH', amount: 35 }]);
    expect(result.adjustedSale.paymentMethods.find(p => p.method === 'CASH')?.amount).toBeCloseTo(65, 2);
  });
});