import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Product, Category } from '../types';
import { Search, History, AlertTriangle, TrendingDown } from 'lucide-react';
import { formatCurrency, formatNumber } from '../utils/format';
import { calculateMargin, calculateMarkup } from '../utils/calc';
import { QuickPricePopover } from '../components/pricing/QuickPricePopover';
import { PriceHistoryModal } from '../components/pricing/PriceHistoryModal';
import { usePagination } from '../components/common/Pagination';
import { PageHeader, Card } from '../components/ui';

export function Pricing() {
  const products = useLiveQuery(() => db.products.filter(p => p.isActive).toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const priceHistories = useLiveQuery(() => db.priceHistories.toArray()) || [];
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const [activePopoverProduct, setActivePopoverProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  // --- Alertas de Precificação (dados reais, nada inventado) ---
  // Última alteração de preço/custo de cada produto, para detectar custo que
  // subiu sem o preço de venda acompanhar.
  const latestHistoryByProduct = new Map<string, (typeof priceHistories)[number]>();
  for (const h of priceHistories) {
    const cur = latestHistoryByProduct.get(h.productId);
    if (!cur || new Date(h.date) > new Date(cur.date)) {
      latestHistoryByProduct.set(h.productId, h);
    }
  }

  const lowMarginProducts = products.filter(p => {
    const m = calculateMargin(p.costPrice, p.sellPrice);
    return p.sellPrice > 0 && m < 10;
  });

  const costUpNoReprice = products.filter(p => {
    const h = latestHistoryByProduct.get(p.id);
    // Custo subiu na última alteração e o preço de venda não mudou junto
    return Boolean(h && h.newCostPrice > h.oldCostPrice && h.newSellPrice === h.oldSellPrice);
  });

  const filteredProducts = products.filter((p: Product) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase()) || 
      p.barcode.includes(search);

    const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Paginação: acompanha o crescimento do catálogo.
  const { pageItems, paginationUI } = usePagination(filteredProducts, [search, selectedCategory]);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Preços e margens"
        subtitle="Edição rápida de preços, margens de lucro, markup e histórico de alterações."
      />

      {/* Alertas de Precificação — insights acionáveis com base em dados reais */}
      {(lowMarginProducts.length > 0 || costUpNoReprice.length > 0) && (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Alertas de precificação</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-100 dark:bg-slate-700/50">
            {lowMarginProducts.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-4">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-2">
                  Margem abaixo de 10% ({lowMarginProducts.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {lowMarginProducts.slice(0, 10).map(p => (
                    <div key={p.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span className="truncate pr-2">{p.name}</span>
                      <span className="font-bold tabular-nums whitespace-nowrap">{calculateMargin(p.costPrice, p.sellPrice).toFixed(1)}%</span>
                    </div>
                  ))}
                  {lowMarginProducts.length > 10 && (
                    <p className="text-[11px] text-slate-400">+{lowMarginProducts.length - 10} outros — revise a tabela abaixo.</p>
                  )}
                </div>
              </div>
            )}
            {costUpNoReprice.length > 0 && (
              <div className="bg-white dark:bg-slate-800 p-4">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Custo subiu sem reajuste de preço ({costUpNoReprice.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {costUpNoReprice.slice(0, 10).map(p => {
                    const h = latestHistoryByProduct.get(p.id)!;
                    return (
                      <div key={p.id} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                        <span className="truncate pr-2">{p.name}</span>
                        <span className="whitespace-nowrap tabular-nums">
                          Custo {formatCurrency(h.oldCostPrice)} → {formatCurrency(h.newCostPrice)}
                        </span>
                      </div>
                    );
                  })}
                  {costUpNoReprice.length > 10 && (
                    <p className="text-[11px] text-slate-400">+{costUpNoReprice.length - 10} outros.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tabela de Preços */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        {/* Barra de Filtros */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50/50 dark:bg-slate-800/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto por nome, código ou SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Todas as Categorias</option>
              {categories.map((c: Category) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Preço de Custo</th>
                <th className="px-4 py-3 text-right">Preço de Venda</th>
                <th className="px-4 py-3 text-right">Margem Bruta (%)</th>
                <th className="px-4 py-3 text-right">Markup (%)</th>
                <th className="px-4 py-3 text-right">Lucro Unitário</th>
                <th className="px-4 py-3 text-center">Estoque</th>
                <th className="px-4 py-3 text-center">Histórico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                pageItems(filteredProducts).map((p: Product) => {
                  const cat = categories.find((c: Category) => c.id === p.categoryId);
                  const margin = calculateMargin(p.costPrice, p.sellPrice);
                  const markup = calculateMarkup(p.costPrice, p.sellPrice);
                  const unitProfit = p.sellPrice - p.costPrice;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-white">{p.name}</div>
                        <div className="text-xs text-slate-400 font-mono">SKU: {p.sku || p.barcode}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                          {cat?.name || 'Geral'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(p.costPrice)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setActivePopoverProduct(activePopoverProduct?.id === p.id ? null : p)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors text-slate-800 dark:text-white cursor-pointer font-bold"
                            title="Clique para edição rápida de preço"
                          >
                            {formatCurrency(p.sellPrice)}
                          </button>

                          {activePopoverProduct?.id === p.id && (
                            <div className="absolute right-0 top-full mt-2 z-30">
                              <QuickPricePopover
                                product={p}
                                onClose={() => setActivePopoverProduct(null)}
                                onSaved={() => setActivePopoverProduct(null)}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          margin >= 35 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' 
                            : margin >= 20 
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' 
                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                        }`}>
                          {margin.toFixed(1)}%
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {markup.toFixed(1)}%
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(unitProfit)}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          p.stock <= 0 
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' 
                            : p.stock <= p.minStock 
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {formatNumber(p.stock)} {p.unit}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setHistoryProduct(p)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Ver histórico de alterações de preço"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {paginationUI}
      </div>

      {/* Modal de Histórico de Preços */}
      {historyProduct && (
        <PriceHistoryModal
          product={historyProduct}
          isOpen={true}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
}

export default Pricing;
