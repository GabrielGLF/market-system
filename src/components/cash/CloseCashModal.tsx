import React, { useState } from 'react';
import { X, Lock, Printer } from 'lucide-react';
import { db } from '../../db';
import { formatCurrency } from '../../utils/format';
import { CashSession } from '../../types';

interface CloseCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  session: CashSession;
}

export const CloseCashModal: React.FC<CloseCashModalProps> = ({ isOpen, onClose, onSuccess, session }) => {
  const [countedCash, setCountedCash] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const diff = (parseFloat(countedCash) || 0) - session.expectedCashInDrawer;

  const handleClose = async () => {
    session.closedAt = new Date().toISOString();
    session.actualCashCounted = parseFloat(countedCash) || 0;
    session.difference = diff;
    session.notes = notes;
    session.status = 'CLOSED';

    await db.cashSessions.put(session);
    
    // Print report here...
    window.print();
    
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:bg-white print:p-0">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden print:shadow-none print:w-full print:border-none">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white print:hidden">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lock className="w-5 h-5" /> Fechamento de Caixa
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 flex gap-8 print:p-4">
          <div className="flex-1 space-y-4">
            <h3 className="font-bold text-slate-800 text-lg border-b pb-2">Resumo Financeiro</h3>
            
            <div className="flex justify-between text-slate-600">
              <span>Fundo Inicial:</span>
              <span className="font-semibold">{formatCurrency(session.initialBalance)}</span>
            </div>
            <div className="flex justify-between text-blue-600">
              <span>Vendas em Dinheiro:</span>
              <span className="font-semibold">+{formatCurrency(session.totalSales.cash)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Suprimentos:</span>
              <span className="font-semibold">+{formatCurrency(session.totalIn - session.initialBalance)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Sangrias:</span>
              <span className="font-semibold">-{formatCurrency(session.totalOut)}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-lg text-slate-800">
              <span>Esperado na Gaveta:</span>
              <span>{formatCurrency(session.expectedCashInDrawer)}</span>
            </div>

            <div className="mt-6">
              <h3 className="font-bold text-slate-800 text-sm mb-2">Vendas por Cartão/Pix</h3>
              <div className="text-sm space-y-1 text-slate-600">
                <div className="flex justify-between"><span>Pix:</span> <span>{formatCurrency(session.totalSales.pix)}</span></div>
                <div className="flex justify-between"><span>Crédito:</span> <span>{formatCurrency(session.totalSales.credit)}</span></div>
                <div className="flex justify-between"><span>Débito:</span> <span>{formatCurrency(session.totalSales.debit)}</span></div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-50 p-6 rounded-xl border border-slate-200 print:hidden">
            <h3 className="font-bold text-slate-800 mb-4">Conferência (Dinheiro)</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-600 mb-2">Valor Físico Contado (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="w-full p-4 text-2xl font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {countedCash !== '' && (
              <div className={`p-4 rounded-xl border ${diff === 0 ? 'bg-green-100 border-green-300 text-green-800' : diff > 0 ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-red-100 border-red-300 text-red-800'}`}>
                <div className="text-sm font-semibold mb-1">Diferença</div>
                <div className="text-2xl font-bold">{diff > 0 ? '+' : ''}{formatCurrency(diff)}</div>
                <div className="text-sm mt-1">{diff === 0 ? 'Caixa exato' : diff > 0 ? 'Sobra de caixa' : 'Quebra de caixa'}</div>
              </div>
            )}

            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-600 mb-2">Observações</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg"
                rows={2}
              ></textarea>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-100 flex gap-2 print:hidden">
          <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-700">Cancelar</button>
          <button onClick={handleClose} disabled={countedCash === ''} className="flex-1 py-3 bg-slate-900 rounded-xl font-bold text-white hover:bg-black flex items-center justify-center gap-2 disabled:opacity-50">
            <Printer className="w-5 h-5" /> Fechar Caixa e Imprimir Relatório
          </button>
        </div>

      </div>
    </div>
  );
};