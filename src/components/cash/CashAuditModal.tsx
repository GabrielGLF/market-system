import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import type { CashSession } from '../../types';
import { X, ScrollText } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../../utils/format';
import { buildCashAudit, type CashAuditResult } from '../../utils/cashAudit';

interface CashAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CashSession;
}

/**
 * Auditoria de fechamento de caixa: reconstrói linha a linha como o valor
 * esperado na gaveta se formou — fundo inicial, cada venda em dinheiro,
 * suprimentos e sangrias — e compara com o esperado armazenado.
 */
export function CashAuditModal({ isOpen, onClose, session }: CashAuditModalProps) {
  const [audit, setAudit] = useState<CashAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    (async () => {
      try {
        const [sales, movements] = await Promise.all([
          db.sales.where('cashierSessionId').equals(session.id).toArray(),
          db.cashMovements.where('sessionId').equals(session.id).toArray(),
        ]);
        const result = buildCashAudit(
          session.initialBalance,
          sales,
          movements,
          session.expectedCashInDrawer
        );
        if (alive) setAudit(result);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Erro ao construir a auditoria.');
      }
    })();
    return () => { alive = false; };
  }, [isOpen, session]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-slate-500 dark:text-slate-300" />
              Auditoria do Caixa
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Abertura {formatDateTime(session.openedAt)}
              {session.closedAt ? ` · Fechamento ${formatDateTime(session.closedAt)}` : ' · Em andamento'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {!error && !audit && <p className="text-sm text-slate-400">Reconstruindo…</p>}
          {audit && (
            <>
              {Math.abs(audit.reconstructionGap) >= 0.01 ? (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs">
                  A reconstrução linha a linha difere do esperado armazenado em{' '}
                  <strong>{formatCurrency(audit.reconstructionGap)}</strong> — possível venda registrada
                  fora desta sessão ou ajuste manual no banco.
                </div>
              ) : (
                <div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs">
                  Reconstrução bate com o esperado armazenado — nenhuma divergência interna.
                </div>
              )}

              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Hora</th>
                    <th className="py-2 pr-2">Evento</th>
                    <th className="py-2 pr-2 text-right">Δ</th>
                    <th className="py-2 text-right">Gaveta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
                  {audit.entries.map(e => (
                    <tr key={e.seq}>
                      <td className="py-2 pr-2 text-xs text-slate-400">{e.seq}</td>
                      <td className="py-2 pr-2 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {e.time ? new Date(e.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">
                        {e.label}
                        <span className={`ml-2 text-[10px] uppercase font-semibold ${
                          e.kind === 'SALE' ? 'text-emerald-600' : e.kind === 'BLEED' ? 'text-rose-500' : 'text-slate-400'
                        }`}>
                          {e.kind === 'OPENING' ? 'abertura' : e.kind === 'SALE' ? 'venda' : e.kind === 'SUPPLY' ? 'entrada' : 'sangria'}
                        </span>
                      </td>
                      <td className={`py-2 pr-2 text-right font-semibold tabular-nums ${e.delta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {e.delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(e.delta))}
                      </td>
                      <td className="py-2 text-right font-bold text-slate-800 dark:text-white tabular-nums">
                        {formatCurrency(e.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td colSpan={4} className="py-3 text-right text-xs font-semibold text-slate-500 uppercase pr-2">
                      Esperado reconstruído
                    </td>
                    <td className="py-3 text-right font-black text-slate-800 dark:text-white tabular-nums">
                      {formatCurrency(audit.rebuiltExpected)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
