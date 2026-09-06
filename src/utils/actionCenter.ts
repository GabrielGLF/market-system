import { db } from '../db';
import type { Product, CashSession } from '../types';
import { loadCompletedSalesBetween, buildSalesVelocity, periodStartIso } from './analytics';
import { getLastBackupAgeHours } from './cloudBackup';
import { minPriceForMargin } from './inventory';

/**
 * Central de Ações — responde "o que precisa de atenção HOJE?".
 *
 * Tudo é CALCULADO dos dados reais (sem tabelas novas, sem inventar métrica).
 * Cada item é acionável: navega para a tela que resolve o problema.
 */

export type ActionSeverity = 'critical' | 'warning' | 'info';

export interface ActionItem {
  id: string;
  severity: ActionSeverity;
  /** Título curto: "6 produtos sem estoque". */
  title: string;
  /** Detalhe: nomes/valores que dão contexto sem abrir a outra tela. */
  detail: string;
  /** Rota da tela que resolve a ação. */
  target: string;
}

const MIN_MARGIN_PCT = 20;

export async function buildActionItems(): Promise<ActionItem[]> {
  const items: ActionItem[] = [];

  // --- Estoque: críticos e sugestões de compra -----------------------------
  const products = (await db.products.toArray()).filter(p => p.isActive);
  const outOfStock = products.filter(p => p.stock <= 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= p.minStock);

  if (outOfStock.length > 0) {
    items.push({
      id: 'stock-out',
      severity: 'critical',
      title: `${outOfStock.length} ${outOfStock.length === 1 ? 'produto sem estoque' : 'produtos sem estoque'}`,
      detail: outOfStock.slice(0, 3).map(p => p.name).join(', ') + (outOfStock.length > 3 ? ` +${outOfStock.length - 3}` : ''),
      target: 'inventory',
    });
  }
  if (lowStock.length > 0) {
    items.push({
      id: 'stock-low',
      severity: 'warning',
      title: `${lowStock.length} com estoque abaixo do mínimo`,
      detail: lowStock.slice(0, 3).map(p => p.name).join(', ') + (lowStock.length > 3 ? ` +${lowStock.length - 3}` : ''),
      target: 'inventory',
    });
  }

  // --- Sugestão de compra por velocidade de venda (30 dias) ----------------
  try {
    const sales30d = await loadCompletedSalesBetween(periodStartIso('30d'));
    const velocity = buildSalesVelocity(sales30d);
    const restock: { name: string; qty: number }[] = [];
    for (const p of products) {
      const sold30d = velocity.get(p.id) || 0;
      const dailyAvg = sold30d / 30;
      if (dailyAvg <= 0) continue;
      const coverageDays = p.stock / dailyAvg;
      const orderQty = Math.ceil(dailyAvg * 7 + p.minStock - p.stock);
      if (coverageDays < 7 && orderQty > 0) {
        restock.push({ name: p.name, qty: orderQty });
      }
    }
    if (restock.length > 0) {
      items.push({
        id: 'restock',
        severity: 'warning',
        title: `Comprar em até 7 dias: ${restock.length} ${restock.length === 1 ? 'produto' : 'produtos'}`,
        detail: restock.slice(0, 3).map(r => `${r.name} (+${r.qty})`).join(', ') + (restock.length > 3 ? ` +${restock.length - 3}` : ''),
        target: 'movements',
      });
    }
  } catch {
    // Sem histórico suficiente — sem sugestão de compra.
  }

  // --- Preços defasados: margem abaixo do mínimo com o custo atual ---------
  const stalePrices = products.filter(
    p => p.sellPrice > 0 && p.costPrice > 0 && ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 < MIN_MARGIN_PCT
  );
  if (stalePrices.length > 0) {
    const worst = stalePrices
      .map(p => ({ p, margin: ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 }))
      .sort((a, b) => a.margin - b.margin)[0];
    items.push({
      id: 'stale-prices',
      severity: 'warning',
      title: `${stalePrices.length} ${stalePrices.length === 1 ? 'produto com margem baixa' : 'produtos com margem baixa'}`,
      detail: `Pior: ${worst.p.name} (${worst.margin.toFixed(1)}% — mínimo sugerido ${minPriceForMargin(worst.p.costPrice, MIN_MARGIN_PCT).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
      target: 'pricing',
    });
  }

  // --- Fiado a receber ------------------------------------------------------
  const customers = await db.customers.toArray();
  const debtors = customers.filter(c => c.debtBalance > 0).sort((a, b) => b.debtBalance - a.debtBalance);
  const totalDebt = debtors.reduce((acc, c) => acc + c.debtBalance, 0);
  if (debtors.length > 0) {
    items.push({
      id: 'fiado',
      severity: debtors.some(c => c.debtBalance > 200) ? 'warning' : 'info',
      title: `Fiado a receber: ${totalDebt.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
      detail: `${debtors.length} ${debtors.length === 1 ? 'cliente' : 'clientes'} — maior: ${debtors[0].name} (${debtors[0].debtBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
      target: 'customers',
    });
  }

  // --- Backup (proteção dos dados) -----------------------------------------
  const backupAge = getLastBackupAgeHours();
  if (backupAge === null) {
    items.push({
      id: 'backup-never',
      severity: 'info',
      title: 'Nenhum backup na nuvem ainda',
      detail: 'Exporte um backup em arquivo ou conecte a nuvem em Configurações.',
      target: 'settings',
    });
  } else if (backupAge > 72) {
    items.push({
      id: 'backup-stale',
      severity: 'warning',
      title: `Último backup: há ${Math.floor(backupAge / 24)}d`,
      detail: 'Faça um backup em Configurações → Backup agora.',
      target: 'settings',
    });
  }

  // --- Último fechamento de caixa com diferença -----------------------------
  try {
    const lastClosed = await db.cashSessions
      .where('status')
      .equals('CLOSED')
      .last();
    const closed = lastClosed as CashSession | undefined;
    if (closed && closed.difference != null && Math.abs(closed.difference) >= 0.01) {
      items.push({
        id: 'cash-diff',
        severity: Math.abs(closed.difference) > 20 ? 'critical' : 'warning',
        title: `Caixa fechou com diferença de ${closed.difference.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        detail: `Fechamento ${closed.closedAt ? new Date(closed.closedAt).toLocaleDateString('pt-BR') : ''} — veja a auditoria linha a linha no Caixa.`,
        target: 'cash',
      });
    }
  } catch {
    // Sem sessões fechadas — nada a reportar.
  }

  // Ordem: críticos primeiro, depois avisos, depois informativos.
  const order: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
