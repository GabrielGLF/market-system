import React, { useState } from 'react';
import { X, Wallet } from 'lucide-react';
import { db } from '../../db';

interface OpenCashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpenCashModal: React.FC<OpenCashModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [initialAmount, setInitialAmount] = useState('0');
  const [cashierName, setCashierName] = useState('Operador 1');

  if (!isOpen) return null;

  const handleOpen = async () => {
    const amount = parseFloat(initialAmount) || 0;
    
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
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            Abertura de Caixa
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Operador</label>
            <input 
              type="text" 
              value={cashierName}
              onChange={(e) => setCashierName(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Fundo de Troco (R$)</label>
            <input 
              type="number"
              step="0.01"
              value={initialAmount}
              onChange={(e) => setInitialAmount(e.target.value)}
              className="w-full p-3 text-xl font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-700">Cancelar</button>
          <button onClick={handleOpen} className="flex-1 py-3 bg-blue-600 rounded-xl font-bold text-white hover:bg-blue-700">Abrir Caixa</button>
        </div>
      </div>
    </div>
  );
};