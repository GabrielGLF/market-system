import React, { useState } from 'react';
import { X, CreditCard } from 'lucide-react';
import { db } from '../../db';
import { Customer } from '../../types';
import { toast } from 'sonner';

interface DebtPaymentModalProps {
  onClose: () => void;
  customer: Customer;
}

export function DebtPaymentModal({ onClose, customer }: DebtPaymentModalProps) {
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [description, setDescription] = useState('Pagamento de Dívida / Fiado');

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }

    if (amount > customer.debtBalance) {
      toast.error('O valor pago não pode ser maior que o saldo devedor.');
      return;
    }

    try {
      const now = new Date().toISOString();
      const newBalance = customer.debtBalance - Number(amount);

      await db.transaction('rw', db.customers, db.debtRecords, async () => {
        // Create debt record
        await db.debtRecords.add({
          id: crypto.randomUUID(),
          customerId: customer.id,
          saleId: '',
          type: 'PAYMENT',
          amount: Number(amount),
          previousBalance: customer.debtBalance,
          newBalance: newBalance,
          date: now,
          description: `${description} (${paymentMethod})`,
          receiptNumber: `REC-${Date.now()}`
        });

        // Update customer balance
        await db.customers.update(customer.id, {
          debtBalance: newBalance,
          updatedAt: now
        });
      });

      toast.success('Pagamento registrado com sucesso!');
      onClose();
    } catch (err) {
      toast.error('Erro ao registrar pagamento.');
      console.error(err);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center">
            <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Quitar Dívida</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handlePay} className="p-6 space-y-4">
          <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Saldo Devedor Atual</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{customer.name}</p>
            </div>
            <p className="text-xl font-bold text-red-500">{formatCurrency(customer.debtBalance)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Valor do Pagamento (R$)</label>
            <div className="flex gap-2">
              <input 
                required 
                type="number" 
                step="0.01" 
                min="0.01" 
                max={customer.debtBalance}
                value={amount} 
                onChange={(e) => setAmount(Number(e.target.value))} 
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" 
              />
              <button 
                type="button"
                onClick={() => setAmount(customer.debtBalance)}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
              >
                Total
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Forma de Pagamento</label>
            <select 
              value={paymentMethod} 
              onChange={(e) => setPaymentMethod(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="PIX">PIX</option>
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartão de Crédito</option>
              <option value="DEBIT_CARD">Cartão de Débito</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
            <input 
              type="text" 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none" 
            />
          </div>

          <div className="flex justify-end pt-4 mt-6 border-t border-slate-200 dark:border-slate-700 space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center transition-colors">
              Confirmar Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
