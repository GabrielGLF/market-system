import React, { useState, useEffect } from 'react';
import type { Product, Category } from '../types';
import { db } from '../db';
import { ProductModal } from '../components/inventory/ProductModal';
import { CategoryModal } from '../components/inventory/CategoryModal';
import { StockMovementModal } from '../components/inventory/StockMovementModal';
import { InactiveProductsTab } from '../components/inventory/InactiveProductsTab';
import { 
  Plus, Search, Edit2, ArrowRightLeft, Package, 
  FolderPlus, AlertTriangle, CheckCircle, Download, 
  EyeOff, Layers, RefreshCw
} from 'lucide-react';
import { formatCurrency } from '../utils/format';

export function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOW_STOCK' | 'INACTIVE'>('ACTIVE');
  
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);

  const loadData = async () => {
    const [allProducts, allCategories] = await Promise.all([
      db.products.toArray(),
      db.categories.toArray()
    ]);
    setProducts(allProducts);
    setCategories(allCategories);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      p.sku.toLowerCase().includes(search.toLowerCase()) || 
      p.barcode.includes(search);

    const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;

    let matchesStatus = true;
    if (statusFilter === 'ACTIVE') {
      matchesStatus = p.isActive;
    } else if (statusFilter === 'INACTIVE') {
      matchesStatus = !p.isActive;
    } else if (statusFilter === 'LOW_STOCK') {
      matchesStatus = p.isActive && p.stock <= p.minStock;
    }

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
    setIsProductModalOpen(true);
  };

  const handleQuickStock = (p: Product) => {
    setStockProduct(p);
    setIsStockModalOpen(true);
  };

  const handleToggleActive = async (p: Product) => {
    const nowActive = !p.isActive;
    await db.products.update(p.id, { 
      isActive: nowActive,
      inactiveSince: nowActive ? undefined : new Date().toISOString()
    });
    loadData();
  };

  const exportCSV = () => {
    const headers = ['ID', 'Nome', 'SKU', 'Codigo de Barras', 'Categoria', 'Custo', 'Venda', 'Estoque', 'Minimo', 'Unidade', 'Status'];
    const rows = products.map(p => [
      p.id,
      `"${p.name.replace(/"/g, '""')}"`,
      p.sku,
      p.barcode,
      categories.find(c => c.id === p.categoryId)?.name || 'Sem Categoria',
      p.costPrice.toFixed(2),
      p.sellPrice.toFixed(2),
      p.stock,
      p.minStock,
      p.unit,
      p.isActive ? 'Ativo' : 'Inativo'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `estoque_marketsystem_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalCost = products.filter(p => p.isActive).reduce((acc, p) => acc + (p.costPrice * p.stock), 0);
  const totalSell = products.filter(p => p.isActive).reduce((acc, p) => acc + (p.sellPrice * p.stock), 0);
  const lowStockCount = products.filter(p => p.isActive && p.stock <= p.minStock).length;
  const inactiveCount = products.filter(p => !p.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header com ações */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Controle de Estoque & Produtos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cadastre, controle frações, monitore estoque mínimo e movimentações.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <FolderPlus className="w-4 h-4 text-emerald-600" />
            Categorias
          </button>
          <button
            onClick={exportCSV}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm border border-slate-200 dark:border-slate-700"
          >
            <Download className="w-4 h-4 text-blue-600" />
            Exportar CSV
          </button>
          <button
            onClick={() => {
              setEditingProduct(null);
              setIsProductModalOpen(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            Novo Produto
          </button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Total Ativos</span>
            <span className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-lg">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {products.filter(p => p.isActive).length} <span className="text-xs font-normal text-slate-500">itens</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Custo em Estoque</span>
            <span className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-lg">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {formatCurrency(totalCost)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Valor de Venda Total</span>
            <span className="p-2 bg-violet-50 dark:bg-violet-950/40 text-violet-600 rounded-lg">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800 dark:text-white mt-2">
            {formatCurrency(totalSell)}
          </p>
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            Lucro projetado: {formatCurrency(totalSell - totalCost)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Estoque Crítico</span>
            <span className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">
            {lowStockCount} <span className="text-xs font-normal text-slate-500">precisam reposição</span>
          </p>
        </div>
      </div>

      {/* Se for a aba de inativos */}
      {statusFilter === 'INACTIVE' ? (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Produtos Ativos ({products.filter(p => p.isActive).length})
            </button>
            <button
              onClick={() => setStatusFilter('LOW_STOCK')}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Estoque Baixo ({lowStockCount})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold"
            >
              Inativos ({inactiveCount})
            </button>
          </div>
          <InactiveProductsTab onProductReactivated={loadData} />
        </div>
      ) : (
        /* Tabela e Filtros normais */
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Filtros e Busca */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-slate-50/50 dark:bg-slate-800/50">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, SKU ou Código de Barras (EAN)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Todas as Categorias</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex bg-slate-200/60 dark:bg-slate-900 p-1 rounded-lg text-xs font-medium">
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-3 py-1 rounded-md transition-colors ${statusFilter === 'ACTIVE' ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Ativos
                </button>
                <button
                  onClick={() => setStatusFilter('LOW_STOCK')}
                  className={`px-3 py-1 rounded-md transition-colors ${statusFilter === 'LOW_STOCK' ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-xs font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Baixo ({lowStockCount})
                </button>
                <button
                  onClick={() => setStatusFilter('INACTIVE')}
                  className="px-3 py-1 rounded-md transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900"
                >
                  Inativos ({inactiveCount})
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Produtos */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right" title="Custo médio ponderado das compras + preço da última compra">Custo Médio</th>
                  <th className="px-4 py-3 text-right">Venda</th>
                  <th className="px-4 py-3 text-center">Estoque</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400">
                      Nenhum produto encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(product => {
                    const category = categories.find(c => c.id === product.categoryId);
                    const isLow = product.stock <= product.minStock;
                    const isOut = product.stock <= 0;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-600">
                              {product.imageUrl?.startsWith('http') || product.imageUrl?.startsWith('data:') ? (
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <span>{product.imageUrl || '📦'}</span>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-white line-clamp-1">{product.name}</p>
                              <p className="text-xs text-slate-400 font-mono">
                                Barcode: {product.barcode} {product.sku && `• SKU: ${product.sku}`}
                              </p>
                              {product.alternativeUnit && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 text-[10px] rounded font-medium">
                                  Fração: {product.alternativeUnit.name} ({formatCurrency(product.alternativeUnit.price)})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${category?.color || '#10b981'}15`,
                              color: category?.color || '#10b981'
                            }}
                          >
                            {category?.name || 'Geral'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                            {formatCurrency(product.costPrice)}
                          </div>
                          {product.lastPurchaseCost != null && (
                            <div className="text-[10px] text-slate-400 tabular-nums" title={product.lastSupplier ? `Fornecedor: ${product.lastSupplier}` : undefined}>
                              última compra {formatCurrency(product.lastPurchaseCost)}
                              {product.lastPurchaseDate && ` · ${product.lastPurchaseDate.slice(0, 10).split('-').reverse().join('/')}`}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">
                          {formatCurrency(product.sellPrice)}
                        </td>

                        <td className="px-4 py-3 text-center font-medium">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isOut 
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400' 
                              : isLow 
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400' 
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                          }`}>
                            {product.stock} {product.unit}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-0.5">mín: {product.minStock}</p>
                        </td>

                        <td className="px-4 py-3 text-center">
                          {product.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Inativo
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleQuickStock(product)}
                              title="Movimentar Estoque (Entrada/Saída/Ajuste)"
                              className="p-1.5 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEdit(product)}
                              title="Editar Produto"
                              className="p-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(product)}
                              title={product.isActive ? "Desativar Produto" : "Reativar Produto"}
                              className="p-1.5 text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                              {product.isActive ? <EyeOff className="w-4 h-4" /> : <RefreshCw className="w-4 h-4 text-emerald-600" />}
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
      )}

      {/* Modais */}
      {isProductModalOpen && (
        <ProductModal
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
          productToEdit={editingProduct || undefined}
          onSuccess={loadData}
        />
      )}

      {isCategoryModalOpen && (
        <CategoryModal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          onSuccess={loadData}
        />
      )}

      {isStockModalOpen && stockProduct && (
        <StockMovementModal
          isOpen={isStockModalOpen}
          onClose={() => {
            setIsStockModalOpen(false);
            setStockProduct(null);
          }}
          product={stockProduct}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
