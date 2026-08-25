import React from 'react';
import { calculateSmartChange } from '../../utils/calc';
import { formatCurrency } from '../../utils/format';
import { Banknote, Coins, Sparkles } from 'lucide-react';

interface SmartChangeDisplayProps {
  changeAmount: number;
}

export const SmartChangeDisplay: React.FC<SmartChangeDisplayProps> = ({ changeAmount }) => {
  const items = calculateSmartChange(changeAmount);
  const notes = items.filter(item => item.type === 'NOTE');
  const coins = items.filter(item => item.type === 'COIN');

  if (changeAmount <= 0 || items.length === 0) return null;

  const getNoteStyle = (value: number) => {
    switch (value) {
      case 200: return 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300';
      case 100: return 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300';
      case 50: return 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300';
      case 20: return 'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-950/60 dark:text-yellow-300';
      case 10: return 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300';
      case 5: return 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300';
      case 2: return 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300';
      default: return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Sugestão de Troco Inteligente (Menor Volume)
        </h4>
        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
          Total Troco: {formatCurrency(changeAmount)}
        </span>
      </div>
      
      {notes.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5 flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cédulas
          </div>
          <div className="flex flex-wrap gap-2">
            {notes.map((note, i) => (
              <div 
                key={i} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border shadow-xs ${getNoteStyle(note.value)}`}
              >
                <span className="px-1.5 py-0.5 bg-black/10 dark:bg-white/10 rounded font-black text-xs">
                  {note.count}x
                </span>
                <span>R$ {note.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {coins.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-500" /> Moedas
          </div>
          <div className="flex flex-wrap gap-2">
            {coins.map((coin, i) => (
              <div 
                key={i} 
                className="flex items-center gap-1.5 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-700/50 shadow-xs"
              >
                <span className="px-1.5 py-0.2 bg-amber-200/50 dark:bg-amber-800/40 rounded-full font-black text-[10px]">
                  {coin.count}x
                </span>
                <span>{coin.value >= 1 ? `R$ ${coin.value.toFixed(2)}` : `${(coin.value * 100).toFixed(0)}¢`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
