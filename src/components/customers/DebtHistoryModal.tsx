import React from 'react';
import { X, Clock, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { Customer } from '../../types';

interface DebtHistoryModalProps {
  onClose: () => void;
  customer: Customer;
}

export function DebtHistoryModal({ onClose, customer }: DebtHistoryModalProps) {
  const history = useLiveQuery(() => 
    db.debtRecords
      .where('customerId')
      .equals(customer.id)
      .sortBy('date')
      .then(arr => arr.reverse()) // mais recente primeiro
  ) || [];

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString('pt-BR');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Extrato da Caderneta</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{customer.name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <span className="font-medium text-slate-600 dark:text-slate-300">Saldo Devedor Atual:</span>
          <span className="text-xl font-bold text-red-500">{formatCurrency(customer.debtBalance)}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              Nenhuma movimentação encontrada para este cliente.
            </div>
          ) : (
            history.map(record => (
              <div key={record.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <div className="flex items-start">
                  <div className={`p-2 rounded-full mr-3 mt-1 ${record.type === 'DEBIT' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {record.type === 'DEBIT' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{record.description}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(record.date)}</p>
                    {record.saleId && <p className="text-xs text-slate-400">Venda: {record.saleId.slice(0, 8)}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${record.type === 'DEBIT' ? 'text-red-500' : 'text-emerald-500'}`}>
                    {record.type === 'DEBIT' ? '+' : '-'}{formatCurrency(record.amount)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Saldo: {formatCurrency(record.newBalance)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
