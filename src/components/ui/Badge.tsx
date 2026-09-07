import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info';

/**
 * Selo quieto: ponto + texto, sem bordas pesadas. Para status e contadores.
 */
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300',
  positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  negative: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-slate-400',
  positive: 'bg-emerald-500',
  negative: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          tones[tone],
          className
        )
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', dots[tone], pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  );
}
