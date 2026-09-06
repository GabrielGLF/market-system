import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  Search, Download, FileText, ChevronRight, ShoppingBag, 
  TrendingUp, DollarSign, Calendar, Clock, RotateCcw, Repeat
} from 'lucide-react';
import { toast } from 'sonner';
import { requestRepeatSale } from '../utils/repeatSale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { SaleDetailModal } from '../components/sales/SaleDetailModal';
import { generateSalesPdf } from '../utils/salesPdf';
import type { Sale } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';

export function Sales() {
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'month' | 'all'>('7d');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const sales = useLiveQuery(() => db.sales.orderBy('date').reverse().toArray()) || [];

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filteredSales = sales.filter(s => {
    // Search
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      const matchNumber = s.saleNumber.toLowerCase().includes(query);
      const matchCustomer = s.customerName && s.customerName.toLowerCase().includes(query);
      const matchProduct = s.items.some(item => item.productName.toLowerCase().includes(query));
      if (!matchNumber && !matchCustomer && !matchProduct) return false;
    }

    // Status
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;

    // Payment Method
    if (methodFilter !== 'ALL') {
      const hasMethod = s.paymentMethods.some(m => m.method === methodFilter);
      if (!hasMethod) return false;
    }

    // Period
    const saleDate = new Date(s.date);
    if (period === 'today' && s.date.slice(0, 10) !== todayStr) return false;
    if (period === '7d' && saleDate < sevenDaysAgo) return false;
    if (period === '30d' && saleDate < thirtyDaysAgo) return false;
    if (period === 'month' && saleDate < startOfMonth) return false;

    return true;
  });

  const completedSales = filteredSales.filter(s => s.status === 'COMPLETED');
  const totalFaturado = completedSales.reduce((acc, s) => acc + s.total, 0);
  const totalLucro = completedSales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const totalItens = completedSales.reduce((acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0), 0);
  const ticketMedio = completedSales.length > 0 ? totalFaturado / completedSales.length : 0;
  const margemMedia = totalFaturado > 0 ? (totalLucro / totalFaturado) * 100 : 0;

  // Gráfico de vendas por hora (08h às 22h)
  const hourlyData = Array.from({ length: 15 }, (_, i) => {
    const hour = i + 8;
    const hourLabel = `${String(hour).padStart(2, '0')}h`;
    const salesInHour = completedSales.filter(s => {
      const h = new Date(s.date).getHours();
      return h === hour;
    });
    const total = salesInHour.reduce((acc, s) => acc + s.total, 0);
    return { hour: hourLabel, total, count: salesInHour.length };
  });

  const repeatSale = (sale: Sale) => {
    requestRepeatSale(sale.items);
    toast.success(`Itens da venda #${sale.saleNumber} enviados para o PDV.`);
  };

  const exportCSV = () => {
    const headers = ['Numero', 'Data e Hora', 'Cliente', 'Status', 'Itens', 'Subtotal', 'Desconto', 'Total', 'Lucro', 'Formas de Pagamento'];
    const rows = filteredSales.map(s => [
      `"${s.saleNumber}"`,
      `"${formatDateTime(s.date)}"`,
      `"${s.customerName || 'Consumidor Final'}"`,
      s.status,
      s.items.length,
      s.subtotal.toFixed(2),
      s.discount.toFixed(2),
      s.total.toFixed(2),
      (s.profit || 0).toFixed(2),
      `"${s.paymentMethods.map(m => m.method).join(', ')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vendas_marketsystem_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Histórico & Gestão de Vendas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Acompanhe vendas realizadas, estornos com retorno ao estoque e relatórios.
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
            onClick={() => generateSalesPdf(filteredSales, period)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-md shadow-rose-600/20"
          >
            <FileText className="w-4 h-4" />
            Relatório PDF
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Faturamento</span>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {formatCurrency(totalFaturado)}
          </p>
          <span className="text-xs text-slate-400 font-normal">no período selecionado</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Lucro Bruto</span>
            <span className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
            {formatCurrency(totalLucro)}
          </p>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            Margem: {margemMedia.toFixed(1)}%
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Total de Vendas</span>
            <span className="p-2 bg-violet-50 dark:bg-violet-950/40 text-violet-600 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {completedSales.length}
          </p>
          <span className="text-xs text-slate-400">{filteredSales.filter(s => s.status === 'CANCELLED').length} canceladas</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Ticket Médio</span>
            <span className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
              <Calendar className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {formatCurrency(ticketMedio)}
          </p>
          <span className="text-xs text-slate-400">por atendimento</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Itens Vendidos</span>
            <span className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {totalItens} <span className="text-xs font-normal text-slate-400">un</span>
          </p>
          <span className="text-xs text-slate-400">
            Média {(completedSales.length > 0 ? totalItens / completedSales.length : 0).toFixed(1)} itens/venda
          </span>
        </div>
      </div>

      {/* Gráfico de Vendas por Hora */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" />
          Faturamento por Faixa Horária (08h às 22h)
        </h3>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData}>
              <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val: number) => `R$${val}`} />
              <Tooltip 
                formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Faturamento']}
                labelFormatter={(label) => `Horário: ${label}`}
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
              />
              <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filtros e Tabela de Vendas */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cupom, cliente ou produto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Este Mês</option>
              <option value="all">Todas as Vendas</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Status: Todos</option>
              <option value="COMPLETED">Concluídas</option>
              <option value="CANCELLED">Canceladas/Estornadas</option>
            </select>

            <select
              value={methodFilter}
              onChange={e => setMethodFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Pagamento: Todos</option>
              <option value="PIX">Pix</option>
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartão Crédito</option>
              <option value="DEBIT_CARD">Cartão Débito</option>
              <option value="FIADO">Fiado (Caderneta)</option>
            </select>
          </div>
        </div>

        {/* Tabela de Vendas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Cupom</th>
                <th className="px-4 py-3">Data e Hora</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Formas de Pagamento</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    Nenhuma venda encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredSales.map(sale => {
                  const isCancelled = sale.status === 'CANCELLED';

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          #{sale.saleNumber}
                        </span>
                        <p className="text-xs text-slate-400">{sale.items.length} {sale.items.length === 1 ? 'item' : 'itens'}</p>
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(sale.date)}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {sale.customerName || 'Consumidor Final'}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {sale.paymentMethods.map((m, idx) => (
                            <span 
                              key={idx}
                              className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                            >
                              {m.method === 'PIX' && '📱 Pix'}
                              {m.method === 'CASH' && '💵 Dinheiro'}
                              {m.method === 'CREDIT_CARD' && '💳 Crédito'}
                              {m.method === 'DEBIT_CARD' && '💳 Débito'}
                              {m.method === 'FIADO' && '📒 Fiado'}
                              {m.method === 'VOUCHER' && '🎫 Vale'}
                              {m.method === 'SPLIT' && '🔀 Dividido'}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isCancelled 
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                        }`}>
                          {isCancelled ? 'Cancelada' : 'Concluída'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-slate-800 dark:text-white'}`}>
                          {formatCurrency(sale.total)}
                        </span>
                        {sale.discount > 0 && (
                          <p className="text-[10px] text-rose-500 font-medium">-{formatCurrency(sale.discount)} desc</p>
                        )}
                        {(sale.refundedAmount || 0) > 0 && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            ↩ {formatCurrency(sale.refundedAmount || 0)} devolvido
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {!isCancelled && (
                            <button
                              onClick={() => repeatSale(sale)}
                              title={`Repetir venda #${sale.saleNumber} no PDV`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-medium transition-colors"
                            >
                              <Repeat className="w-3.5 h-3.5" />
                              Repetir
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSale(sale)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors"
                          >
                            Ver Detalhes
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalhes da Venda com Estorno / Devolução Parcial */}
      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onUpdate={() => {
            // Recarrega a venda selecionada para refletir devoluções parciais
            // (o estado `selectedSale` é um snapshot; a live query atualiza a tabela).
            db.sales.get(selectedSale.id).then(fresh => {
              if (fresh) setSelectedSale(fresh);
            });
          }}
        />
      )}
    </div>
  );
}

export default Sales;
