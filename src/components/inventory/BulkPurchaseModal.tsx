import React, { useState, useMemo, useRef, useEffect } from 'react';
import { db } from '../../db';
import type { Product } from '../../types';
import { X, Search, Plus, Trash2, Save, FileText } from 'lucide-react';
import { formatCurrency, formatNumber, normalizeText } from '../../utils/format';
import { applyStockIn, evaluateRepricing } from '../../utils/inventory';
import { toast } from 'sonner';

interface BulkPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface LineItem {
  key: string;
  product: Product;
  quantity: number;
  unitCost: number;
}

/**
 * Compra em lote: uma nota do fornecedor com vários produtos de uma vez.
 * Toda a nota é gravada em UMA transação Dexie — ou entra tudo, ou nada.
 * Cada linha passa pelo motor de custo médio ponderado (applyStockIn),
 * com movimentação auditável e atualização do custo do produto.
 */
export function BulkPurchaseModal({ isOpen, onClose, onSuccess }: BulkPurchaseModalProps) {
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);

  // Busca de produto para adicionar linha
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeProducts, setActiveProducts] = useState<Product[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const searchResults = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return [];
    const selected = new Set(lines.map(l => l.product.id));
    const out: { p: Product; score: number }[] = [];
    for (const p of activeProducts) {
      if (selected.has(p.id)) continue;
      const name = normalizeText(p.name);
      const sku = normalizeText(p.sku || '');
      const barcode = p.barcode || '';
      let score = -1;
      if (barcode === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (sku.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (sku.includes(q)) score = 3;
      if (score >= 0) out.push({ p, score });
    }
    return out
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
      .slice(0, 8)
      .map(x => x.p);
  }, [query, lines, activeProducts]);

  useEffect(() => {
    if (!isOpen) return;
    // booleano não é chave indexável no IndexedDB — filtra ativos em memória.
    db.products.toArray().then(all => setActiveProducts(all.filter(p => p.isActive)));
  }, [isOpen]);

  if (!isOpen) return null;

  const addLine = (p: Product) => {
    setLines(prev => [...prev, {
      key: crypto.randomUUID(),
      product: p,
      quantity: 1,
      unitCost: p.lastPurchaseCost ?? p.costPrice ?? 0,
    }]);
    setQuery('');
    setSearchOpen(false);
  };

  const updateLine = (key: string, patch: Partial<LineItem>) => {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => setLines(prev => prev.filter(l => l.key !== key));

  const totalInvoice = lines.reduce((acc, l) => acc + l.quantity * l.unitCost, 0);
  const canSave = lines.length > 0 && supplier.trim().length > 0 && lines.every(l => l.quantity > 0 && l.unitCost >= 0);

  const handleSave = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    try {
      const invoice = invoiceNumber.trim() || undefined;
      const supplierName = supplier.trim();

      // TUDO em uma transação: ou a nota inteira entra, ou nada entra.
      // (applyStockIn lança em erro — a transação externa desfaz tudo.)
      const repricingAlerts: string[] = [];
      await db.transaction('rw', [db.products, db.stockMovements], async () => {
        for (const line of lines) {
          const { movement } = await applyStockIn({
            productId: line.product.id,
            quantity: Number(line.quantity.toFixed(3)),
            unitCost: Number(line.unitCost.toFixed(2)),
            reason: `Compra em lote — ${supplierName}${invoice ? ` (nota ${invoice})` : ''}`,
            supplier: supplierName,
            invoiceNumber: invoice,
          });
          const repricing = evaluateRepricing(
            line.product.sellPrice,
            line.product.costPrice || 0,
            movement.avgCostAfter || 0
          );
          if (repricing.shouldAlert) {
            repricingAlerts.push(`"${line.product.name}": ${repricing.message}`);
          }
        }
      });

      toast.success(`Nota gravada: ${lines.length} ${lines.length === 1 ? 'produto' : 'produtos'}, ${formatCurrency(totalInvoice)}.`);
      for (const alert of repricingAlerts.slice(0, 3)) {
        toast.warning(alert, { duration: 8000 });
      }
      if (repricingAlerts.length > 3) {
        toast.warning(`+ ${repricingAlerts.length - 3} produtos com margem comprimida — revise em Preços & Margens.`, { duration: 8000 });
      }
      setLines([]);
      setSupplier('');
      setInvoiceNumber('');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gravar a nota.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500 dark:text-slate-300" />
              Nota do Fornecedor (compra em lote)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Todos os itens entram no estoque e no custo médio em uma única transação.
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fornecedor / nota */}
        <div className="p-5 pb-0 grid grid-cols-1 sm:grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fornecedor *</label>
            <input
              type="text"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              placeholder="Ex.: Distribuidora Central"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nº da nota (opcional)</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="Ex.: 1042"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Busca de produto */}
        <div className="p-5 pb-0 shrink-0" ref={searchRef}>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Adicionar produtos</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Nome, SKU ou código de barras…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            {searchOpen && query.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">Nenhum produto encontrado (ou já adicionado).</p>
                ) : (
                  searchResults.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={e => { e.preventDefault(); addLine(p); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{p.sku || p.barcode} · estoque {formatNumber(p.stock)} {p.unit}</p>
                      </div>
                      <Plus className="w-4 h-4 text-emerald-600 shrink-0 ml-3" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Linhas */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {lines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Busque e adicione os produtos da nota acima.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_84px_110px_100px_36px] gap-2 text-[10px] font-semibold text-slate-400 uppercase px-1">
                <span>Produto</span>
                <span className="text-right">Qtd</span>
                <span className="text-right">Custo un.</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              {lines.map(l => (
                <div key={l.key} className="grid grid-cols-[1fr_84px_110px_100px_36px] gap-2 items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{l.product.name}</p>
                    <p className="text-[10px] text-slate-400">custo médio atual: {formatCurrency(l.product.costPrice)}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={l.quantity}
                    onChange={e => updateLine(l.key, { quantity: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unitCost}
                    onChange={e => updateLine(l.key, { unitCost: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 text-sm text-right border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-right tabular-nums">
                    {formatCurrency(l.quantity * l.unitCost)}
                  </span>
                  <button
                    onClick={() => removeLine(l.key)}
                    title="Remover linha"
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] text-slate-400 uppercase">Total da nota</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(totalInvoice)}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Gravando…' : `Gravar nota (${lines.length} ${lines.length === 1 ? 'item' : 'itens'})`}
          </button>
        </div>
      </div>
    </div>
  );
}
