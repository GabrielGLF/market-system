import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  ArrowRightLeft, Search, Plus, Download, 
  ArrowDownLeft, ArrowUpRight, ShoppingBag, RotateCcw, SlidersHorizontal 
} from 'lucide-react';
import { formatDateTime, formatCurrency } from '../utils/format';
import { loadStockMovementsBetween, periodStartIso } from '../utils/analytics';
import type { SalesPeriod } from '../utils/analytics';
import { StockMovementModal } from '../components/inventory/StockMovementModal';
import type { StockMovement } from '../types';

export function StockMovements() {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [period, setPeriod] = useState<SalesPeriod>('30d');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Escalabilidade: a janela do período sai do índice `date`. Antes: a tabela
  // INTEIRA de movimentações era materializada (cada venda gera 1+ movimento —
  // é a tabela que mais cresce no sistema) mesmo com filtro de 7 dias.
  const movements = useLiveQuery(() => {
    if (period === 'all') {
      return db.stockMovements.orderBy('date').reverse().toArray();
    }
    return loadStockMovementsBetween(periodStartIso(period), undefined, { desc: true });
  }, [period]) || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const filteredMovements = movements.filter(m => {
    // Busca
    if (searchTerm && !m.productName.toLowerCase().includes(searchTerm.toLowerCase()) && !m.reason.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Tipo
    if (typeFilter !== 'ALL' && m.type !== typeFilter) {
      return false;
    }

    // Período
    const movementDate = new Date(m.date);
    if (period === 'today' && m.date.slice(0, 10) !== todayStr) return false;
    if (period === '7d' && movementDate < sevenDaysAgo) return false;
    if (period === '30d' && movementDate < thirtyDaysAgo) return false;

    return true;
  });

  const countIn = filteredMovements.filter(m => m.type === 'IN').reduce((acc, m) => acc + m.quantity, 0);
  const countOut = filteredMovements.filter(m => m.type === 'OUT').reduce((acc, m) => acc + m.quantity, 0);
  const countSales = filteredMovements.filter(m => m.type === 'SALE').reduce((acc, m) => acc + m.quantity, 0);

  const exportCSV = () => {
    const headers = ['Data e Hora', 'Produto', 'Tipo', 'Quantidade', 'Estoque Anterior', 'Novo Estoque', 'Motivo / Justificativa'];
    const rows = filteredMovements.map(m => [
      `"${formatDateTime(m.date)}"`,
      `"${m.productName.replace(/"/g, '""')}"`,
      m.type,
      m.quantity,
      m.previousStock,
      m.newStock,
      `"${m.reason.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `movimentacoes_estoque_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Histórico de Movimentações de Estoque
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Acompanhe todas as entradas, baixas por venda, avarias e ajustes de balanço.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Exportar CSV
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Nova Movimentação
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Entradas / Compras</span>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
              <ArrowDownLeft className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            +{countIn.toFixed(0)} <span className="text-xs font-normal text-slate-400">unidades</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Baixas por Vendas (PDV)</span>
            <span className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
            -{countSales.toFixed(0)} <span className="text-xs font-normal text-slate-400">unidades</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Saídas Avulsas / Avarias</span>
            <span className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-2">
            -{countOut.toFixed(0)} <span className="text-xs font-normal text-slate-400">unidades</span>
          </p>
        </div>
      </div>

      {/* Tabela de Movimentações */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por produto ou motivo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="IN">Entrada (Compra/Reposição)</option>
              <option value="SALE">Saída por Venda (PDV)</option>
              <option value="OUT">Saída Avulsa (Avaria/Perda)</option>
              <option value="ADJUST">Ajuste de Balanço</option>
              <option value="RETURN">Devolução / Estorno</option>
            </select>

            <select
              value={period}
              onChange={e => setPeriod(e.target.value as SalesPeriod)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="all">Todo o Histórico</option>
            </select>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Data e Hora</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-right">Qtd Movimentada</th>
                <th className="px-4 py-3 text-center">Estoque Antes → Depois</th>
                <th className="px-4 py-3">Motivo / Justificativa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Nenhuma movimentação encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(m => {
                  let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                  let label: string = m.type;

                  if (m.type === 'IN') {
                    badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
                    label = '➕ Entrada';
                  } else if (m.type === 'OUT') {
                    badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
                    label = '➖ Saída Avulsa';
                  } else if (m.type === 'SALE') {
                    badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
                    label = '🛒 Venda PDV';
                  } else if (m.type === 'ADJUST') {
                    badgeColor = 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300';
                    label = '⚖️ Ajuste Balanço';
                  } else if (m.type === 'RETURN') {
                    badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
                    label = '↩️ Devolução';
                  }

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {formatDateTime(m.date)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                        {m.productName}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeColor}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                        {m.type === 'IN' || m.type === 'RETURN' ? `+${m.quantity}` : `-${m.quantity}`}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">
                        {m.previousStock} → <strong className="text-slate-800 dark:text-white">{m.newStock}</strong>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        <div>{m.reason}</div>
                        {(m.type === 'IN' || m.type === 'OUT' || m.type === 'ADJUST' || m.type === 'SALE') && (
                          <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                            {m.type === 'IN' ? 'compra' : 'custo médio'}: {formatCurrency(m.costPrice)}
                            {' · '}valor: <strong className="text-slate-500 dark:text-slate-400">{formatCurrency(m.totalCost ?? (m.quantity * m.costPrice))}</strong>
                            {m.type === 'IN' && m.avgCostAfter != null && m.avgCostAfter !== m.costPrice && (
                              <> · custo médio → {formatCurrency(m.avgCostAfter)}</>
                            )}
                          </div>
                        )}
                        {m.supplier && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Fornecedor: {m.supplier}{m.invoiceNumber ? ` · Nota ${m.invoiceNumber}` : ''}</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Lançamento de Movimentação */}
      {isModalOpen && (
        <StockMovementModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

export default StockMovements;
