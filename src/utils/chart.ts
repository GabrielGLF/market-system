/**
 * Estilo padrão dos tooltips dos gráficos (Recharts).
 *
 * Sem isso o Recharts usa tooltip branco com texto branco no tema escuro —
 * ilegível (bug reportado nas capturas do Painel Financeiro). Aplicar em TODOS
 * os <Tooltip> do projeto.
 */
export const chartTooltip = {
  contentStyle: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '12px',
  },
  itemStyle: { color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8', marginBottom: '4px' },
  cursor: { fill: 'rgba(148, 163, 184, 0.12)' },
};

/**
 * Paleta sóbria para gráficos categóricos (pizza de formas de pagamento etc.):
 * família verde + cinza, distinguível por luminosidade — sem arco-íris.
 * Verde/vermelho ficam reservados para métricas de preço e variação.
 */
export const CHART_PALETTE = [
  '#10b981', // emerald 500
  '#047857', // emerald 700
  '#64748b', // slate 500
  '#334155', // slate 700
  '#34d399', // emerald 400
  '#94a3b8', // slate 400
  '#065f46', // emerald 900
  '#cbd5e1', // slate 300
];
