import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../db';
import type { Product } from '../../types';
import { X, Save, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../../utils/format';
import { applyStockIn, applyStockOut, applyStockAdjust, computeWeightedAverageCost, evaluateRepricing } from '../../utils/inventory';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  onSuccess?: () => void;
}

type MovementType = 'IN' | 'OUT' | 'ADJUST';

export function StockMovementModal({ isOpen, onClose, product, onSuccess }: StockMovementModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [type, setType] = useState<MovementType>('IN');
  const [quantity, setQuantity] = useState<number>(1);
  const [countedStock, setCountedStock] = useState<number>(0);
  const [unitCost, setUnitCost] = useState<string>('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [reason, setReason] = useState('Compra / Reposição de Fornecedor');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // ATENÇÃO: booleano não é chave válida no IndexedDB — where('isActive').equals(1)
    // NUNCA encontra produtos ativos. O filtro cursorial é o caminho correto.
    db.products.filter(p => p.isActive).toArray().then(setProducts);
  }, [isOpen]);

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

  // Quando muda o produto/tipo, pré-preenche o custo com o último valor conhecido
  const selectedProduct = product || products.find(p => p.id === selectedProductId);
  useEffect(() => {
    if (type === 'IN' && selectedProduct) {
      setUnitCost(
        selectedProduct.lastPurchaseCost != null
          ? String(selectedProduct.lastPurchaseCost)
          : String(selectedProduct.costPrice || '')
      );
    }
  }, [selectedProductId, type, selectedProduct]);

  useEffect(() => {
    if (type === 'ADJUST' && selectedProduct) {
      setCountedStock(selectedProduct.stock);
    }
  }, [selectedProductId, type, selectedProduct]);

  // Preview do custo médio ponderado: o operador vê o impacto ANTES de confirmar
  const avgPreview = useMemo(() => {
    if (type !== 'IN' || !selectedProduct) return null;
    const cost = parseFloat(unitCost);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
    const previousStock = selectedProduct.stock;
    const previousAvg = selectedProduct.costPrice || 0;
    const newAvg = computeWeightedAverageCost(previousStock, previousAvg, quantity, cost);
    return {
      previousAvg,
      newAvg,
      total: quantity * cost,
      variation: previousAvg > 0 ? ((newAvg - previousAvg) / previousAvg) * 100 : 0,
    };
  }, [type, selectedProduct, unitCost, quantity]);

  const handleSave = async () => {
    if (!selectedProduct) {
      toast.error('Selecione um produto.');
      return;
    }
    setSaving(true);
    try {
      if (type === 'IN') {
        const cost = parseFloat(unitCost);
        if (!Number.isFinite(cost) || cost < 0) {
          toast.error('Informe o preço de compra da entrada (quanto você pagou por unidade).');
          return;
        }
        const { movement } = await applyStockIn({
          productId: selectedProduct.id,
          quantity,
          unitCost: cost,
          reason,
          supplier: supplier.trim() || undefined,
          invoiceNumber: invoiceNumber.trim() || undefined,
        });
        // Alerta de reprecificação: a compra pode ter comprimido a margem.
        const repricing = evaluateRepricing(
          selectedProduct.sellPrice,
          selectedProduct.costPrice || 0,
          movement.avgCostAfter || 0
        );
        toast.success(
          `Entrada registrada: +${movement.quantity} ${selectedProduct.unit} de "${selectedProduct.name}". Custo médio atualizado para ${formatCurrency(movement.avgCostAfter || 0)}.`
        );
        if (repricing.shouldAlert) {
          toast.warning(repricing.message, { duration: 8000 });
        }
      } else if (type === 'OUT') {
        const { movement } = await applyStockOut({
          productId: selectedProduct.id,
          quantity,
          reason,
        });
        toast.success(
          `Saída registrada: −${movement.quantity} ${selectedProduct.unit} de "${selectedProduct.name}" (perda de ${formatCurrency(movement.totalCost || 0)}).`
        );
      } else {
        const { movement } = await applyStockAdjust({
          productId: selectedProduct.id,
          countedStock,
          reason,
        });
        const diff = (movement.newStock - movement.previousStock);
        toast.success(
          `Balanço ajustado: "${selectedProduct.name}" ${diff > 0 ? 'ganhou' : 'perdeu'} ${Math.abs(diff)} ${selectedProduct.unit} (${formatCurrency(movement.totalCost || 0)}).`
        );
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar movimentação.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-600" />
              Lançar Movimentação de Estoque
            </h2>
            <p className="text-xs text-slate-400">Entrada de compra, saída avulsa ou balanço de inventário.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Seletor de Produto */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
              Produto
            </label>
            {product ? (
              <div className="p-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-lg text-sm font-semibold text-slate-800 dark:text-white">
                {product.name} <span className="text-xs font-normal text-slate-500">(Atual: {product.stock} {product.unit} · custo médio {formatCurrency(product.costPrice)})</span>
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
                    {p.name} (Atual: {p.stock} {p.unit} · custo médio {formatCurrency(p.costPrice)})
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
                Entrada
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
                Saída
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
                Ajuste
              </button>
            </div>
          </div>

          {/* Quantidade / Contagem */}
          {type === 'ADJUST' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Contagem Física Total (novo estoque)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedStock}
                onChange={e => setCountedStock(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              {selectedProduct && (
                <p className="text-[11px] text-slate-400 mt-1">
                  Sistema: {selectedProduct.stock} {selectedProduct.unit} · diferença: {(countedStock - selectedProduct.stock).toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                Quantidade a Movimentar
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
          )}

          {/* Campos específicos da ENTRADA (compra) */}
          {type === 'IN' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                  Preço de Compra por {selectedProduct?.unit || 'unidade'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitCost}
                    onChange={e => setUnitCost(e.target.value)}
                    placeholder="Quanto custou cada unidade nesta compra"
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                    Fornecedor (opcional)
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={e => setSupplier(e.target.value)}
                    placeholder="Ex: Distribuidora ABC"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase mb-1">
                    Nº da Nota (opcional)
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder="Ex: 12345"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Preview do impacto no custo médio */}
              {avgPreview && selectedProduct && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Custo médio atual</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(avgPreview.previousAvg)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Novo custo médio (após esta compra)</span>
                    <span className={`font-bold tabular-nums ${avgPreview.newAvg >= avgPreview.previousAvg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatCurrency(avgPreview.newAvg)}
                      {avgPreview.previousAvg > 0 && (
                        <span className="font-normal ml-1">
                          ({avgPreview.variation >= 0 ? '+' : ''}{avgPreview.variation.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Investimento nesta entrada</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(avgPreview.total)}</span>
                  </div>
                  {avgPreview.previousAvg > 0 && avgPreview.variation > 5 && (
                    <p className="text-amber-600 dark:text-amber-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                      O custo subiu {avgPreview.variation.toFixed(1)}% — considere revisar o preço de venda deste produto.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

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
        <div className="flex justify-end p-5 border-t border-slate-100 dark:border-slate-700 gap-2 shrink-0">
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
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Confirmar Movimentação'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StockMovementModal;
