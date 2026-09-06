import React, { useState } from 'react';
import { X, Lock, Printer } from 'lucide-react';
import { db } from '../../db';
import { formatCurrency } from '../../utils/format';
import { CashSession } from '../../types';
import { toast } from 'sonner';

interface CloseCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  session: CashSession;
}

export const CloseCashModal: React.FC<CloseCashModalProps> = ({ isOpen, onClose, onSuccess, session }) => {
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const counted = parseFloat(countedCash) || 0;
  const diff = counted - session.expectedCashInDrawer;

  const handleClose = async () => {
    if (isSaving) return; // Evita fechamento duplicado com cliques rápidos
    if (counted < 0) {
      toast.error('O valor contado não pode ser negativo.');
      return;
    }

    setIsSaving(true);
    try {
      // Nunca mutar o objeto da live query: update() grava só os campos alterados
      // (mutar `session` em memória corrompia a reatividade do Dexie e outras views).
      await db.cashSessions.update(session.id, {
        closedAt: new Date().toISOString(),
        actualCashCounted: counted,
        difference: Number(diff.toFixed(2)),
        notes,
        status: 'CLOSED'
      });

      window.print();

      onSuccess();
      onClose();
    } catch (err) {
      toast.error('Erro ao fechar o caixa.');
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:bg-white print:p-0">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden print:shadow-none print:w-full print:border-none">
        
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-900 text-white print:hidden">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="w-5 h-5" /> Fechamento de Caixa
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex gap-8 print:p-4">
          <div className="flex-1 space-y-4">
            <h3 className="font-bold text-slate-800 dark:text-white text-lg border-b dark:border-slate-700 pb-2">Resumo Financeiro</h3>
            
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Fundo Inicial:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(session.initialBalance)}</span>
            </div>
            <div className="flex justify-between text-blue-600 dark:text-blue-400">
              <span>Vendas em Dinheiro:</span>
              <span className="font-semibold">+{formatCurrency(session.totalSales.cash)}</span>
            </div>
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Suprimentos:</span>
              <span className="font-semibold">+{formatCurrency(session.totalIn - session.initialBalance)}</span>
            </div>
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>Sangrias:</span>
              <span className="font-semibold">-{formatCurrency(session.totalOut)}</span>
            </div>
            <div className="border-t dark:border-slate-700 pt-2 flex justify-between font-bold text-lg text-slate-800 dark:text-white">
              <span>Esperado na Gaveta:</span>
              <span>{formatCurrency(session.expectedCashInDrawer)}</span>
            </div>

            <div className="mt-6">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-2">Vendas por Cartão/Pix</h3>
              <div className="text-sm space-y-1 text-slate-600 dark:text-slate-400">
                <div className="flex justify-between"><span>Pix:</span> <span>{formatCurrency(session.totalSales.pix)}</span></div>
                <div className="flex justify-between"><span>Crédito:</span> <span>{formatCurrency(session.totalSales.credit)}</span></div>
                <div className="flex justify-between"><span>Débito:</span> <span>{formatCurrency(session.totalSales.debit)}</span></div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-50 dark:bg-slate-900/60 p-6 rounded-xl border border-slate-200 dark:border-slate-700 print:hidden">
            <h3 className="font-bold text-slate-800 dark:text-white mb-4">Conferência (Dinheiro)</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Valor Físico Contado (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="w-full p-4 text-2xl font-bold border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {countedCash !== '' && (
              <div className={`p-4 rounded-xl border ${diff === 0 ? 'bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-900 text-green-800 dark:text-green-300' : diff > 0 ? 'bg-blue-100 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900 text-blue-800 dark:text-blue-300' : 'bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-900 text-red-800 dark:text-red-300'}`}>
                <div className="text-sm font-semibold mb-1">Diferença</div>
                <div className="text-2xl font-bold">{diff > 0 ? '+' : ''}{formatCurrency(diff)}</div>
                <div className="text-sm mt-1">{diff === 0 ? 'Caixa exato' : diff > 0 ? 'Sobra de caixa' : 'Quebra de caixa'}</div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Observações</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                rows={2}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-100 dark:bg-slate-900/60 flex gap-2 print:hidden">
          <button onClick={onClose} className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold text-slate-700 dark:text-slate-300">Cancelar</button>
          <button onClick={handleClose} disabled={countedCash === '' || isSaving} className="flex-1 py-3 bg-slate-900 rounded-xl font-bold text-white hover:bg-black flex items-center justify-center gap-2 disabled:opacity-50">
            <Printer className="w-5 h-5" /> {isSaving ? 'Fechando...' : 'Fechar Caixa e Imprimir Relatório'}
          </button>
        </div>

      </div>
    </div>
  );
};