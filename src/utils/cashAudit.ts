import type { CashMovement, Sale } from '../types';

/**
 * Auditoria de fechamento de caixa: reconstrói LINHA A LINHA como o valor
 * esperado na gaveta se formou — fundo inicial, cada venda em dinheiro,
 * suprimentos e sangrias — com saldo acumulado. Responde "de onde veio o
 * esperado?" sem depender de confiança cega nos totais agregados.
 *
 * Função PURA (testável): recebe os dados já carregados, devolve a timeline.
 */

export interface CashAuditEntry {
  /** Ordem cronológica (1 = fundo inicial). */
  seq: number;
  time: string;
  kind: 'OPENING' | 'SALE' | 'SUPPLY' | 'BLEED';
  /** Descrição legível: "Venda #V-123" / "Suprimento — troco" / "Sangria". */
  label: string;
  /** Quanto esta linha somou/subtraiu da gaveta. */
  delta: number;
  /** Saldo acumulado da gaveta após esta linha. */
  runningBalance: number;
}

export interface CashAuditResult {
  entries: CashAuditEntry[];
  /** Saldo final reconstruído linha a linha. */
  rebuiltExpected: number;
  /** Valor que o sistema armazenou como esperado (para comparar). */
  storedExpected: number;
  /** rebuiltExpected − storedExpected: 0 = reconstrução bate com os totais. */
  reconstructionGap: number;
}

export function buildCashAudit(
  openingBalance: number,
  sales: Sale[],
  movements: CashMovement[],
  storedExpected: number
): CashAuditResult {
  interface RawEntry {
    time: string;
    kind: CashAuditEntry['kind'];
    label: string;
    delta: number;
  }

  const raw: RawEntry[] = [
    { time: '', kind: 'OPENING', label: 'Fundo inicial (abertura)', delta: openingBalance },
  ];

  // Vendas em dinheiro: o que entrou de cash é max(0, recebido − troco).
  // O registro da venda não guarda netCash explicitamente; recompõe do
  // pagamento CASH (receivedAmount quando existir) menos o troco proporcional.
  for (const sale of sales) {
    if (sale.status === 'CANCELLED') continue;
    const cashPm = sale.paymentMethods?.find(pm => pm.method === 'CASH');
    if (!cashPm) continue;

    const cashAmount =
      cashPm.details?.receivedAmount != null
        ? cashPm.details.receivedAmount
        : cashPm.amount;
    // Troco: o gravado no pagamento; fallback = diferença recebido − líquido.
    const change =
      cashPm.details?.change ??
      Math.max(0, cashAmount - cashPm.amount);
    const netCash = Math.max(0, cashAmount - change);

    raw.push({
      time: sale.date,
      kind: 'SALE',
      label: `Venda #${sale.saleNumber}`,
      delta: round2(netCash),
    });
  }

  for (const mv of movements) {
    raw.push({
      time: mv.date,
      kind: mv.type,
      label: mv.type === 'SUPPLY' ? `Suprimento — ${mv.reason}` : `Sangria — ${mv.reason}`,
      delta: mv.type === 'SUPPLY' ? round2(mv.amount) : -round2(mv.amount),
    });
  }

  // Cronológico (fundo inicial sempre primeiro; datas ISO ordenam lexicograficamente).
  raw.sort((a, b) => {
    if (a.kind === 'OPENING') return -1;
    if (b.kind === 'OPENING') return 1;
    return a.time.localeCompare(b.time);
  });

  let running = 0;
  const entries: CashAuditEntry[] = raw.map((e, i) => {
    running = round2(running + e.delta);
    return {
      seq: i + 1,
      time: e.time,
      kind: e.kind,
      label: e.label,
      delta: e.delta,
      runningBalance: running,
    };
  });

  const rebuiltExpected = running;
  return {
    entries,
    rebuiltExpected,
    storedExpected: round2(storedExpected),
    reconstructionGap: round2(rebuiltExpected - storedExpected),
  };
}

function round2(v: number): number {
  return Number(v.toFixed(2));
}
