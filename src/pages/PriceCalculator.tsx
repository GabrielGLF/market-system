import React, { useState, useEffect } from 'react';
import { db } from '../db';
import type { Product } from '../types';
import { 
  Calculator, DollarSign, Percent, ArrowRight, 
  CreditCard, Check, Save, Sparkles, TrendingUp 
} from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { calculateSellPrice, calculateMaxCost } from '../utils/calc';
import { toast } from 'sonner';

export function PriceCalculator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Mode: 'COST_TO_PRICE' | 'PRICE_TO_COST' | 'ANALYSIS'
  const [mode, setMode] = useState<'COST_TO_PRICE' | 'PRICE_TO_COST' | 'ANALYSIS'>('COST_TO_PRICE');

  // Input states
  const [cost, setCost] = useState<number>(10);
  const [desiredMargin, setDesiredMargin] = useState<number>(35);
  const [targetSellPrice, setTargetSellPrice] = useState<number>(20);
  const [inputSellPrice, setInputSellPrice] = useState<number>(18);

  // Fee & Tax simulations
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

  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setCost(prod.costPrice);
      setInputSellPrice(prod.sellPrice);
      setTargetSellPrice(prod.sellPrice);
      if (prod.sellPrice > 0) {
        setDesiredMargin(((prod.sellPrice - prod.costPrice) / prod.sellPrice) * 100);
      }
    }
  };

  // Calculations
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

  // Simulations of Net Profit
  const taxValue = calculatedSellPrice * (taxSimples / 100);
  const debitFeeValue = calculatedSellPrice * (cardFeeDebit / 100);
  const creditFeeValue = calculatedSellPrice * (cardFeeCredit / 100);

  const netProfitPixCash = grossProfit - taxValue;
  const netProfitDebit = grossProfit - taxValue - debitFeeValue;
  const netProfitCredit = grossProfit - taxValue - creditFeeValue;

  const handleApplyToProduct = async () => {
    if (!selectedProductId) {
      toast.error('Selecione um produto cadastrado para aplicar o preço.');
      return;
    }

    try {
      const prod = products.find(p => p.id === selectedProductId);
      if (!prod) return;

      const newSellPrice = mode === 'PRICE_TO_COST' ? targetSellPrice : calculatedSellPrice;
      const newCostPrice = mode === 'PRICE_TO_COST' ? calculatedCost : cost;

      await db.products.update(prod.id, {
        sellPrice: Number(newSellPrice.toFixed(2)),
        costPrice: Number(newCostPrice.toFixed(2)),
        updatedAt: new Date().toISOString()
      });

      await db.priceHistories.add({
        id: crypto.randomUUID(),
        productId: prod.id,
        productName: prod.name,
        oldSellPrice: prod.sellPrice,
        newSellPrice: Number(newSellPrice.toFixed(2)),
        oldCostPrice: prod.costPrice,
        newCostPrice: Number(newCostPrice.toFixed(2)),
        oldMargin: prod.sellPrice > 0 ? ((prod.sellPrice - prod.costPrice) / prod.sellPrice) * 100 : 0,
        newMargin: effectiveMargin,
        changePercentage: prod.sellPrice > 0 ? ((newSellPrice - prod.sellPrice) / prod.sellPrice) * 100 : 0,
        date: new Date().toISOString(),
        reason: 'Calculadora de Precificação',
        userId: 'Admin'
      });

      toast.success(`Preço do produto "${prod.name}" atualizado para ${formatCurrency(newSellPrice)} com sucesso!`);
    } catch (err) {
      toast.error('Erro ao atualizar produto.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Calculator className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          Calculadora & Simulador Comercial de Preços
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Descubra o preço de venda ideal, calcule o custo máximo suportado e simule taxas reais de cartão e impostos.
        </p>
      </div>

      {/* Seletor de Modo */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-200/60 dark:bg-slate-800 rounded-xl max-w-2xl">
        <button
          onClick={() => setMode('COST_TO_PRICE')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            mode === 'COST_TO_PRICE'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          1. Custo → Preço de Venda
        </button>
        <button
          onClick={() => setMode('PRICE_TO_COST')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            mode === 'PRICE_TO_COST'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          2. Preço de Mercado → Custo Máximo
        </button>
        <button
          onClick={() => setMode('ANALYSIS')}
          className={`flex-1 py-2 px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            mode === 'ANALYSIS'
              ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          3. Analisar Margem Atual
        </button>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel de Entradas */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
            <h2 className="font-bold text-slate-800 dark:text-white text-base">
              Parâmetros de Cálculo
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
              Interativo
            </span>
          </div>

          {/* Opcional: Carregar Produto Cadastrado */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
              Carregar Dados de um Produto (Opcional)
            </label>
            <select
              value={selectedProductId}
              onChange={e => handleSelectProduct(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">-- Digitar valores manualmente --</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (Custo: {formatCurrency(p.costPrice)} | Venda: {formatCurrency(p.sellPrice)})
                </option>
              ))}
            </select>
          </div>

          {/* Entradas dependendo do modo */}
          {mode === 'COST_TO_PRICE' && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Preço de Custo Pago ao Fornecedor (R$)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cost}
                    onChange={e => setCost(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-base focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    Margem de Lucro Bruta Desejada (%)
                  </label>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
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
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>5% (Mínima)</span>
                  <span>30% (Padrão Varejo)</span>
                  <span>50% (Alta)</span>
                  <span>90%</span>
                </div>
              </div>
            </div>
          )}

          {mode === 'PRICE_TO_COST' && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Preço de Venda Praticado no Mercado (R$)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={targetSellPrice}
                    onChange={e => setTargetSellPrice(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    Margem Mínima que Você Exige (%)
                  </label>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
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
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {mode === 'ANALYSIS' && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Preço de Custo (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={cost}
                    onChange={e => setCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    Preço de Venda (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={inputSellPrice}
                    onChange={e => setInputSellPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white font-bold text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Simulador de Encargos */}
          <div className="border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableFees}
                  onChange={e => setEnableFees(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                Simular Taxas de Cartão & Impostos
              </label>
            </div>

            {enableFees && (
              <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase">Débito (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cardFeeDebit}
                    onChange={e => setCardFeeDebit(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase">Crédito (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cardFeeCredit}
                    onChange={e => setCardFeeCredit(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase">Simples Nac. (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxSimples}
                    onChange={e => setTaxSimples(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Painel de Resultados */}
        <div className="lg:col-span-6 space-y-4">
          {/* Card Principal */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-950 p-6 rounded-xl text-white shadow-md border border-slate-700">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs uppercase font-semibold text-emerald-400 tracking-wider">
                  {mode === 'PRICE_TO_COST' ? 'Custo Máximo Permitido' : 'Preço de Venda Sugerido'}
                </span>
                <div className="text-4xl font-black text-white mt-1">
                  {formatCurrency(mode === 'PRICE_TO_COST' ? calculatedCost : calculatedSellPrice)}
                </div>
              </div>
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <Sparkles className="w-6 h-6" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-slate-700">
              <div>
                <p className="text-[11px] text-slate-400 uppercase">Lucro Bruto</p>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(grossProfit)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase">Margem Efetiva</p>
                <p className="text-lg font-bold text-white">{effectiveMargin.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 uppercase">Markup</p>
                <p className="text-lg font-bold text-blue-400">{markup.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Simulação de Lucro Líquido Real por Meio de Pagamento */}
          {enableFees && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Lucro Líquido Real no Bolso (Após Taxas & Imposto)
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center p-2.5 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-lg">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    📱 Pix & 💵 Dinheiro à Vista
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(netProfitPixCash)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-2.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    💳 Cartão de Débito ({cardFeeDebit}%)
                  </span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(netProfitDebit)}
                  </span>
                </div>

                <div className="flex justify-between items-center p-2.5 bg-violet-50/60 dark:bg-violet-950/30 rounded-lg">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    💳 Cartão de Crédito à Vista ({cardFeeCredit}%)
                  </span>
                  <span className="font-bold text-violet-600 dark:text-violet-400">
                    {formatCurrency(netProfitCredit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Botão Aplicar ao Produto */}
          {selectedProductId && (
            <button
              onClick={handleApplyToProduct}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-colors"
            >
              <Save className="w-5 h-5" />
              Gravar Este Preço no Cadastro do Produto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PriceCalculator;
