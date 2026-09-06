import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Lock, LockOpen, TrendingUp, TrendingDown, Clock, Printer, ScrollText } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { OpenCashModal } from '../components/cash/OpenCashModal';
import { CashMovementModal } from '../components/cash/CashMovementModal';
import { CloseCashModal } from '../components/cash/CloseCashModal';
import { CashAuditModal } from '../components/cash/CashAuditModal';

export const CashRegister: React.FC = () => {
  const [isOpenerOpen, setOpenerOpen] = useState(false);
  const [isCloserOpen, setCloserOpen] = useState(false);
  const [isAuditOpen, setAuditOpen] = useState(false);
  const [movementType, setMovementType] = useState<'SUPPLY' | 'BLEED' | null>(null);

  const activeSession = useLiveQuery(
    () => db.cashSessions.where('status').equals('OPEN').first()
  );

  const movements = useLiveQuery(
    () => activeSession ? db.cashMovements.where('sessionId').equals(activeSession.id).toArray() : []
  );

  if (activeSession === undefined) return <div>Carregando...</div>;

  if (!activeSession) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center flex flex-col items-center">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-12 h-12 text-slate-400" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-4">Caixa Fechado</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md">
            Abra o caixa para iniciar as vendas do dia e registrar as movimentações financeiras.
          </p>
          <button 
            onClick={() => setOpenerOpen(true)}
            className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-600/20"
          >
            Abrir Caixa Agora
          </button>
        </div>
        <OpenCashModal isOpen={isOpenerOpen} onClose={() => setOpenerOpen(false)} onSuccess={() => {}} />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <LockOpen className="w-8 h-8 text-green-500" />
            Caixa Aberto
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Aberto em {new Date(activeSession.openedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setAuditOpen(true)} className="px-4 py-2 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-2" title="Reconstruir linha a linha o valor esperado na gaveta">
            <ScrollText className="w-4 h-4" /> Auditoria
          </button>
          <button onClick={() => setMovementType('BLEED')} className="px-4 py-2 bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 font-semibold rounded-lg hover:bg-red-200 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Sangria
          </button>
          <button onClick={() => setMovementType('SUPPLY')} className="px-4 py-2 bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Suprimento
          </button>
          <button onClick={() => setCloserOpen(true)} className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-black">
            Fechar Caixa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Esperado em Dinheiro na Gaveta</div>
          <div className="text-4xl font-bold text-green-600 dark:text-green-400">{formatCurrency(activeSession.expectedCashInDrawer)}</div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 flex justify-between">
            <span>Fundo Inicial:</span>
            <span>{formatCurrency(activeSession.initialBalance)}</span>
          </div>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Total de Vendas</div>
          <div className="text-4xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(activeSession.totalSales.total)}</div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 grid grid-cols-2 gap-2">
            <div className="flex justify-between pr-2"><span>Dinheiro:</span> <span>{formatCurrency(activeSession.totalSales.cash)}</span></div>
            <div className="flex justify-between pl-2 border-l"><span>Pix:</span> <span>{formatCurrency(activeSession.totalSales.pix)}</span></div>
            <div className="flex justify-between pr-2"><span>Crédito:</span> <span>{formatCurrency(activeSession.totalSales.credit)}</span></div>
            <div className="flex justify-between pl-2 border-l"><span>Débito:</span> <span>{formatCurrency(activeSession.totalSales.debit)}</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Movimentações Extras</div>
          <div className="text-4xl font-bold text-slate-800 dark:text-white">{formatCurrency(activeSession.totalIn - activeSession.initialBalance - activeSession.totalOut)}</div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 flex justify-between">
            <span className="text-green-600 dark:text-green-400">+ Entradas: {formatCurrency(activeSession.totalIn - activeSession.initialBalance)}</span>
            <span className="text-red-600 dark:text-red-400">- Saídas: {formatCurrency(activeSession.totalOut)}</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-4">Histórico de Movimentações</h3>
        {movements && movements.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500 dark:text-slate-400">
                <th className="pb-3">Hora</th>
                <th className="pb-3">Tipo</th>
                <th className="pb-3">Valor</th>
                <th className="pb-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} className="border-b border-slate-50 dark:border-slate-700/50">
                  <td className="py-3 text-slate-600 dark:text-slate-400">{new Date(m.date).toLocaleTimeString()}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${m.type === 'SUPPLY' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'}`}>
                      {m.type === 'SUPPLY' ? 'Suprimento' : 'Sangria'}
                    </span>
                  </td>
                  <td className={`py-3 font-semibold ${m.type === 'SUPPLY' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                    {m.type === 'SUPPLY' ? '+' : '-'}{formatCurrency(m.amount)}
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-400">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center text-slate-400 py-8">Nenhuma movimentação registrada no turno atual.</div>
        )}
      </div>

      <CashMovementModal isOpen={movementType !== null} onClose={() => setMovementType(null)} onSuccess={() => {}} type={movementType || 'SUPPLY'} sessionId={activeSession.id} />
      <CloseCashModal isOpen={isCloserOpen} onClose={() => setCloserOpen(false)} onSuccess={() => {}} session={activeSession} />
      <CashAuditModal isOpen={isAuditOpen} onClose={() => setAuditOpen(false)} session={activeSession} />
    </div>
  );
};