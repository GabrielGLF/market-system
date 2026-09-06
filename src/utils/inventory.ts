import { db } from '../db';
import type { Product, StockMovement } from '../types';

/**
 * Motor de entrada/saída de estoque com CUSTO MÉDIO PONDERADO (weighted average
 * cost). É o método padrão do varejo brasileiro para CMV de mercearia: cada
 * compra recalcula o custo médio do produto e as vendas saem por esse custo.
 *
 * Fórmula da entrada:
 *   novoCustoMédio = (estoqueAntigo × custoMédioAntigo + qtdComprada × preçoCompra)
 *                    / (estoqueAntigo + qtdComprada)
 *
 * Toda gravação é ATÔMICA (transação Dexie): estoque, custo médio, movimentação
 * auditável e atualização do produto são confirmadas juntos — nunca há estoque
 * alterado sem movimentação correspondente, nem custo médio divergente do
 * histórico de movimentações.
 */

const round2 = (n: number) => Number(n.toFixed(2));
const round3 = (n: number) => Number(n.toFixed(3));

/** Tolerância para comparações de ponto flutuante em quantidades fracionadas. */
const EPS = 0.0001;

export interface StockInInput {
  productId: string;
  /** Quantidade em unidades de PACOTE/embalagem (frações devem vir convertidas). */
  quantity: number;
  /** Preço de compra por unidade desta entrada (unitCost). */
  unitCost: number;
  reason?: string;
  supplier?: string;
  invoiceNumber?: string;
  date?: string;
}

export interface StockOutInput {
  productId: string;
  quantity: number;
  reason: string;
  date?: string;
}

export interface StockAdjustInput {
  productId: string;
  /** Contagem física encontrada no balanço (novo estoque absoluto). */
  countedStock: number;
  reason: string;
  date?: string;
}

export interface StockMutationResult {
  movement: StockMovement;
  product: Product;
}

/**
 * Puro: novo custo médio ponderado após uma entrada. Testável isoladamente.
 * Estoque zero/negativo → o preço de compra vira o novo custo (recomeço limpo).
 */
export interface RepricingAlert {
  /** true = vale alertar (margem caiu abaixo do mínimo ou caiu bastante). */
  shouldAlert: boolean;
  /** Margem com o custo médio NOVO (após a compra), em %. */
  newMarginPct: number;
  /** Margem com o custo médio ANTES da compra, em %. */
  oldMarginPct: number;
  /** Queda de margem em pontos percentuais (positivo = caiu). */
  marginDropPp: number;
  /** Menor preço de venda que preserva a margem mínima, já arredondado p/ cima em centavos. */
  suggestedMinPrice: number;
  /** Motivo legível para exibir no toast/central. */
  message: string;
}

/**
 * Preço mínimo que preserva a margem alvo dado um custo:
 * preco = custo / (1 - margem/100). Arredonda PARA CIMA em centavos
 * (preço "quebrado" para baixo entregaria margem menor que a mínima).
 */
export function minPriceForMargin(cost: number, targetMarginPct: number): number {
  if (cost <= 0) return 0;
  if (targetMarginPct >= 100) return Number.MAX_SAFE_INTEGER;
  const raw = cost / (1 - targetMarginPct / 100);
  return Math.ceil(raw * 100) / 100;
}

/**
 * Avalia se uma compra merece alerta de reprecificação: a entrada pode ter
 * empurrado o custo médio para cima e comprimido a margem no preço atual.
 *
 * Regras (ambas devem valer para não barulhentar):
 *  - margem nova abaixo do mínimo (default 20%); OU queda > 5 p.p. de uma vez;
 *  - o preço de venda precisa ser > 0 (produto sem preço não se reprecifica).
 */
export function evaluateRepricing(
  sellPrice: number,
  oldAvgCost: number,
  newAvgCost: number,
  minMarginPct = 20,
  maxDropPp = 5
): RepricingAlert {
  const newMarginPct = sellPrice > 0 ? ((sellPrice - newAvgCost) / sellPrice) * 100 : 0;
  const oldMarginPct = sellPrice > 0 && oldAvgCost > 0 ? ((sellPrice - oldAvgCost) / sellPrice) * 100 : newMarginPct;
  const marginDropPp = oldMarginPct - newMarginPct;

  const belowMinimum = newMarginPct < minMarginPct;
  const bigDrop = marginDropPp > maxDropPp;
  const shouldAlert = sellPrice > 0 && newAvgCost > oldAvgCost && (belowMinimum || bigDrop);

  const suggestedMinPrice = minPriceForMargin(newAvgCost, minMarginPct);

  const message = shouldAlert
    ? `Margem caiu de ${oldMarginPct.toFixed(1)}% para ${newMarginPct.toFixed(1)}% com o novo custo médio. Mínimo sugerido: ${minPriceForMargin(newAvgCost, minMarginPct).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (margem ${minMarginPct}%).`
    : '';

  return { shouldAlert, newMarginPct, oldMarginPct, marginDropPp, suggestedMinPrice, message };
}

export function computeWeightedAverageCost(
  currentStock: number,
  currentAvgCost: number,
  incomingQty: number,
  incomingUnitCost: number
): number {
  if (incomingQty <= 0) return currentAvgCost;
  if (currentStock <= EPS) return round4(incomingUnitCost);
  return round4(
    (currentStock * currentAvgCost + incomingQty * incomingUnitCost) /
      (currentStock + incomingQty)
  );
}

const round4 = (n: number) => Number(n.toFixed(4));

/**
 * ENTRADA (compra/reposição): baixa custo médio ponderado, grava movimentação
 * IN auditável com o preço de compra e atualiza lastPurchase* no produto.
 */
export async function applyStockIn(input: StockInInput): Promise<StockMutationResult> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantidade de entrada deve ser maior que zero.');
  }
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) {
    throw new Error('Preço de compra deve ser zero ou positivo.');
  }

  const now = input.date || new Date().toISOString();

  return db.transaction('rw', [db.products, db.stockMovements], async () => {
    const product = await db.products.get(input.productId);
    if (!product) throw new Error('Produto não encontrado.');

    const previousStock = product.stock;
    const previousAvg = product.costPrice || 0;
    const newStock = round3(previousStock + input.quantity);
    const newAvgCost = computeWeightedAverageCost(previousStock, previousAvg, input.quantity, input.unitCost);
    const totalCost = round2(input.quantity * input.unitCost);

    await db.products.update(product.id, {
      stock: newStock,
      costPrice: newAvgCost,
      lastPurchaseCost: input.unitCost,
      lastPurchaseDate: now,
      ...(input.supplier ? { lastSupplier: input.supplier } : {}),
      updatedAt: now,
    });

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      type: 'IN',
      quantity: round3(input.quantity),
      previousStock,
      newStock,
      reason: input.reason || 'Compra / Reposição de Fornecedor',
      date: now,
      costPrice: input.unitCost,
      avgCostAfter: newAvgCost,
      totalCost,
      ...(input.supplier ? { supplier: input.supplier } : {}),
      ...(input.invoiceNumber ? { invoiceNumber: input.invoiceNumber } : {}),
    };
    await db.stockMovements.add(movement);

    // Snapshot coerente com o que foi gravado (inclui lastPurchase*)
    return {
      movement,
      product: {
        ...product,
        stock: newStock,
        costPrice: newAvgCost,
        lastPurchaseCost: input.unitCost,
        lastPurchaseDate: now,
        ...(input.supplier ? { lastSupplier: input.supplier } : {}),
      },
    };
  });
}

/**
 * SAÍDA AVULSA (avaria/vencimento/perda): sai pelo CUSTO MÉDIO atual — o valor
 * da perda é o que o produto custou de fato (média das compras), não um preço
 * estático de cadastro.
 */
export async function applyStockOut(input: StockOutInput): Promise<StockMutationResult> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error('Quantidade de saída deve ser maior que zero.');
  }

  const now = input.date || new Date().toISOString();

  return db.transaction('rw', [db.products, db.stockMovements], async () => {
    const product = await db.products.get(input.productId);
    if (!product) throw new Error('Produto não encontrado.');

    const previousStock = product.stock;
    if (input.quantity > previousStock + EPS) {
      throw new Error(
        `Estoque insuficiente para saída: "${product.name}" tem ${previousStock} ${product.unit} e a baixa é de ${input.quantity} ${product.unit}.`
      );
    }

    const avgCost = product.costPrice || 0;
    const newStock = round3(previousStock - input.quantity);

    await db.products.update(product.id, { stock: newStock, updatedAt: now });

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      type: 'OUT',
      quantity: round3(input.quantity),
      previousStock,
      newStock,
      reason: input.reason,
      date: now,
      costPrice: avgCost,
      avgCostAfter: avgCost,
      totalCost: round2(input.quantity * avgCost),
    };
    await db.stockMovements.add(movement);

    return { movement, product: { ...product, stock: newStock } };
  });
}

/**
 * AJUSTE DE BALANÇO: estoque físico divergente do sistema. A diferença é
 * registrada como perda/ganho pelo custo médio — o valor do ajuste fica
 * auditável no histórico de movimentações.
 */
export async function applyStockAdjust(input: StockAdjustInput): Promise<StockMutationResult> {
  if (!Number.isFinite(input.countedStock) || input.countedStock < 0) {
    throw new Error('Contagem física deve ser zero ou positiva.');
  }

  const now = input.date || new Date().toISOString();

  return db.transaction('rw', [db.products, db.stockMovements], async () => {
    const product = await db.products.get(input.productId);
    if (!product) throw new Error('Produto não encontrado.');

    const previousStock = product.stock;
    const avgCost = product.costPrice || 0;
    const newStock = round3(input.countedStock);
    const diff = round3(newStock - previousStock);

    if (Math.abs(diff) < EPS) {
      throw new Error('A contagem física é igual ao estoque do sistema — nada a ajustar.');
    }

    await db.products.update(product.id, { stock: newStock, updatedAt: now });

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      type: 'ADJUST',
      quantity: Math.abs(diff),
      previousStock,
      newStock,
      reason: input.reason,
      date: now,
      costPrice: avgCost,
      avgCostAfter: avgCost,
      totalCost: round2(Math.abs(diff) * avgCost),
    };
    await db.stockMovements.add(movement);

    return { movement, product: { ...product, stock: newStock } };
  });
}

/**
 * Custo médio ponderado do catálogo inteiro a partir das movimentações IN —
 * reconstrói o estado sem depender do costPrice atual do cadastro.
 * Útil para conferência e para relatórios de investimento.
 */
export async function computeInventoryValueFromMovements(): Promise<{
  byProduct: Map<string, { avgCost: number; stockFromMovements: number; invested: number }>;
  totalInvested: number;
}> {
  const products = await db.products.toArray();
  const map = new Map<string, { avgCost: number; stockFromMovements: number; invested: number }>();
  for (const p of products) map.set(p.id, { avgCost: p.costPrice || 0, stockFromMovements: 0, invested: 0 });

  await db.stockMovements.each(m => {
    const entry = map.get(m.productId);
    if (!entry) return;
    if (m.type === 'IN') {
      // Reconstrução do custo médio na mesma ordem cronológica das entradas
      entry.avgCost = computeWeightedAverageCost(entry.stockFromMovements, entry.avgCost, m.quantity, m.costPrice);
      entry.stockFromMovements = round3(entry.stockFromMovements + m.quantity);
      entry.invested += m.totalCost ?? round2(m.quantity * m.costPrice);
    } else if (m.type === 'OUT' || m.type === 'SALE' || m.type === 'ADJUST') {
      entry.stockFromMovements = round3(entry.stockFromMovements - m.quantity);
    } else if (m.type === 'RETURN') {
      entry.stockFromMovements = round3(entry.stockFromMovements + m.quantity);
    }
  });

  let totalInvested = 0;
  for (const e of map.values()) totalInvested += e.invested;
  return { byProduct: map, totalInvested: round2(totalInvested) };
}
