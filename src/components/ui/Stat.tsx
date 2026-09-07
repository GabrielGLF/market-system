import React from 'react';
import { clsx } from 'clsx';
import { Card } from './Card';

export type StatTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

/**
 * KPI minimalista: rótulo micro, valor grande tabular e dica curta.
 * A cor aparece SÓ no valor/dica quando há semântica (positivo/negativo/
 * alerta) — o resto fica neutro para não cansar a leitura.
 */
const toneText: Record<StatTone, string> = {
  neutral: 'text-slate-900 dark:text-white',
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-rose-600 dark:text-rose-400',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-blue-600 dark:text-blue-400',
};

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  onClick?: () => void;
}) {
  return (
    <Card
      className={clsx(
        'p-4 flex flex-col justify-between gap-3',
        onClick && 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors'
      )}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="flex justify-between items-start gap-2 text-left w-full disabled:cursor-default"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className={clsx('text-2xl font-bold tabular-nums tracking-tight mt-1', toneText[tone])}>
            {value}
          </p>
        </div>
        {icon && (
          <span className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-300 shrink-0">
            {icon}
          </span>
        )}
      </button>
      {hint && <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </Card>
  );
}
