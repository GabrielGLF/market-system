import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../db';
import type { Product } from '../types';
import { Calculator, DollarSign, CreditCard, Save, Search, X } from 'lucide-react';
import { formatCurrency, normalizeText } from '../utils/format';
import { calculateSellPrice, calculateMaxCost } from '../utils/calc';
import { toast } from 'sonner';

type Mode = 'COST_TO_PRICE' | 'PRICE_TO_COST' | 'ANALYSIS';

const MODES: { id: Mode; label: string }[] = [
  { id: 'COST_TO_PRICE', label: 'Custo → Preço' },
  { id: 'PRICE_TO_COST', label: 'Preço → Custo máx.' },
  { id: 'ANALYSIS', label: 'Analisar margem' },
];

const inputCls =
  'w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none';

export function PriceCalculator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Busca de produto: texto livre → resultados ao vivo (nome, SKU, código de barras)
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>('COST_TO_PRICE');

  // Inputs
  const [cost, setCost] = useState<number>(10);
  const [desiredMargin, setDesiredMargin] = useState<number>(35);
  const [targetSellPrice, setTargetSellPrice] = useState<number>(20);
  const [inputSellPrice, setInputSellPrice] = useState<number>(18);

  // Taxas & impostos
  const [enableFees, setEnableFees] = useState(true);
  const [cardFeeDebit, setCardFeeDebit] = useState<number>(1.5);
  const [cardFeeCredit, setCardFeeCredit] = useState<number>(3.2);
  const [taxSimples, setTaxSimples] = useState<number>(4.0);

  useEffect(() => {
    db.products.toArray().then(p => setProducts(p.filter(item => item.isActive)));
    db.settings.toCollection().first().then(s => {
      if (s) {
        setCardFeeDebit(s.defaultCardFeeDebit || 1.5);
        setCardFeeCredit(s.defaultCardFeeCredit || 3.2);
      }
    });
  }, []);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return [];
    const scored: { p: Product; score: number }[] = [];
    for (const p of products) {
      const name = normalizeText(p.name);
      const sku = normalizeText(p.sku || '');
      const barcode = p.barcode || '';
      let score = -1;
      if (barcode === q) score = 0;
      else if (name.startsWith(q)) score = 1;
      else if (sku && sku.startsWith(q)) score = 1;
      else if (name.includes(q)) score = 2;
      else if (sku && sku.includes(q)) score = 3;
      if (score >= 0) scored.push({ p, score });
    }
    return scored
      .sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name))
      .slice(0, 8)
      .map(x => x.p);
  }, [query, products]);

  const selectProduct = (prod: Product) => {
    setSelectedProduct(prod);
    setQuery('');
    setDropdownOpen(false);
    setCost(prod.costPrice);
    setInputSellPrice(prod.sellPrice);
    setTargetSellPrice(prod.sellPrice);
    if (prod.sellPrice > 0) {
      setDesiredMargin(((prod.sellPrice - prod.costPrice) / prod.sellPrice) * 100);
    }
  };

  const clearProduct = () => {
    setSelectedProduct(null);
    setQuery('');
  };

  // Cálculos
  let calculatedSellPrice = 0;
  let calculatedCost = 0;
  let grossProfit = 0;
  let markup = 0;
  let effectiveMargin = 0;

  if (mode === 'COST_TO_PRICE') {
    calculatedSellPrice = desiredMargin < 100 ? calculateSellPrice(cost, desiredMargin) : 0;
    grossProfit = calculatedSellPrice - cost;
    effectiveMargin = desiredMargin;
    markup = cost > 0 ? (grossProfit / cost) * 100 : 0;
  } else if (mode === 'PRICE_TO_COST') {
    calculatedCost = calculateMaxCost(targetSellPrice, desiredMargin);
    calculatedSellPrice = targetSellPrice;
    grossProfit = targetSellPrice - calculatedCost;
    effectiveMargin = desiredMargin;
    markup = calculatedCost > 0 ? (grossProfit / calculatedCost) * 100 : 0;
  } else {
    // ANALYSIS
    calculatedSellPrice = inputSellPrice;
    calculatedCost = cost;
    grossProfit = inputSellPrice - cost;
    effectiveMargin = inputSellPrice > 0 ? (grossProfit / inputSellPrice) * 100 : 0;
    markup = cost > 0 ? (grossProfit / cost) * 100 : 0;
  }

  // Lucro líquido por meio de pagamento
  const taxValue = calculatedSellPrice * (taxSimples / 100);
  const debitFeeValue = calculatedSellPrice * (cardFeeDebit / 100);
  const creditFeeValue = calculatedSellPrice * (cardFeeCredit / 100);

  const netProfitPixCash = grossProfit - taxValue;
  const netProfitDebit = grossProfit - taxValue - debitFeeValue;
  const netProfitCredit = grossProfit - taxValue - creditFeeValue;

  const handleApplyToProduct = async () => {
    if (!selectedProduct) {
      toast.error('Selecione um produto cadastrado para aplicar o preço.');
      return;
    }

    try {
      const prod = selectedProduct;
      const newSellPrice = mode === 'PRICE_TO_COST' ? targetSellPrice : calculatedSellPrice;

      // Custo NUNCA é sobrescrito pela calculadora: custo real só entra via
      // compra (applyStockIn com média ponderada). O modo PRICE_TO_COST calcula
      // o custo MÁXIMO suportado (teto), não o custo efetivo — gravá-lo como
      // costPrice corromperia CMV/margem/ABC.
      await db.products.update(prod.id, {
        sellPrice: Number(newSellPrice.toFixed(2)),
        updatedAt: new Date().toISOString()
      });

      await db.priceHistories.add({
        id: crypto.randomUUID(),
        productId: prod.id,
        productName: prod.name,
        oldSellPrice: prod.sellPrice,
        newSellPrice: Number(newSellPrice.toFixed(2)),
        oldCostPrice: prod.costPrice,
        newCostPrice: prod.costPrice,
        oldMargin: prod.sellPrice > 0 ? ((prod.sellPrice - prod.costPrice) / prod.sellPrice) * 100 : 0,
        newMargin: effectiveMargin,
        changePercentage: prod.sellPrice > 0 ? ((newSellPrice - prod.sellPrice) / prod.sellPrice) * 100 : 0,
        date: new Date().toISOString(),
        reason: 'Calculadora de Precificação'
      });

      // Mantém o produto selecionado coerente com o banco (o chip mostra o preço novo)
      setProducts(prev => prev.map(p => (p.id === prod.id ? { ...p, sellPrice: Number(newSellPrice.toFixed(2)) } : p)));
      setSelectedProduct(p => (p && p.id === prod.id ? { ...p, sellPrice: Number(newSellPrice.toFixed(2)) } : p));

      toast.success(`Preço de "${prod.name}" gravado: ${formatCurrency(newSellPrice)}.`);
    } catch {
      toast.error('Erro ao atualizar produto.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Calculator className="w-6 h-6 text-slate-500 dark:text-slate-300" />
          Calculadora de Preço
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Preço ideal, custo máximo e lucro real após taxas de cartão e impostos.
        </p>
      </div>

      {/* Modo */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-md text-sm transition-colors ${
              mode === m.id
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white font-semibold shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Busca de produto */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        {selectedProduct ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-white truncate">{selectedProduct.name}</p>
              <p className="text-xs text-slate-400 font-mono">
                Custo {formatCurrency(selectedProduct.costPrice)} · Venda {formatCurrency(selectedProduct.sellPrice)}
              </p>
            </div>
            <button
              onClick={clearProduct}
              title="Remover produto selecionado"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="relative" ref={searchRef}>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder="Buscar produto existente por nome, SKU ou código de barras… (opcional)"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            {dropdownOpen && query.trim() && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                {results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-400">Nenhum produto encontrado.</p>
                ) : (
                  results.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={e => {
                        e.preventDefault();
                        selectProduct(p);
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono truncate">
                          {p.sku ? `SKU ${p.sku}` : p.barcode}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-xs text-slate-400">Custo {formatCurrency(p.costPrice)}</p>
                        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatCurrency(p.sellPrice)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Parâmetros + Resultado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entradas */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-5">
          {mode === 'COST_TO_PRICE' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Preço de custo (R$)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cost}
                    onChange={e => setCost(Number(e.target.value))}
                    className={`${inputCls} pl-9 text-lg`}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Margem desejada (%)</label>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {desiredMargin.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  step="0.5"
                  value={desiredMargin}
                  onChange={e => setDesiredMargin(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </>
          )}

          {mode === 'PRICE_TO_COST' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Preço praticado no mercado (R$)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetSellPrice}
                    onChange={e => setTargetSellPrice(Number(e.target.value))}
                    className={`${inputCls} pl-9 text-lg`}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Margem mínima exigida (%)</label>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {desiredMargin.toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  step="0.5"
                  value={desiredMargin}
                  onChange={e => setDesiredMargin(Number(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </>
          )}

          {mode === 'ANALYSIS' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Custo (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={e => setCost(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Venda (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={inputSellPrice}
                  onChange={e => setInputSellPrice(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* Taxas */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={enableFees}
                onChange={e => setEnableFees(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              Simular taxas de cartão e impostos
            </label>

            {enableFees && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Débito (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cardFeeDebit}
                    onChange={e => setCardFeeDebit(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Crédito (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cardFeeCredit}
                    onChange={e => setCardFeeCredit(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Simples (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxSimples}
                    onChange={e => setTaxSimples(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 tabular-nums focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resultado */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            <p className="text-xs font-medium text-slate-400">
              {mode === 'PRICE_TO_COST' ? 'Custo máximo permitido' : mode === 'ANALYSIS' ? 'Preço atual' : 'Preço de venda sugerido'}
            </p>
            <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {formatCurrency(mode === 'PRICE_TO_COST' ? calculatedCost : calculatedSellPrice)}
            </p>

            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
              <div>
                <p className="text-[11px] text-slate-400">Lucro bruto</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(grossProfit)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Margem</p>
                <p className="text-base font-bold text-slate-800 dark:text-white tabular-nums">
                  {effectiveMargin.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Markup</p>
                <p className="text-base font-bold text-slate-800 dark:text-white tabular-nums">
                  {markup.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Lucro líquido por pagamento */}
          {enableFees && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <h3 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Lucro líquido após taxas e impostos
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-slate-600 dark:text-slate-300">Pix / Dinheiro</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(netProfitPixCash)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-slate-600 dark:text-slate-300">Débito ({cardFeeDebit}%)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(netProfitDebit)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-slate-600 dark:text-slate-300">Crédito ({cardFeeCredit}%)</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(netProfitCredit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {selectedProduct && (
            <button
              onClick={handleApplyToProduct}
              className="w-full py-3 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              Gravar preço no cadastro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PriceCalculator;
