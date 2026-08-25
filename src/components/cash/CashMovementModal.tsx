import React, { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { db } from '../../db';

interface CashMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  type: 'SUPPLY' | 'BLEED';
  sessionId: string;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({ isOpen, onClose, onSuccess, type, sessionId }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const isSupply = type === 'SUPPLY';

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0 || !reason) return;

    await db.cashMovements.add({
      id: crypto.randomUUID(),
      sessionId,
      type,
      amount: val,
      reason,
      date: new Date().toISOString(),
      cashierName: 'Operador Atual'
    });

    const session = await db.cashSessions.get(sessionId);
    if (session) {
      if (isSupply) {
        session.totalIn += val;
        session.expectedCashInDrawer += val;
      } else {
        session.totalOut += val;
        session.expectedCashInDrawer -= val;
      }
      await db.cashSessions.put(session);
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`p-6 border-b border-slate-100 flex justify-between items-center ${isSupply ? 'bg-blue-50' : 'bg-red-50'}`}>
          <h2 className={`text-xl font-bold flex items-center gap-2 ${isSupply ? 'text-blue-800' : 'text-red-800'}`}>
            {isSupply ? <ArrowUpCircle className="w-6 h-6" /> : <ArrowDownCircle className="w-6 h-6" />}
            {isSupply ? 'Suprimento (Entrada)' : 'Sangria (Saída)'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Valor (R$)</label>
            <input 
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 text-xl font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Motivo / Justificativa</label>
            <input 
              type="text" 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isSupply ? 'Ex: Troco adicional' : 'Ex: Pagamento fornecedor'}
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white border border-slate-300 rounded-xl font-semibold text-slate-700">Cancelar</button>
          <button 
            onClick={handleSave} 
            disabled={!amount || parseFloat(amount) <= 0 || !reason}
            className={`flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-50 ${isSupply ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};