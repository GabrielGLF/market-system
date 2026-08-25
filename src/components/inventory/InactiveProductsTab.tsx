import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import type { Product } from '../../types';
import { RefreshCw, Trash2, AlertCircle, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { toast } from 'sonner';

interface InactiveProductsTabProps {
  onReactivate?: () => void;
  onProductReactivated?: () => void;
}

export function InactiveProductsTab({ onReactivate, onProductReactivated }: InactiveProductsTabProps) {
  const [inactiveProducts, setInactiveProducts] = useState<Product[]>([]);

  const loadInactive = async () => {
    const products = await db.products.toArray();
    setInactiveProducts(products.filter(p => !p.isActive));
  };

  useEffect(() => {
    loadInactive();
  }, []);

  const handleReactivate = async (product: Product) => {
    try {
      await db.products.update(product.id, { 
        isActive: true, 
        inactiveSince: undefined,
        updatedAt: new Date().toISOString() 
      });
      toast.success(`Produto "${product.name}" reativado com sucesso!`);
      await loadInactive();
      onReactivate?.();
      onProductReactivated?.();
    } catch (err) {
      toast.error('Erro ao reativar produto.');
    }
  };

  const handleDeletePermanent = async (id: string, name: string) => {
    if (confirm(`Atenção: Deseja excluir permanentemente o produto "${name}"? Esta ação não pode ser desfeita.`)) {
      try {
        await db.products.delete(id);
        toast.success(`Produto "${name}" excluído com sucesso.`);
        await loadInactive();
      } catch (err) {
        toast.error('Erro ao excluir produto.');
      }
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="text-slate-400 w-5 h-5" />
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white text-sm">
              Produtos Inativos / Desativados ({inactiveProducts.length})
            </h3>
            <p className="text-xs text-slate-400">
              Produtos sem estoque ou inativados manualmente. Reative-os com 1 clique.
            </p>
          </div>
        </div>
      </div>
      
      {inactiveProducts.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-500" />
          <p className="font-medium text-slate-700 dark:text-slate-300">Nenhum produto inativo no momento.</p>
          <p className="text-xs text-slate-400 mt-1">Todos os seus produtos cadastrados estão ativos e disponíveis para venda.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Código / SKU</th>
                <th className="px-4 py-3 text-right">Custo</th>
                <th className="px-4 py-3 text-right">Venda</th>
                <th className="px-4 py-3 text-center">Último Estoque</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {inactiveProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                    {product.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {product.barcode || product.sku || '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-500">
                    {formatCurrency(product.costPrice)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                    {formatCurrency(product.sellPrice)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs font-semibold text-rose-500">
                    {product.stock} {product.unit}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleReactivate(product)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Reativar
                      </button>
                      <button
                        onClick={() => handleDeletePermanent(product.id, product.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        title="Excluir Permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default InactiveProductsTab;
