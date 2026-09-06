import React, { useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { db } from '../../db';
import { toast } from 'sonner';
import { formatCurrency } from '../../utils/format';

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

    try {
      // Atômico: a movimentação e a atualização do caixa são uma única transação
      // (antes eram duas gravações separadas — falha no meio deixava estado parcial).
      await db.transaction('rw', [db.cashMovements, db.cashSessions], async () => {
        const session = await db.cashSessions.get(sessionId);
        if (!session) {
          throw new Error('Sessão de caixa não encontrada.');
        }

        // Uma sangria não pode retirar mais do que há fisicamente na gaveta
        if (!isSupply && val > session.expectedCashInDrawer + 0.0001) {
          throw new Error(`Sangria inválida: a gaveta tem ${formatCurrency(session.expectedCashInDrawer)} e você está retirando ${formatCurrency(val)}.`);
        }

        await db.cashMovements.add({
          id: crypto.randomUUID(),
          sessionId,
          type,
          amount: val,
          reason,
          date: new Date().toISOString()
        });

        if (isSupply) {
          await db.cashSessions.update(sessionId, {
            totalIn: Number((session.totalIn + val).toFixed(2)),
            expectedCashInDrawer: Number((session.expectedCashInDrawer + val).toFixed(2))
          });
        } else {
          await db.cashSessions.update(sessionId, {
            totalOut: Number((session.totalOut + val).toFixed(2)),
            expectedCashInDrawer: Number((session.expectedCashInDrawer - val).toFixed(2))
          });
        }
      });

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar movimentação de caixa.');
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className={`p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center ${isSupply ? 'bg-blue-50 dark:bg-blue-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
          <h2 className={`text-xl font-bold flex items-center gap-2 ${isSupply ? 'text-blue-800 dark:text-blue-300' : 'text-red-800 dark:text-red-300'}`}>
            {isSupply ? <ArrowUpCircle className="w-6 h-6" /> : <ArrowDownCircle className="w-6 h-6" />}
            {isSupply ? 'Suprimento (Entrada)' : 'Sangria (Saída)'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Valor (R$)</label>
            <input 
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 text-xl font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Motivo / Justificativa</label>
            <input 
              type="text" 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isSupply ? 'Ex: Troco adicional' : 'Ex: Pagamento fornecedor'}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold text-slate-700 dark:text-slate-300">Cancelar</button>
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