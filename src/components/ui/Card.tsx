import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Superfície padrão do sistema: fundo quieto, borda sutil, raio único.
 * Toda tela usa este Card — nada de sombras pesadas ou raios variados.
 */
export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm',
          className
        )
      )}
    >
      {children}
    </div>
  );
}
