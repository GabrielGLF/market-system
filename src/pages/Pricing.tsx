import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Product, Category } from '../types';
import { Search, Tags, History, TrendingUp, Percent, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { QuickPricePopover } from '../components/pricing/QuickPricePopover';
import { PriceHistoryModal } from '../components/pricing/PriceHistoryModal';

export function Pricing() {
  const products = useLiveQuery(() => db.products.filter(p => p.isActive).toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const [activePopoverProduct, setActivePopoverProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const filteredProducts = products.filter((p: Product) => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase()) || 
      p.barcode.includes(search);

    const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const calculateMargin = (cost: number, sell: number) => {
    if (sell <= 0) return 0;
    return ((sell - cost) / sell) * 100;
  };

  const calculateMarkup = (cost: number, sell: number) => {
    if (cost <= 0) return 0;
    return ((sell - cost) / cost) * 100;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Tags className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Gestão & Análise de Precificação
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Edição rápida de preços, margens de lucro, markup e histórico de alterações.
          </p>
        </div>
      </div>

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
                filteredProducts.map((p: Product) => {
                  const cat = categories.find((c: Category) => c.id === p.categoryId);
                  const margin = calculateMargin(p.costPrice, p.sellPrice);
                  const markup = calculateMarkup(p.costPrice, p.sellPrice);
                  const unitProfit = p.sellPrice - p.costPrice;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-750/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-white">{p.name}</div>
                        <div className="text-xs text-slate-400 font-mono">SKU: {p.sku || p.barcode}</div>
                      </td>

                      <td className="px-4 py-3">
                        <span 
                          className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: cat?.color ? `${cat.color}20` : '#f1f5f9',
                            color: cat?.color || '#64748b'
                          }}
                        >
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
                          {p.stock} {p.unit}
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
