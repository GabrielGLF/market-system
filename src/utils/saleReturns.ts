import { db } from '../db';
import type { Sale, SaleItem, SaleRefund, SaleRefundItem, PaymentMethodEntry } from '../types';
import { toPackUnits } from './calc';

export interface ReturnRequestItem {
  /** productId do item NA VENDA (pode terminar em '-alt' para frações) */
  productId: string;
  /** quantidade a devolver, na unidade da venda */
  quantity: number;
}

export interface RestockInfo {
  productId: string;
  productName: string;
  /** quantidade em unidades de PACOTE (fracionados já convertidos) */
  quantity: number;
  unit: string;
  costPrice: number;
}

export type PartialReturnResult =
  | { ok: false; error: string }
  | {
      ok: true;
      refund: number;
      adjustedSale: Sale;
      restocks: RestockInfo[];
      paymentRefunds: PaymentMethodEntry[];
      returnedItems: SaleRefundItem[];
      fullyReturned: boolean;
    };

const round2 = (n: number) => Number(n.toFixed(2));
const round3 = (n: number) => Number(n.toFixed(3));

/**
 * Calcula uma devolução parcial de forma PURA (sem tocar no banco):
 * - ajusta os itens da venda (quantidade/total/custo/lucro);
 * - recalcula o reembolso proporcionalmente ao desconto global da venda;
 * - divide o reembolso proporcionalmente entre as formas de pagamento;
 * - converte quantidades fracionadas para pacotes no restock.
 *
 * A venda NÃO é modificada em memória: o resultado traz uma cópia ajustada.
 */
export function computePartialReturn(
  sale: Sale,
  requests: ReturnRequestItem[],
  reason: string = ''
): PartialReturnResult {
  if (!requests || requests.length === 0) {
    return { ok: false, error: 'Selecione ao menos um item para devolver.' };
  }

  // Soma pedidos repetidos do mesmo item (defensivo)
  const qtyByItem = new Map<string, number>();
  for (const r of requests) {
    if (!r || !r.productId) continue;
    const qty = Number.isFinite(r.quantity) ? r.quantity : 0;
    qtyByItem.set(r.productId, (qtyByItem.get(r.productId) || 0) + Math.max(0, qty));
  }

  const returnedItems: SaleRefundItem[] = [];
  const adjustedItems: SaleItem[] = [];
  let returnedItemTotal = 0;
  let returnedCost = 0;

  for (const item of sale.items) {
    const available = item.quantity;
    // Clamp: nunca devolver mais do que foi vendido na linha
    const returning = Math.min(Math.max(0, qtyByItem.get(item.productId) || 0), available);

    if (returning <= 0) {
      adjustedItems.push({ ...item });
      continue;
    }

    // Preço efetivo por unidade JÁ com desconto por item da linha
    const effectiveUnitPrice = item.quantity > 0 ? item.total / item.quantity : 0;
    const portionTotal = effectiveUnitPrice * returning;
    const portionCost = (item.costPrice || 0) * returning;
    returnedItemTotal += portionTotal;
    returnedCost += portionCost;

    returnedItems.push({
      productId: item.productId,
      productName: item.productName,
      quantity: round3(returning),
      unit: item.unit,
      amount: round2(portionTotal),
      costPrice: item.costPrice
    });

    const newQty = round3(available - returning);
    if (newQty > 0.0001) {
      const newSubtotal = round2(item.unitPrice * newQty);
      const newDiscount = available > 0
        ? round2((item.discount || 0) * (newQty / available))
        : 0;
      adjustedItems.push({
        ...item,
        quantity: newQty,
        subtotal: newSubtotal,
        discount: newDiscount,
        total: Math.max(0, round2(newSubtotal - newDiscount))
      });
    }
    // newQty <= 0: linha totalmente devolvida → removida dos itens
  }

  if (returnedItems.length === 0) {
    return { ok: false, error: 'Nenhuma quantidade foi selecionada para devolução.' };
  }

  const oldTotal = sale.total;
  const oldSubtotal = sale.subtotal;
  // Desconto global é proporcional: reembolso = itens devolvidos × (total / subtotal)
  const discountFactor = oldSubtotal > 0 ? oldTotal / oldSubtotal : 1;
  const refund = round2(returnedItemTotal * discountFactor);

  const newSubtotal = adjustedItems.reduce((acc, i) => acc + i.subtotal, 0);
  const newCostTotal = round2((sale.costTotal || 0) - returnedCost);
  const newTotal = round2(oldTotal - refund);
  const newDiscount = Math.max(0, round2(newSubtotal - newTotal));
  const newProfit = round2(newTotal - newCostTotal);

  // Reembolso proporcional entre as formas de pagamento originais
  const paymentRefunds: PaymentMethodEntry[] = [];
  if (oldTotal > 0 && refund > 0) {
    const shares = sale.paymentMethods.map(pm => ({
      method: pm.method,
      amount: round2(refund * (pm.amount / oldTotal))
    }));
    const assigned = shares.reduce((acc, s) => acc + s.amount, 0);
    const diff = round2(refund - assigned);
    if (diff !== 0 && shares.length > 0) {
      // Ajusta os centavos restantes na maior parcela para fechar exato
      let maxIdx = 0;
      shares.forEach((s, i) => { if (s.amount > shares[maxIdx].amount) maxIdx = i; });
      shares[maxIdx].amount = round2(shares[maxIdx].amount + diff);
    }
    for (const s of shares) {
      if (s.amount > 0) paymentRefunds.push({ method: s.method, amount: s.amount });
    }
  }

  // Formas de pagamento LÍQUIDAS: um estorno posterior usa estes valores,
  // senão o fiado/ caixa seriam revertidos duas vezes.
  const newPaymentMethods = sale.paymentMethods
    .map(pm => {
      const share = paymentRefunds.find(p => p.method === pm.method)?.amount || 0;
      return { ...pm, amount: round2(pm.amount - share) };
    })
    .filter(pm => pm.amount > 0);

  const fullyReturned = adjustedItems.length === 0;
  const now = new Date().toISOString();

  const refundRecord: SaleRefund = {
    id: crypto.randomUUID(),
    saleId: sale.id,
    date: now,
    reason,
    amount: refund,
    items: returnedItems,
    paymentRefunds,
    cashierSessionId: sale.cashierSessionId
  };

  const adjustedSale: Sale = {
    ...sale,
    items: adjustedItems,
    subtotal: newSubtotal,
    discount: newDiscount,
    total: newTotal,
    costTotal: newCostTotal,
    profit: newProfit,
    paymentMethods: newPaymentMethods,
    status: fullyReturned ? 'CANCELLED' : 'COMPLETED',
    ...(fullyReturned
      ? { cancelReason: reason, cancelledAt: now }
      : {}),
    refunds: [...(sale.refunds || []), refundRecord],
    refundedAmount: round2((sale.refundedAmount || 0) + refund)
  };

  // Reposição de estoque (frações convertidas para pacote)
  const restocks: RestockInfo[] = returnedItems.map(ri => {
    const saleItem = sale.items.find(i => i.productId === ri.productId);
    const factor = saleItem?.isAlternativeUnit ? saleItem.originalUnitFactor : undefined;
    return {
      productId: ri.productId.replace('-alt', ''),
      productName: ri.productName,
      quantity: toPackUnits(ri.quantity, factor),
      unit: saleItem?.unit || ri.unit,
      costPrice: ri.costPrice
    };
  });

  return {
    ok: true,
    refund,
    adjustedSale,
    restocks,
    paymentRefunds,
    returnedItems,
    fullyReturned
  };
}

/**
 * Executa a devolução parcial em UMA transação atômica:
 * venda ajustada + reembolso, estoque reposto com movimentações RETURN,
 * totais do caixa revertidos proporcionalmente e fiado do cliente reduzido.
 * Qualquer falha desfaz tudo.
 */
export async function applyPartialReturn(
  sale: Sale,
  requests: ReturnRequestItem[],
  reason: string
): Promise<Extract<PartialReturnResult, { ok: true }>> {
  if (!reason.trim()) {
    throw new Error('Informe o motivo da devolução.');
  }

  const computed = computePartialReturn(sale, requests, reason);
  if (!computed.ok) {
    throw new Error(computed.error);
  }

  const { adjustedSale, restocks, paymentRefunds, refund } = computed;
  const now = new Date().toISOString();
  const cashRefund = paymentRefunds.find(p => p.method === 'CASH')?.amount || 0;
  const fiadoRefund = paymentRefunds.find(p => p.method === 'FIADO')?.amount || 0;

  await db.transaction('rw', [db.sales, db.products, db.stockMovements, db.customers, db.debtRecords, db.cashSessions], async () => {
    // 1. Venda ajustada (itens/totais/pagamentos líquidos + trilha de devoluções)
    // put() substitui o registro inteiro com o mesmo id (update() só aceita UpdateSpec)
    await db.sales.put(adjustedSale);

    // 2. Repor estoque com movimentação RETURN auditável
    for (const r of restocks) {
      const product = await db.products.get(r.productId);
      if (!product) continue; // produto removido do cadastro: não há estoque para repor
      const previousStock = product.stock;
      const newStock = round3(previousStock + r.quantity);
      await db.products.update(product.id, { stock: newStock, updatedAt: now });
      await db.stockMovements.add({
        id: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        type: 'RETURN',
        quantity: round3(r.quantity),
        previousStock,
        newStock,
        reason: `Devolução parcial da venda #${sale.saleNumber}: ${reason}`,
        date: now,
        userId: 'Admin',
        costPrice: r.costPrice
      });
    }

    // 3. Reverter totais do caixa da sessão da venda (proporcional ao reembolso)
    if (sale.cashierSessionId) {
      const session = await db.cashSessions.get(sale.cashierSessionId);
      if (session) {
        const totals = { ...session.totalSales };
        for (const p of paymentRefunds) {
          if (p.method === 'CASH') totals.cash = round2(totals.cash - p.amount);
          else if (p.method === 'PIX') totals.pix = round2(totals.pix - p.amount);
          else if (p.method === 'CREDIT_CARD') totals.credit = round2(totals.credit - p.amount);
          else if (p.method === 'DEBIT_CARD') totals.debit = round2(totals.debit - p.amount);
          else if (p.method === 'FIADO') totals.fiado = round2(totals.fiado - p.amount);
          else if (p.method === 'VOUCHER') totals.voucher = round2(totals.voucher - p.amount);
        }
        totals.total = round2(totals.total - refund);
        await db.cashSessions.update(session.id, {
          totalSales: totals,
          expectedCashInDrawer: round2(session.expectedCashInDrawer - cashRefund)
        });
      }
    }

    // 4. Reduzir fiado do cliente (reembolso em caderneta não sai da gaveta)
    if (fiadoRefund > 0 && sale.customerId) {
      const customer = await db.customers.get(sale.customerId);
      if (customer) {
        const newBalance = round2(customer.debtBalance - fiadoRefund);
        await db.customers.update(customer.id, { debtBalance: newBalance, updatedAt: now });
        await db.debtRecords.add({
          id: crypto.randomUUID(),
          customerId: customer.id,
          saleId: sale.id,
          type: 'PAYMENT',
          amount: fiadoRefund,
          previousBalance: customer.debtBalance,
          newBalance,
          date: now,
          description: `Devolução parcial da venda #${sale.saleNumber}`,
          receiptNumber: sale.saleNumber
        });
      }
    }
  });

  return computed;
}