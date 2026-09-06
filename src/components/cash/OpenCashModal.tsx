import React, { useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { db } from '../../db';
import { getSession } from '../../utils/auth';

interface OpenCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpenCashModal: React.FC<OpenCashModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [initialAmount, setInitialAmount] = useState('0');
  // Pré-preenche com o operador autenticado (login local)
  const [cashierName, setCashierName] = useState(() => getSession()?.name || 'Operador 1');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleOpen = async () => {
    if (isSaving) return; // Evita abrir dois caixas com cliques rápidos
    const amount = parseFloat(initialAmount) || 0;

    const openCount = await db.cashSessions.where('status').equals('OPEN').count();
    if (openCount > 0) {
      alert('Já existe um caixa aberto. Feche-o antes de abrir outro.');
      return;
    }

    setIsSaving(true);
    try {
      await db.cashSessions.add({
        id: crypto.randomUUID(),
        openedAt: new Date().toISOString(),
        cashierId: '1',
        cashierName,
        initialBalance: amount,
        currentBalance: amount,
        totalIn: amount,
        totalOut: 0,
        totalSales: { cash: 0, credit: 0, debit: 0, pix: 0, voucher: 0, fiado: 0, total: 0 },
        expectedCashInDrawer: amount,
        status: 'OPEN'
      });

      onSuccess();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900/60">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Abertura de Caixa
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Operador</label>
            <input 
              type="text" 
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Fundo de Troco (R$)</label>
            <input 
              type="number"
              step="0.01"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              className="w-full p-3 text-xl font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold text-slate-700 dark:text-slate-300">Cancelar</button>
          <button onClick={handleOpen} disabled={isSaving} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-white hover:bg-blue-700 disabled:opacity-50">Abrir Caixa</button>
        </div>
      </div>
    </div>
  );
};