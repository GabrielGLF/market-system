import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import type { StockMovement, Product } from '../../types';
import { X, Save, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSuccess?: () => void;
}

export function StockMovementModal({ isOpen, onClose, product, onSuccess }: StockMovementModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [type, setType] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState('Compra / Reposição de Estoque');

  useEffect(() => {
    // equals(1) nunca encontrava isActive=true (booleano), deixando a lista vazia
    db.products.filter(p => p.isActive).toArray().then(setProducts);
  }, []);

  useEffect(() => {
    if (product) {
      setSelectedProductId(product.id);
    }
  }, [product]);

  useEffect(() => {
    if (type === 'IN') setReason('Compra / Reposição de Fornecedor');
    else if (type === 'OUT') setReason('Avaria / Vencimento / Consumo Interno');
    else if (type === 'ADJUST') setReason('Ajuste de Balanço / Inventário Físico');
  }, [type]);

  const handleSave = async () => {
    const prod = product || products.find(p => p.id === selectedProductId);
    if (!prod) {
      toast.error('Selecione um produto.');
      return;
    }

    if (quantity <= 0 && type !== 'ADJUST') {
      toast.error('A quantidade deve ser maior que zero.');
      return;
    }

    const previousStock = prod.stock;
    let newStock = previousStock;

    if (type === 'IN') newStock += quantity;
    else if (type === 'OUT') newStock = Math.max(0, previousStock - quantity);
    else if (type === 'ADJUST') newStock = quantity;

    try {
      await db.products.update(prod.id, { stock: newStock, updatedAt: new Date().toISOString() });
      
      await db.stockMovements.add({
        id: crypto.randomUUID(),
        productId: prod.id,
        productName: prod.name,
        type,
        quantity: type === 'ADJUST' ? Math.abs(newStock - previousStock) : quantity,
        previousStock,
        newStock,
        reason,
        date: new Date().toISOString(),
        userId: 'Admin',
        costPrice: prod.costPrice
      });

      toast.success(`Estoque do produto "${prod.name}" atualizado para ${newStock} ${prod.unit}!`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error('Erro ao salvar movimentação.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
              Lançar Movimentação de Estoque
            </h2>
            <p className="text-xs text-slate-400">Entrada, saída avulsa ou balanço de inventário.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Seletor de Produto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
              Produto
            </label>
            {product ? (
              <div className="p-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-lg text-sm font-semibold text-slate-800 dark:text-white">
                {product.name} <span className="text-xs font-normal text-slate-500">(Atual: {product.stock} {product.unit})</span>
              </div>
            ) : (
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                <option value="">Selecione o produto...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Atual: {p.stock} {p.unit})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tipo de Movimentação */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
              Tipo de Movimentação
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('IN')}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                  type === 'IN' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-500 shadow-xs dark:bg-emerald-950/50 dark:text-emerald-300' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                ➕ Entrada
              </button>
              <button
                type="button"
                onClick={() => setType('OUT')}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                  type === 'OUT' 
                    ? 'bg-rose-50 text-rose-700 border-rose-500 shadow-xs dark:bg-rose-950/50 dark:text-rose-300' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                ➖ Saída
              </button>
              <button
                type="button"
                onClick={() => setType('ADJUST')}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                  type === 'ADJUST' 
                    ? 'bg-blue-50 text-blue-700 border-blue-500 shadow-xs dark:bg-blue-950/50 dark:text-blue-300' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                ⚖️ Ajuste
              </button>
            </div>
          </div>

          {/* Quantidade */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
              {type === 'ADJUST' ? 'Novo Estoque Físico Total' : 'Quantidade a Movimentar'}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-lg focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
              Motivo / Justificativa
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-5 border-t border-slate-100 dark:border-slate-700 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            Confirmar Movimentação
          </button>
        </div>
      </div>
    </div>
  );
}

export default StockMovementModal;
