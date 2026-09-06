import React from 'react';
import { calculateSmartChange } from '../../utils/calc';
import { formatCurrency } from '../../utils/format';
import { Banknote, Coins } from 'lucide-react';

interface SmartChangeDisplayProps {
  changeAmount: number;
}

export const SmartChangeDisplay: React.FC<SmartChangeDisplayProps> = ({ changeAmount }) => {
  const items = calculateSmartChange(changeAmount);
  const notes = items.filter(item => item.type === 'NOTE');
  const coins = items.filter(item => item.type === 'COIN');

  if (changeAmount <= 0 || items.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 p-3.5 rounded-md border border-slate-200 dark:border-slate-700 mt-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5 text-slate-400" />
          Sugestão de troco (menor volume)
        </h4>
        <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
          {formatCurrency(changeAmount)}
        </span>
      </div>
      
      {notes.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5 text-slate-400" /> Cédulas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {notes.map((note, i) => (
              <div 
                key={i} 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60"
              >
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">{note.count}×</span>
                <span className="tabular-nums">R$ {note.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {coins.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-slate-400" /> Moedas
          </div>
          <div className="flex flex-wrap gap-1.5">
            {coins.map((coin, i) => (
              <div 
                key={i} 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/60"
              >
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">{coin.count}×</span>
                <span className="tabular-nums">{coin.value >= 1 ? `R$ ${coin.value.toFixed(2)}` : `${(coin.value * 100).toFixed(0)}¢`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
