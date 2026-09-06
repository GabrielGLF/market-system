import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import {
  loadCompletedSalesBetween, loadRecentSales,
  localMidnightIso, localDayIso, dayStartIso, dayEndIso
} from '../utils/analytics';
import { 
  TrendingUp, Package, DollarSign, AlertCircle, 
  ShoppingCart, ArrowRight, Wallet, Percent, 
  PackagePlus, PlusCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

export function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.toCollection().first());

  // Escalabilidade: só a janela exibida (últimos 7 dias) sai do índice de data.
  // Antes: o histórico INTEIRO era carregado a cada render só para calcular
  // "hoje" e o gráfico semanal — com anos de uso, dezenas de milhares de vendas.
  const sales = useLiveQuery(() => loadCompletedSalesBetween(localMidnightIso(6)), []) || [];
  const recentSales = useLiveQuery(() => loadRecentSales(5), []) || [];

  // Dia LOCAL (o comércio abre e fecha no fuso da loja; datas são gravadas em UTC).
  const today = localDayIso();
  const todaysSales = sales.filter(s => s.date >= localMidnightIso(0));
  
  const todayRevenue = todaysSales.reduce((sum, s) => sum + s.total, 0);
  const todayProfit = todaysSales.reduce((sum, s) => sum + (s.profit || 0), 0);
  const todayMargin = todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;

  const totalCost = products.reduce((sum, p) => sum + (p.costPrice * p.stock), 0);
  const totalProjectedRevenue = products.reduce((sum, p) => sum + (p.sellPrice * p.stock), 0);
  
  const lowStockThreshold = settings?.lowStockThresholdDefault || 5;
  const lowStockProducts = products.filter(p => p.stock <= (p.minStock || lowStockThreshold));

  // Janelas diárias por limites ISO locais (meia-noite local), não por prefixo UTC.
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = localDayIso(d);
    const daySales = sales.filter(s => s.date >= dayStartIso(dateStr) && s.date < dayEndIso(dateStr));
    return {
      name: d.toLocaleDateString('pt-BR', { weekday: 'short' }),
      total: daySales.reduce((sum, s) => sum + s.total, 0)
    };
  });

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">Visão geral do seu negócio hoje</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onNavigate('pdv')} className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-colors font-medium">
            <ShoppingCart className="w-4 h-4 mr-2" /> PDV (F2)
          </button>
          <button onClick={() => onNavigate('inventory')} className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg shadow-sm transition-colors font-medium">
            <PackagePlus className="w-4 h-4 mr-2" /> Entrada
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vendas Hoje */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between group hover:border-emerald-500 transition-colors">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Vendas Hoje</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{formatCurrency(todayRevenue)}</h3>
            </div>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center">
              <TrendingUp className="w-3 h-3 mr-1" /> {todaysSales.length} vendas
            </span>
          </div>
        </div>

        {/* Margem Média */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Margem Média Hoje</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{todayMargin.toFixed(1)}%</h3>
            </div>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Lucro estimado: {formatCurrency(todayProfit)}
          </div>
        </div>

        {/* Valor em Estoque */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Valor em Estoque</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{formatCurrency(totalCost)}</h3>
            </div>
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Projeção de venda: {formatCurrency(totalProjectedRevenue)}
          </div>
        </div>

        {/* Produtos */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Produtos</p>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{products.length}</h3>
            </div>
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            {lowStockProducts.length > 0 ? (
              <span className="text-orange-600 dark:text-orange-400 font-medium flex items-center">
                <AlertCircle className="w-3 h-3 mr-1" /> {lowStockProducts.length} com estoque baixo
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Estoque regularizado
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Evolução de Vendas (7 Dias)</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#10b981' }}
                  formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Faturamento']}
                />
                <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Alerta de Estoque Baixo */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center">
              <AlertCircle className="w-5 h-5 text-orange-500 mr-2" /> Estoque Baixo
            </h3>
            <button onClick={() => onNavigate('inventory')} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">Ver todos</button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {lowStockProducts.length === 0 ? (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum produto com estoque baixo.</p>
              </div>
            ) : (
              lowStockProducts.slice(0, 6).map(p => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div className="truncate pr-3">
                    <p className="font-medium text-slate-800 dark:text-white text-sm truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{p.barcode}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <p className={`font-bold ${p.stock <= 0 ? 'text-red-500' : 'text-orange-500'}`}>
                      {p.stock} <span className="text-xs font-normal">{p.unit}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Últimas Vendas */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Últimas Vendas</h3>
          <button onClick={() => onNavigate('sales')} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center">
            Ver todas <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400">
                <th className="pb-3 font-medium px-2">Data/Hora</th>
                <th className="pb-3 font-medium px-2">Nº Venda</th>
                <th className="pb-3 font-medium px-2">Itens</th>
                <th className="pb-3 font-medium px-2">Pagamento</th>
                <th className="pb-3 font-medium px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map(sale => (
                <tr key={sale.id} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-sm">
                  <td className="py-3 px-2 text-slate-800 dark:text-slate-200">
                    {new Date(sale.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                  </td>
                  <td className="py-3 px-2 text-slate-800 dark:text-slate-200 font-mono text-xs">{sale.saleNumber}</td>
                  <td className="py-3 px-2 text-slate-600 dark:text-slate-400">{sale.items.reduce((s, i) => s + i.quantity, 0)} unid</td>
                  <td className="py-3 px-2">
                    <div className="flex gap-1">
                      {sale.paymentMethods.map((pm, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300">
                          {pm.method}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(sale.total)}
                  </td>
                </tr>
              ))}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                    Nenhuma venda registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
