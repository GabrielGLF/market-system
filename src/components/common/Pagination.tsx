import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Opções de itens por página exigidas: de 10 a 50. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const;

export interface PaginationControls<T = unknown> {
  /** Fatiar da lista para exibir somente a página atual. */
  pageItems: (items: T[]) => T[];
  /** UI de paginação — renderizar abaixo da tabela. */
  paginationUI: React.ReactNode;
  totalItems: number;
}

interface UsePaginationState {
  page: number;
  perPage: number;
}

/**
 * Estado de paginação persistido em localStorage (memória do operador: quem
 * prefere 50 linhas não volta para 10 a cada navegação).
 */
function loadState(): UsePaginationState {
  try {
    const raw = localStorage.getItem('marketsystem.pagination');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UsePaginationState>;
      if (PAGE_SIZE_OPTIONS.includes(parsed.perPage as any)) {
        return { page: 1, perPage: parsed.perPage as number };
      }
    }
  } catch {
    // localStorage indisponível — segue com o padrão.
  }
  return { page: 1, perPage: 20 };
}

function savePerPage(perPage: number) {
  try {
    localStorage.setItem('marketsystem.pagination', JSON.stringify({ perPage }));
  } catch {
    // Sem persistência disponível — apenas ignora.
  }
}

const selectClasses =
  'px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500';

/**
 * Hook de paginação para listas grandes. A lista completa é filtrada pela tela
 * (busca/status); a paginação apenas limita o que é renderizado, evitando o
 * gargalo de montar milhares de linhas de DOM de uma vez.
 *
 * @param items Lista já filtrada.
 * @param resetKey Qualquer mudança aqui (filtros/busca) volta para a página 1.
 */
export function usePagination<T>(items: T[], resetKey?: unknown): PaginationControls<T> {
  const [{ page, perPage }, setState] = useState<UsePaginationState>(loadState);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  // Página efetiva: nunca passa do fim (ex.: itens removidos por filtro).
  const effectivePage = Math.min(page, totalPages);

  // Troca de filtros → volta para a primeira página. A chave é serializada
  // porque telas passam arrays (novos a cada render — comparados por
  // identidade, resetariam a página em toda renderização).
  const resetKeyStr = JSON.stringify(resetKey ?? null);
  useEffect(() => {
    setState(s => ({ ...s, page: 1 }));
  }, [resetKeyStr]);

  const pageItems = useMemo(
    () => (list: T[]) => list.slice((effectivePage - 1) * perPage, effectivePage * perPage),
    [effectivePage, perPage]
  );

  const setPage = (p: number) => setState(s => ({ ...s, page: p }));
  const setPerPage = (n: number) => {
    savePerPage(n);
    setState({ page: 1, perPage: n });
  };

  // Janela de páginas com elipse: 1 … p-1 p p+1 … última.
  const pages: (number | '…')[] = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: (number | '…')[] = [1];
    const start = Math.max(2, effectivePage - 1);
    const end = Math.min(totalPages - 1, effectivePage + 1);
    if (start > 2) out.push('…');
    for (let p = start; p <= end; p++) out.push(p);
    if (end < totalPages - 1) out.push('…');
    out.push(totalPages);
    return out;
  }, [totalPages, effectivePage]);

  const firstItem = totalItems === 0 ? 0 : (effectivePage - 1) * perPage + 1;
  const lastItem = Math.min(effectivePage * perPage, totalItems);

  const paginationUI =
    totalItems === 0 ? null : (
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Exibindo <strong className="text-slate-700 dark:text-slate-200">{firstItem}–{lastItem}</strong> de{' '}
            <strong className="text-slate-700 dark:text-slate-200">{totalItems}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <label className="flex items-center gap-1.5">
            <span>Itens por página</span>
            <select
              value={perPage}
              onChange={e => setPerPage(Number(e.target.value))}
              className={selectClasses}
              aria-label="Itens por página"
            >
              {PAGE_SIZE_OPTIONS.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(effectivePage - 1)}
            disabled={effectivePage <= 1}
            title="Página anterior"
            aria-label="Página anterior"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pages.map((p, idx) =>
            p === '…' ? (
              <span key={`gap-${idx}`} className="px-1.5 text-xs text-slate-400 select-none">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                aria-current={p === effectivePage ? 'page' : undefined}
                className={`min-w-[2rem] px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  p === effectivePage
                    ? 'bg-slate-800 dark:bg-emerald-600 text-white'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setPage(effectivePage + 1)}
            disabled={effectivePage >= totalPages}
            title="Próxima página"
            aria-label="Próxima página"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );

  return { pageItems, paginationUI, totalItems };
}
