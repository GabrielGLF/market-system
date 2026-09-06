import { db } from '../db';
import type { Product, Sale, StockMovement } from '../types';

/**
 * Camada de estatísticas de vendas/estoque desenhada para escalar.
 *
 * Problema que resolve: as telas (Dashboard, Financeiro, Histórico) carregavam
 * a tabela de vendas INTEIRA via `toArray()` para agregar. Com meses de uso,
 * isso são dezenas de milhares de registros → memória + jank a cada re-render
 * (o useLiveQuery re-executa a cada gravação em qualquer tabela observada).
 *
 * Abordagem: consultar por janela de data usando o índice `date` do Dexie e
 * agregar em UMA passada, expondo Mapas pré-computados. A UI só itera sobre
 * o recorte necessário — o custo cresce com a janela exibida, não com o
 * tamanho do histórico.
 */

const MAX_ISO_UPPER_BOUND = '9999-99-99T99:99:99.999Z';
const MIN_ISO_LOWER_BOUND = '0000-00-00T00:00:00.000Z';

/** Pega "2026-09-06T12:34:56.789Z" → "2026-09-06". */
export const isoDay = (iso: string): string => iso.slice(0, 10);

/** Dia local (fuso do comércio) em formato ISO-day. */
export const localDayIso = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Instante UTC (ISO) da meia-noite LOCAL de hoje menos `daysAgo` dias.
 * As vendas são gravadas com `new Date().toISOString()` (UTC), então os
 * limites de janela precisam ser instantes UTC — não "meia-noite UTC".
 */
export const localMidnightIso = (daysAgo = 0): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

/** Instante UTC (ISO) da meia-noite LOCAL do dia `dayIso` ("2026-09-06" ou um instante ISO completo — só os 10 primeiros caracteres são usados). */
export const dayStartIso = (dayIso: string): string => {
  const [y, m, d] = dayIso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
};

/** Instante UTC (ISO) da meia-noite LOCAL do dia SEGUINTE a `dayIso` (exclusivo). */
export const dayEndIso = (dayIso: string): string => {
  const [y, m, d] = dayIso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
};

/**
 * Vendas CONCLUÍDAS entre dois instantes ISO [from, to) via índice `date`.
 * Vendas fora da janela nunca são lidas. `to` omitido = até o infinito.
 */
export function loadCompletedSalesBetween(fromIso: string, toIso?: string) {
  const range = db.sales.where('date').between(
    fromIso,
    toIso ?? MAX_ISO_UPPER_BOUND,
    true,
    false
  );
  return range.and(s => s.status === 'COMPLETED').toArray();
}

/** Toda a tabela de vendas concluídas — use só quando o histórico inteiro for necessário. */
export function loadAllCompletedSales() {
  return db.sales.filter(s => s.status === 'COMPLETED').toArray();
}

/** Vendas de QUALQUER status entre dois instantes ISO [from, to) — para telas com filtro de status. */
export function loadSalesBetween(fromIso: string, toIso?: string, opts?: { desc?: boolean }) {
  let q = db.sales.where('date').between(fromIso, toIso ?? MAX_ISO_UPPER_BOUND, true, false);
  if (opts?.desc) q = q.reverse();
  return q.toArray();
}

export type SalesPeriod = 'today' | '7d' | '30d' | 'month' | 'year' | 'all';

/**
 * Instante ISO inicial de um período de negócio (dias LOCAIS — o comércio
 * pensa em "hoje" no fuso da loja, não em dias UTC). 'all' volta ao mínimo.
 */
export function periodStartIso(period: SalesPeriod): string {
  const now = new Date();
  switch (period) {
    case 'today':
      return localMidnightIso(0);
    case '7d':
      return localMidnightIso(6);
    case '30d':
      return localMidnightIso(29);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case 'year':
      return new Date(now.getFullYear(), 0, 1).toISOString();
    default:
      return '0000-00-00T00:00:00.000Z';
  }
}

export interface DaySalesAgg {
  /** Faturamento bruto (soma dos totals). */
  revenue: number;
  /** Lucro estimado (soma de profit). */
  profit: number;
  /** CMV do dia (soma de costTotal). */
  cost: number;
  /** Número de vendas concluídas. */
  count: number;
  /** Itens vendidos (soma das quantidades). */
  items: number;
  /** Valor por forma de pagamento (ex: PIX → 120). */
  byMethod: Map<string, number>;
  /** Nº de vendas por hora do dia (índice 0-23). */
  byHour: number[];
}

const emptyDayAgg = (): DaySalesAgg => ({
  revenue: 0,
  profit: 0,
  cost: 0,
  count: 0,
  items: 0,
  byMethod: new Map(),
  byHour: new Array<number>(24).fill(0),
});

function aggDay(agg: DaySalesAgg, sale: Sale): void {
  agg.revenue += sale.total;
  agg.profit += sale.profit || 0;
  agg.cost += sale.costTotal || 0;
  agg.count += 1;
  for (const item of sale.items) agg.items += item.quantity;
  for (const pm of sale.paymentMethods) {
    agg.byMethod.set(pm.method, (agg.byMethod.get(pm.method) || 0) + pm.amount);
  }
  agg.byHour[new Date(sale.date).getHours()] += 1;
}

/**
 * Agregações diárias das vendas em UMA passada O(n).
 * `keyOf` agrupa por outro critério se necessário (padrão: dia ISO da venda).
 */
export function aggregateByDay(
  sales: Sale[],
  keyOf: (s: Sale) => string = s => isoDay(s.date)
): Map<string, DaySalesAgg> {
  const map = new Map<string, DaySalesAgg>();
  for (const sale of sales) {
    const k = keyOf(sale);
    const agg = map.get(k) || emptyDayAgg();
    aggDay(agg, sale);
    map.set(k, agg);
  }
  return map;
}

/**
 * Vendas concluídas agrupadas por productId cru (remove sufixo "-alt").
 * Quantidades de unidade alternativa viram equivalente em pacotes, mesmo
 * critério usado na baixa de estoque.
 */
export function buildSalesVelocity(sales: Sale[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const rawId = item.productId.replace('-alt', '');
      const qty = item.isAlternativeUnit && item.originalUnitFactor
        ? item.quantity / item.originalUnitFactor
        : item.quantity;
      map.set(rawId, (map.get(rawId) || 0) + qty);
    }
  }
  return map;
}

/** Movimentações de estoque entre dois instantes ISO [from, to) via índice `date`. */
export function loadStockMovementsBetween(fromIso: string, toIso?: string, opts?: { desc?: boolean }) {
  let q = db.stockMovements.where('date').between(fromIso, toIso ?? MAX_ISO_UPPER_BOUND, true, false);
  if (opts?.desc) q = q.reverse();
  return q.toArray();
}

/** Produtos ativos (filtro cursorial — booleano não é chave indexável no IndexedDB). */
export function loadActiveProducts(): Promise<Product[]> {
  return db.products.filter(p => p.isActive).toArray();
}

/** Produtos ativos com estoque <= threshold (alerta de reposição), via índice `stock`. */
export function loadLowStockProducts(threshold: number): Promise<Product[]> {
  return db.products
    .where('stock')
    .belowOrEqual(threshold)
    .and(p => p.isActive)
    .toArray();
}

/** Vendas concluídas de um cliente via índice `customerId`. */
export function loadCustomerCompletedSales(customerId: string) {
  return db.sales
    .where('customerId')
    .equals(customerId)
    .and(s => s.status === 'COMPLETED')
    .toArray();
}

/**
 * Estatísticas de TODOS os clientes em UMA passada O(vendas) usando o índice
 * `customerId`. Substitui o padrão O(clientes × vendas) que filtrava a lista
 * completa de vendas dentro do loop de clientes.
 */
export async function buildCustomerStats(): Promise<Map<string, { totalPurchased: number; salesCount: number }>> {
  const map = new Map<string, { totalPurchased: number; salesCount: number }>();
  await db.sales.each(s => {
    if (s.status !== 'COMPLETED' || !s.customerId) return;
    const cur = map.get(s.customerId) || { totalPurchased: 0, salesCount: 0 };
    cur.totalPurchased += s.total;
    cur.salesCount += 1;
    map.set(s.customerId, cur);
  });
  return map;
}

/**
 * Últimas `limit` vendas (qualquer status — paridade com a lista anterior do
 * dashboard), via índice `date` reverso. Não materializa o histórico.
 */
export function loadRecentSales(limit: number) {
  return db.sales
    .where('date')
    .between(MIN_ISO_LOWER_BOUND, MAX_ISO_UPPER_BOUND, true, false)
    .reverse()
    .limit(limit)
    .toArray();
}

/**
 * Movimentações agregadas por tipo em uma passada — substitui os múltiplos
 * `.filter()` encadeados por tipo na tela de fluxo de estoque.
 */
export function aggregateMovementsByType(movements: StockMovement[]): Map<string, { qty: number; value: number }> {
  const map = new Map<string, { qty: number; value: number }>();
  for (const m of movements) {
    const cur = map.get(m.type) || { qty: 0, value: 0 };
    cur.qty += m.quantity;
    // totalCost = valor real da linha (preço pago na entrada, custo médio na baixa)
    cur.value += m.totalCost ?? (m.quantity * (m.costPrice || 0));
    map.set(m.type, cur);
  }
  return map;
}

/** Mapa id → produto para lookups O(1) dentro de loops de agregação (antes: Array.find dentro de forEach = O(vendas × produtos)). */
export function productByIdMap(products: Product[]): Map<string, Product> {
  return new Map(products.map(p => [p.id, p]));
}
