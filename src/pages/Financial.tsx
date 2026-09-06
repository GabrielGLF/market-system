import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  HelpCircle, DollarSign, TrendingUp, AlertTriangle, 
  Package, Activity, Clock, Percent, Users, Layers, 
  Sparkles, ArrowUpRight, BarChart3, PieChart as PieIcon,
  ArrowRightLeft, ArrowDownLeft, ShoppingBag, ShoppingCart,
  Boxes, ShieldAlert, CheckCircle2, RotateCcw, Flame,
  TrendingDown, Shuffle, Zap, AlertCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, PieChart, Pie, Cell, ComposedChart, Bar, Line, 
  BarChart, Legend
} from 'recharts';
import { MetricHelpModal } from '../components/financial/MetricHelpModal';
import { formatCurrency, formatNumber } from '../utils/format';
import type { Product, Sale, StockMovement, Category, Customer } from '../types';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'];

export function Financial() {
  const [activeTab, setActiveTab] = useState<'financial' | 'inventory_flow' | 'abc_profit' | 'cross_sell' | 'customer_credit'>('financial');
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'month' | 'year' | 'all'>('30d');
  const [helpInfo, setHelpInfo] = useState<{ title: string; definition: string; formula?: string; tip: string } | null>(null);

  // Ponto de equilíbrio states (custos fixos)
  const [custoAluguel, setCustoAluguel] = useState(2500);
  const [custoEnergia, setCustoEnergia] = useState(800);
  const [custoSalarios, setCustoSalarios] = useState(4000);

  const sales = useLiveQuery(() => db.sales.toArray()) || [];
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const customers = useLiveQuery(() => db.customers.toArray()) || [];
  const stockMovements = useLiveQuery(() => db.stockMovements.toArray()) || [];

  // Filtragem de vendas por período
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  const filteredSales = sales.filter(s => {
    if (s.status !== 'COMPLETED') return false;
    const saleDate = new Date(s.date);
    if (period === 'today') return s.date.slice(0, 10) === todayStr;
    if (period === '7d') return saleDate >= sevenDaysAgo;
    if (period === '30d') return saleDate >= thirtyDaysAgo;
    if (period === 'month') return saleDate >= startOfMonth;
    if (period === 'year') return saleDate >= startOfYear;
    return true;
  });

  const filteredMovements = stockMovements.filter(m => {
    const mDate = new Date(m.date);
    if (period === 'today') return m.date.slice(0, 10) === todayStr;
    if (period === '7d') return mDate >= sevenDaysAgo;
    if (period === '30d') return mDate >= thirtyDaysAgo;
    if (period === 'month') return mDate >= startOfMonth;
    if (period === 'year') return mDate >= startOfYear;
    return true;
  });

  // --- 1. KPIs FINANCEIROS & GERAIS ---
  const totalFaturamento = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const totalLucro = filteredSales.reduce((acc, s) => acc + (s.profit || 0), 0);
  const margemMedia = totalFaturamento > 0 ? (totalLucro / totalFaturamento) * 100 : 0;
  const ticketMedio = filteredSales.length > 0 ? totalFaturamento / filteredSales.length : 0;
  
  // Total de itens vendidos e UPT (Units Per Transaction / Basket Size)
  const totalItensVendidos = filteredSales.reduce((acc, s) => acc + s.items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const basketSizeMedio = filteredSales.length > 0 ? totalItensVendidos / filteredSales.length : 0;

  // --- 2. EVOLUÇÃO DIÁRIA & FORMAS DE PAGAMENTO ---
  const salesByDayMap = new Map<string, { faturamento: number; lucro: number }>();
  filteredSales.forEach(s => {
    const day = new Date(s.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const current = salesByDayMap.get(day) || { faturamento: 0, lucro: 0 };
    current.faturamento += s.total;
    current.lucro += (s.profit || 0);
    salesByDayMap.set(day, current);
  });

  const dataArea = Array.from(salesByDayMap.entries()).map(([name, data]) => ({
    name,
    faturamento: Math.round(data.faturamento),
    lucro: Math.round(data.lucro)
  })).slice(-15);

  const paymentMethodsCount: Record<string, number> = {
    'Pix': 0, 'Crédito': 0, 'Débito': 0, 'Dinheiro': 0, 'Fiado': 0, 'Voucher': 0
  };

  filteredSales.forEach(s => {
    s.paymentMethods.forEach(pm => {
      if (pm.method === 'PIX') paymentMethodsCount['Pix'] += pm.amount;
      else if (pm.method === 'CREDIT_CARD') paymentMethodsCount['Crédito'] += pm.amount;
      else if (pm.method === 'DEBIT_CARD') paymentMethodsCount['Débito'] += pm.amount;
      else if (pm.method === 'CASH') paymentMethodsCount['Dinheiro'] += pm.amount;
      else if (pm.method === 'FIADO') paymentMethodsCount['Fiado'] += pm.amount;
      else if (pm.method === 'VOUCHER') paymentMethodsCount['Voucher'] += pm.amount;
    });
  });

  const dataPie = Object.entries(paymentMethodsCount)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value: Math.round(value) }));

  // Projeção Mensal
  const currentMonthSales = sales.filter(s => s.status === 'COMPLETED' && new Date(s.date) >= startOfMonth);
  const currentMonthRevenue = currentMonthSales.reduce((acc, s) => acc + s.total, 0);
  const currentDayOfMonth = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projecaoMensal = (currentMonthRevenue / currentDayOfMonth) * daysInMonth;

  // Ponto de Equilíbrio
  const totalCustosFixos = custoAluguel + custoEnergia + custoSalarios;
  const margemContribuicaoCalc = margemMedia > 0 ? margemMedia / 100 : 0.35;
  const pontoEquilibrio = totalCustosFixos / margemContribuicaoCalc;
  const percentualPontoAtingido = Math.min(100, Math.round((currentMonthRevenue / (pontoEquilibrio || 1)) * 100));

  // --- 3. INTELIGÊNCIA DE ESTOQUE & FLUXOS (ENTRADAS, SAÍDAS, PERDAS, GIRO & AUTONOMIA) ---
  const activeProducts = products.filter(p => p.isActive);
  const valorTotalEstoqueCusto = activeProducts.reduce((acc, p) => acc + (p.costPrice * p.stock), 0);
  const valorTotalEstoqueVenda = activeProducts.reduce((acc, p) => acc + (p.sellPrice * p.stock), 0);

  // Volume de Entradas vs Volume de Saídas
  const totalEntradasQtd = filteredMovements.filter(m => m.type === 'IN').reduce((acc, m) => acc + m.quantity, 0);
  const totalEntradasValor = filteredMovements.filter(m => m.type === 'IN').reduce((acc, m) => acc + (m.quantity * (m.costPrice || 0)), 0);

  const totalSaidasVendasQtd = filteredMovements.filter(m => m.type === 'SALE').reduce((acc, m) => acc + m.quantity, 0);
  const totalAvariasPerdasQtd = filteredMovements.filter(m => m.type === 'OUT').reduce((acc, m) => acc + m.quantity, 0);
  const totalAvariasPerdasValor = filteredMovements.filter(m => m.type === 'OUT').reduce((acc, m) => acc + (m.quantity * (m.costPrice || 0)), 0);

  // Taxa de Perda / Avaria (Shrinkage Rate %)
  const taxaAvariaPercent = totalFaturamento > 0 ? (totalAvariasPerdasValor / totalFaturamento) * 100 : 0;

  // Giro de Estoque (Turnover & DIO - Days of Inventory Outstanding)
  const custoMercadoriasVendidas = filteredSales.reduce((acc, s) => acc + (s.costTotal || 0), 0);
  const giroEstoque = valorTotalEstoqueCusto > 0 ? Number((custoMercadoriasVendidas / valorTotalEstoqueCusto).toFixed(2)) : 0;
  const diasGiroEstoqueDIO = giroEstoque > 0 ? Math.round((30 / giroEstoque)) : 45;

  // Cálculo de Autonomia (Cobertura de Estoque) e Sugestão de Compra por Produto
  const productAnalyticsList = activeProducts.map(p => {
    // Vendas do produto nos últimos 30 dias — soma TODOS os itens da venda que
    // casam com o produto (antes usava find(), perdendo vendas com o mesmo
    // produto em mais de uma linha, ex.: pacote + avulso no mesmo cupom).
    const productSales30d = sales.filter(s => s.status === 'COMPLETED' && new Date(s.date) >= thirtyDaysAgo)
      .reduce((sum, s) => {
        const qty = s.items
          .filter(i => i.productId === p.id || i.productId === `${p.id}-alt`)
          .reduce((acc, item) => {
            // Converte frações vendidas (ex: cigarro avulso) para a unidade do
            // pacote, senão a autonomia mistura unidades incomparáveis.
            return acc + (item.isAlternativeUnit && item.originalUnitFactor
              ? item.quantity / item.originalUnitFactor
              : item.quantity);
          }, 0);
        return sum + qty;
      }, 0);

    const mediaDiariaVendas = productSales30d / 30;
    const diasAutonomia = mediaDiariaVendas > 0 ? Math.round(p.stock / mediaDiariaVendas) : (p.stock > 0 ? 999 : 0);

    // Sugestão de Reposição: (Consumo Diário * Prazo Fornecedor de 5 dias) + Estoque de Segurança
    const pontoDePedido = Math.ceil((mediaDiariaVendas * 5) + p.minStock);
    const sugestaoCompra = Math.max(0, pontoDePedido - Math.floor(p.stock));

    let statusAutonomia: 'CRITICAL' | 'WARNING' | 'HEALTHY' | 'EXCESS' = 'HEALTHY';
    if (p.stock <= 0 || diasAutonomia < 3) statusAutonomia = 'CRITICAL';
    else if (diasAutonomia <= 7) statusAutonomia = 'WARNING';
    else if (diasAutonomia > 45 && p.stock > p.minStock * 2) statusAutonomia = 'EXCESS';

    return {
      product: p,
      vendas30d: Number(productSales30d.toFixed(1)),
      mediaDiaria: Number(mediaDiariaVendas.toFixed(2)),
      diasAutonomia,
      pontoDePedido,
      sugestaoCompra,
      statusAutonomia
    };
  });

  const criticalAutonomyCount = productAnalyticsList.filter(item => item.statusAutonomia === 'CRITICAL').length;
  const warningAutonomyCount = productAnalyticsList.filter(item => item.statusAutonomia === 'WARNING').length;
  const excessAutonomyCount = productAnalyticsList.filter(item => item.statusAutonomia === 'EXCESS').length;

  // Fluxo Comparativo Semanal (Entradas vs Saídas) — dados reais por semana
  // (antes: percentuais fixos inventados, apresentados como se fossem dados reais)
  const inflowOutflowData = Array.from({ length: 4 }, (_, i) => {
    const end = Date.now() - i * 7 * 24 * 60 * 60 * 1000;
    const start = end - 7 * 24 * 60 * 60 * 1000;
    const entradas = filteredMovements
      .filter(m => m.type === 'IN')
      .filter(m => { const t = new Date(m.date).getTime(); return t >= start && t < end; })
      .reduce((acc, m) => acc + (m.quantity * (m.costPrice || 0)), 0);
    const saidas = filteredSales
      .filter(s => { const t = new Date(s.date).getTime(); return t >= start && t < end; })
      .reduce((acc, s) => acc + (s.costTotal || 0), 0);
    const labelStart = new Date(start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const labelEnd = new Date(end - 1).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return { name: `${labelStart} - ${labelEnd}`, entradas: Math.round(entradas), saidas: Math.round(saidas) };
  });

  // --- 4. CURVA ABC & RENTABILIDADE POR PRODUTO / CATEGORIA ---
  const productRevenueMap = new Map<string, { name: string; revenue: number; profit: number; qty: number; categoryId?: string }>();
  filteredSales.forEach(s => {
    s.items.forEach(item => {
      const rawId = item.productId.replace('-alt', '');
      const prod = products.find(p => p.id === rawId);
      const current = productRevenueMap.get(rawId) || { 
        name: prod?.name || item.productName, 
        revenue: 0, 
        profit: 0, 
        qty: 0,
        categoryId: prod?.categoryId 
      };
      current.revenue += item.total;
      current.profit += (item.total - (item.costPrice * item.quantity));
      current.qty += item.quantity;
      productRevenueMap.set(rawId, current);
    });
  });

  const sortedProducts = Array.from(productRevenueMap.entries())
    .map(([id, data]) => ({ 
      id, 
      name: data.name, 
      faturamento: data.revenue, 
      lucro: data.profit,
      qty: data.qty,
      margem: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  let accumulated = 0;
  const abcData = sortedProducts.map(p => {
    accumulated += p.faturamento;
    const percentage = totalFaturamento > 0 ? (accumulated / totalFaturamento) * 100 : 0;
    let abcClass = 'C';
    if (percentage <= 80) abcClass = 'A';
    else if (percentage <= 95) abcClass = 'B';
    return { ...p, class: abcClass, acumuladoPct: Number(percentage.toFixed(1)) };
  });

  // Top 10 Mais Lucrativos em R$
  const topProfitableProducts = [...sortedProducts]
    .sort((a, b) => b.lucro - a.lucro)
    .slice(0, 8);

  // Vendas por Categoria & Pareto
  const categorySalesMap = new Map<string, { faturamento: number; lucro: number }>();
  filteredSales.forEach(s => {
    s.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId.replace('-alt', ''));
      const cat = categories.find(c => c.id === prod?.categoryId);
      const catName = cat?.name || 'Geral';
      const cur = categorySalesMap.get(catName) || { faturamento: 0, lucro: 0 };
      cur.faturamento += item.total;
      cur.lucro += (item.total - (item.costPrice * item.quantity));
      categorySalesMap.set(catName, cur);
    });
  });

  let catAccumulated = 0;
  const paretoData = Array.from(categorySalesMap.entries())
    .map(([name, val]) => ({ 
      name, 
      vendas: Math.round(val.faturamento), 
      lucro: Math.round(val.lucro),
      margem: val.faturamento > 0 ? Number(((val.lucro / val.faturamento) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.vendas - a.vendas)
    .map(cat => {
      catAccumulated += cat.vendas;
      const acumulado = totalFaturamento > 0 ? Math.round((catAccumulated / totalFaturamento) * 100) : 0;
      return { ...cat, acumulado };
    });

  // --- 5. CESTA DE COMPRAS & CROSS-SELLING (PRODUTOS COMPRADOS JUNTOS) ---
  const pairCountMap = new Map<string, { prodA: string; prodB: string; count: number; revenue: number }>();
  const basketSizeDistribution = { '1 item': 0, '2 a 3 itens': 0, '4 a 5 itens': 0, '6+ itens': 0 };

  filteredSales.forEach(s => {
    const totalQty = s.items.reduce((acc, i) => acc + i.quantity, 0);
    if (totalQty === 1) basketSizeDistribution['1 item']++;
    else if (totalQty <= 3) basketSizeDistribution['2 a 3 itens']++;
    else if (totalQty <= 5) basketSizeDistribution['4 a 5 itens']++;
    else basketSizeDistribution['6+ itens']++;

    // Pares de produtos comprados juntos
    const uniqueItemNames = Array.from(new Set(s.items.map(i => i.productName.replace(/\s\(.*\)/, ''))));
    for (let i = 0; i < uniqueItemNames.length; i++) {
      for (let j = i + 1; j < uniqueItemNames.length; j++) {
        const prodA = uniqueItemNames[i];
        const prodB = uniqueItemNames[j];
        const key = [prodA, prodB].sort().join(' + ');
        const cur = pairCountMap.get(key) || { prodA, prodB, count: 0, revenue: 0 };
        cur.count++;
        cur.revenue += s.total;
        pairCountMap.set(key, cur);
      }
    }
  });

  const topCrossSellPairs = Array.from(pairCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const basketDistributionChart = Object.entries(basketSizeDistribution).map(([name, count]) => ({
    name,
    vendas: count,
    pct: filteredSales.length > 0 ? Math.round((count / filteredSales.length) * 100) : 0
  }));

  // --- 6. CLIENTES & CADERNETA (FIADO) ---
  const totalFiadoReceber = customers.reduce((acc, c) => acc + (c.debtBalance || 0), 0);
  const totalLimiteConcedido = customers.reduce((acc, c) => acc + (c.creditLimit || 0), 0);
  const taxaComprometimentoCredito = totalLimiteConcedido > 0 ? (totalFiadoReceber / totalLimiteConcedido) * 100 : 0;

  const totalVendasFiadoValor = filteredSales.reduce((acc, s) => {
    const fiadoPm = s.paymentMethods.find(m => m.method === 'FIADO');
    return acc + (fiadoPm ? fiadoPm.amount : 0);
  }, 0);
  const taxaPenetracaoFiado = totalFaturamento > 0 ? (totalVendasFiadoValor / totalFaturamento) * 100 : 0;

  const topCustomers = [...customers]
    .map(c => {
      // Só vendas CONCLUÍDAS contam para o histórico de compras do cliente
      // (antes incluía canceladas/estornadas, inflando o valor do cliente).
      const customerSales = sales.filter(s => s.customerId === c.id && s.status === 'COMPLETED');
      const totalPurchased = customerSales.reduce((acc, s) => acc + s.total, 0);
      return {
        ...c,
        totalPurchased,
        salesCount: customerSales.length
      };
    })
    .sort((a, b) => b.totalPurchased - a.totalPurchased);

  // Heatmap Matriz Horários de Pico
  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hourRanges = [
    { label: '06-09h', min: 6, max: 9 },
    { label: '09-12h', min: 9, max: 12 },
    { label: '12-15h', min: 12, max: 15 },
    { label: '15-18h', min: 15, max: 18 },
    { label: '18-21h', min: 18, max: 21 },
    { label: '21-23h', min: 21, max: 23 },
  ];

  const heatmapMatrix = daysOfWeek.map((day, dayIndex) => {
    const hoursCount = hourRanges.map(range => {
      return filteredSales.filter(s => {
        const d = new Date(s.date);
        const h = d.getHours();
        return d.getDay() === dayIndex && h >= range.min && h < range.max;
      }).length;
    });
    return { day, hours: hoursCount };
  });

  const showHelp = (title: string, def: string, tip: string, form?: string) => {
    setHelpInfo({ title, definition: def, tip, formula: form });
  };

  const HelpBtn = ({ title, def, tip, form }: { title: string; def: string; tip: string; form?: string }) => (
    <button 
      onClick={(e) => { e.stopPropagation(); showHelp(title, def, tip, form); }} 
      className="absolute right-3 top-3 text-slate-400 hover:text-emerald-500 transition-colors z-10 p-1 cursor-pointer"
      title="Entenda esta métrica"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Período */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            Central de Inteligência & Índices Comerciais
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Estatísticas avançadas de vendas, movimentações de estoque, giro, cross-selling e caderneta.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as any)}
            className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm outline-none cursor-pointer"
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Este Mês</option>
            <option value="year">Este Ano</option>
            <option value="all">Todo o Histórico</option>
          </select>
        </div>
      </div>

      {/* Navegação por Abas Especializadas */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-200/60 dark:bg-slate-800/80 rounded-2xl">
        <button
          onClick={() => setActiveTab('financial')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'financial'
              ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600" />
          Faturamento & Lucratividade
        </button>

        <button
          onClick={() => setActiveTab('inventory_flow')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'inventory_flow'
              ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Boxes className="w-4 h-4 text-blue-600" />
          Inteligência de Estoque & Fluxos
          {criticalAutonomyCount > 0 && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px]">
              {criticalAutonomyCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('abc_profit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'abc_profit'
              ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-violet-600" />
          Curva ABC & Rentabilidade
        </button>

        <button
          onClick={() => setActiveTab('cross_sell')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'cross_sell'
              ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className="w-4 h-4 text-amber-600" />
          Cesta de Compras & Cross-Selling
        </button>

        <button
          onClick={() => setActiveTab('customer_credit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'customer_credit'
              ? 'bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4 text-purple-600" />
          Clientes & Caderneta (Fiado)
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: FATURAMENTO & LUCRATIVIDADE */}
      {/* ========================================================================= */}
      {activeTab === 'financial' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Faturamento Bruto" def="Total em R$ de todas as vendas concluídas no período." tip="Eleve o faturamento aumentando o ticket médio ou atraindo novos clientes." form="Soma(Total das Vendas)" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Faturamento Bruto
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {formatCurrency(totalFaturamento)}
              </p>
              <span className="text-xs text-slate-400">{filteredSales.length} atendimentos</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Lucro Bruto" def="Valor que sobra das vendas após descontar o custo das mercadorias vendidas." tip="Mantenha a margem bruta acima de 30% para sustentar custos fixos e gerar lucro líquido." form="Faturamento - Custo das Mercadorias Vendidas (CMV)" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-600" /> Lucro Bruto Real
              </span>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                {formatCurrency(totalLucro)}
              </p>
              <span className="text-xs text-emerald-600 font-bold">Margem Média: {margemMedia.toFixed(1)}%</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Ticket Médio" def="Valor médio gasto pelo cliente a cada compra no caixa." tip="Incentive combos e produtos de impulso para elevar o ticket." form="Faturamento / Quantidade de Vendas" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-violet-600" /> Ticket Médio
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {formatCurrency(ticketMedio)}
              </p>
              <span className="text-xs text-slate-400">por venda</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Itens por Venda (Basket Size / UPT)" def="Quantidade média de produtos que cada cliente compra por atendimento." tip="Se este número estiver próximo de 1.0, promova vendas casadas e cross-selling." form="Total de Unidades Vendidas / Total de Vendas" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-amber-600" /> Itens por Cesta (UPT)
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {basketSizeMedio.toFixed(1)} <span className="text-xs font-normal text-slate-400">un/venda</span>
              </p>
              <span className="text-xs text-slate-400">{totalItensVendidos.toFixed(0)} itens no período</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Ponto de Equilíbrio Mensal" def="Faturamento mínimo necessário para cobrir custos fixos e não ter prejuízo." tip="Acima deste valor, a margem de contribuição entra limpa no seu bolso." form="Custos Fixos / Margem de Contribuição" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-rose-600" /> Ponto de Equilíbrio
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {formatCurrency(pontoEquilibrio)}
              </p>
              <span className="text-xs text-slate-400">{percentualPontoAtingido}% atingido no mês</span>
            </div>
          </div>

          {/* Gráfico de Evolução & Métodos de Pagamento */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Evolução Diária" def="Histórico de vendas e lucro dia após dia." tip="Monitore oscilações para planejar promoções nos dias mais fracos." />
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Evolução Diária de Faturamento & Lucro
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dataArea}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="#94a3b8" tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(val: any) => [formatCurrency(Number(val || 0)), '']} />
                    <Area type="monotone" dataKey="faturamento" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Faturamento" />
                    <Area type="monotone" dataKey="lucro" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Lucro Bruto" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              {/* Formas de Pagamento */}
              <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
                <HelpBtn title="Formas de Pagamento" def="Distribuição das formas de pagamento usadas pelos clientes." tip="Incentive Pix para economizar taxas de cartão." />
                <h3 className="font-bold text-slate-800 dark:text-white mb-2 text-sm flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-teal-600" />
                  Formas de Pagamento
                </h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={dataPie} innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                        {dataPie.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [formatCurrency(Number(v || 0)), 'Valor']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 justify-center text-xs">
                  {dataPie.map((item, idx) => (
                    <span key={idx} className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card Projeção */}
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-2xl text-white shadow-sm relative">
                <h3 className="font-bold mb-2 opacity-90 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" /> Projeção de Fechamento do Mês
                </h3>
                <div className="text-3xl font-black mb-2">{formatCurrency(projecaoMensal)}</div>
                <div className="w-full bg-black/20 rounded-full h-2 mb-2">
                  <div 
                    className="bg-amber-300 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, Math.round((currentMonthRevenue / (projecaoMensal || 1)) * 100))}%` }} 
                  />
                </div>
                <div className="flex justify-between text-xs opacity-90 font-medium">
                  <span>Realizado: {formatCurrency(currentMonthRevenue)}</span>
                  <span>Dia {currentDayOfMonth} de {daysInMonth}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Break-Even & Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 text-sm">
                <Layers className="w-4 h-4 text-purple-600" />
                Simulador de Ponto de Equilíbrio (Break-Even)
              </h3>
              
              <div className="grid grid-cols-2 gap-3 mb-4 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Aluguel (R$)</label>
                  <input type="number" value={custoAluguel} onChange={e => setCustoAluguel(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-sm bg-white dark:bg-slate-800 font-bold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Energia/Água (R$)</label>
                  <input type="number" value={custoEnergia} onChange={e => setCustoEnergia(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-sm bg-white dark:bg-slate-800 font-bold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Salários (R$)</label>
                  <input type="number" value={custoSalarios} onChange={e => setCustoSalarios(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-sm bg-white dark:bg-slate-800 font-bold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Margem Contribuição</label>
                  <div className="w-full border rounded-lg p-1.5 text-sm bg-slate-200/60 dark:bg-slate-700 font-bold">
                    {(margemContribuicaoCalc * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="text-center p-4 border border-purple-200 dark:border-purple-800/60 bg-purple-50 dark:bg-purple-950/30 rounded-xl">
                <span className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase">Faturamento Mínimo Mensal</span>
                <div className="text-2xl sm:text-3xl font-black text-purple-900 dark:text-purple-200 mt-1">
                  {formatCurrency(pontoEquilibrio)}
                </div>
              </div>
            </div>

            {/* Heatmap de Horários de Pico */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-rose-500" />
                Heatmap de Horários de Pico (Vendas por Faixa Horária)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr>
                      <th className="p-1 text-slate-400 font-medium">Dia</th>
                      {hourRanges.map(h => (
                        <th key={h.label} className="p-1 text-slate-500 dark:text-slate-400 font-medium">{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapMatrix.map(row => (
                      <tr key={row.day}>
                        <td className="p-1 font-bold text-slate-700 dark:text-slate-300">{row.day}</td>
                        {row.hours.map((val, idx) => {
                          let colorClass = 'bg-slate-100 dark:bg-slate-700/50 text-slate-400';
                          if (val > 10) colorClass = 'bg-rose-500 text-white font-bold';
                          else if (val > 5) colorClass = 'bg-orange-400 text-white font-bold';
                          else if (val > 2) colorClass = 'bg-amber-300 text-amber-900 font-medium';
                          else if (val > 0) colorClass = 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300';

                          return (
                            <td key={idx} className="p-0.5">
                              <div className={`w-full h-7 rounded-md flex items-center justify-center text-[11px] ${colorClass}`}>
                                {val}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: INTELIGÊNCIA DE ESTOQUE & FLUXOS (ENTRADAS, SAÍDAS, PERDAS, GIRO & AUTONOMIA) */}
      {/* ========================================================================= */}
      {activeTab === 'inventory_flow' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* KPIs de Estoque */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Giro de Estoque (Turnover)" def="Mede quantas vezes o estoque total foi renovado no período." tip="Um giro alto indica produtos vendendo rápido com pouco capital empatado." form="Custo das Mercadorias Vendidas (CMV) / Custo do Estoque Atual" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-blue-600" /> Giro de Estoque (Turnover)
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {giroEstoque}x <span className="text-xs font-normal text-slate-400">no período</span>
              </p>
              <span className="text-xs text-blue-600 font-bold">Giro Médio: a cada ~{diasGiroEstoqueDIO} dias</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Capital em Estoque" def="Valor total empatado em mercadorias atualmente nas prateleiras e depósito." tip="Mantenha o valor em estoque balanceado com o faturamento mensal para não travar capital de giro." form="Soma(Estoque Atual * Preço de Custo)" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-emerald-600" /> Capital em Estoque
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {formatCurrency(valorTotalEstoqueCusto)}
              </p>
              <span className="text-xs text-emerald-600 font-medium">Potencial de Venda: {formatCurrency(valorTotalEstoqueVenda)}</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Taxa de Perdas & Avarias (Shrinkage)" def="Percentual e valor em R$ de perdas por avarias, vencimento e quebras registradas nas saídas avulsas." tip="Se a taxa passar de 2%, reforce o controle de validade e o manuseio de mercadorias frágeis." form="Total em R$ de Saídas por Avaria / Faturamento" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600" /> Perdas & Avarias
              </span>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
                {formatCurrency(totalAvariasPerdasValor)}
              </p>
              <span className="text-xs text-rose-600 font-bold">{taxaAvariaPercent.toFixed(2)}% do faturamento</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Alertas de Autonomia de Estoque" def="Quantidade de produtos com estoque para menos de 3 dias de vendas." tip="Providencie pedidos de compra urgentes para esses itens para evitar ruptura." form="Estoque Atual / Consumo Médio Diário < 3 dias" />
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Alerta de Autonomia
              </span>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
                {criticalAutonomyCount} <span className="text-xs font-normal text-slate-400">itens críticos</span>
              </p>
              <span className="text-xs text-amber-600 font-medium">{warningAutonomyCount} itens em atenção</span>
            </div>
          </div>

          {/* Gráfico de Balanço de Fluxo (Entradas vs Saídas) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Balanço de Fluxo de Mercadorias" def="Comparativo do valor em R$ que entrou por compras vs o custo do que saiu por vendas e avarias." tip="Entradas muito maiores que saídas por semanas consecutivas podem indicar sobre-estoque." />
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                Balanço de Fluxo: Entradas (Compras) vs Saídas (Vendas/Avarias)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inflowOutflowData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                    <YAxis fontSize={11} stroke="#94a3b8" tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={(val: any) => [formatCurrency(Number(val || 0)), '']} />
                    <Legend />
                    <Bar dataKey="entradas" fill="#10b981" name="Entradas por Compras (R$)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" fill="#3b82f6" name="Saídas por Vendas/CMV (R$)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  Resumo de Movimentações Físicas
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">Total Comprado / Entradas:</span>
                    <strong className="text-emerald-900 dark:text-emerald-200">+{totalEntradasQtd.toFixed(0)} un ({formatCurrency(totalEntradasValor)})</strong>
                  </div>

                  <div className="flex justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
                    <span className="font-semibold text-blue-800 dark:text-blue-300">Baixado por Vendas:</span>
                    <strong className="text-blue-900 dark:text-blue-200">-{totalSaidasVendasQtd.toFixed(0)} un ({formatCurrency(custoMercadoriasVendidas)})</strong>
                  </div>

                  <div className="flex justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50">
                    <span className="font-semibold text-rose-800 dark:text-rose-300">Avarias e Descartes:</span>
                    <strong className="text-rose-900 dark:text-rose-200">-{totalAvariasPerdasQtd.toFixed(0)} un ({formatCurrency(totalAvariasPerdasValor)})</strong>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-[11px] text-slate-500 border border-slate-200 dark:border-slate-700">
                💡 <strong>Dica de Giro:</strong> Mantenha itens de alto giro (ex: bebidas, pães) com pedidos semanais e itens de baixo giro com reposição quinzenal para otimizar fluxo de caixa.
              </div>
            </div>
          </div>

          {/* Tabela de Sugestão de Reposição & Cobertura de Estoque */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Sugestão de Reposição & Dias de Autonomia por Produto
                </h3>
                <p className="text-xs text-slate-400">Calculado com base no consumo médio diário e tempo estimado de entrega de 5 dias.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/60 uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3 text-right">Estoque Atual</th>
                    <th className="px-4 py-3 text-right">Vendas (30d)</th>
                    <th className="px-4 py-3 text-right">Consumo Diário</th>
                    <th className="px-4 py-3 text-center">Dias de Autonomia</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right font-bold text-emerald-600">Sugestão de Compra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {productAnalyticsList.map(item => (
                    <tr key={item.product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 dark:text-white">{item.product.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">Min: {item.product.minStock} {item.product.unit}</span>
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                        {item.product.stock} {item.product.unit}
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {item.vendas30d} {item.product.unit}
                      </td>

                      <td className="px-4 py-3 text-right font-mono">
                        {item.mediaDiaria}/dia
                      </td>

                      <td className="px-4 py-3 text-center font-bold">
                        {item.diasAutonomia > 300 ? '∞' : `${item.diasAutonomia} dias`}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          item.statusAutonomia === 'CRITICAL' 
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' 
                            : item.statusAutonomia === 'WARNING'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : item.statusAutonomia === 'EXCESS'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}>
                          {item.statusAutonomia === 'CRITICAL' && '🚨 Crítico (<3d)'}
                          {item.statusAutonomia === 'WARNING' && '⚠️ Atenção (3-7d)'}
                          {item.statusAutonomia === 'HEALTHY' && '✅ Saudável'}
                          {item.statusAutonomia === 'EXCESS' && '💤 Parado (>45d)'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        {item.sugestaoCompra > 0 ? (
                          <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-md">
                            Pedir +{item.sugestaoCompra} {item.product.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">Estoque OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: CURVA ABC & RENTABILIDADE POR PRODUTO / CATEGORIA */}
      {/* ========================================================================= */}
      {activeTab === 'abc_profit' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Lucro vs Pareto */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Produtos mais Rentáveis */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Top Produtos mais Rentáveis" def="Produtos que deixaram a maior quantia bruta de lucro em R$ no caixa." tip="Estes são os verdadeiros geradores de riqueza do seu negócio. Mantenha-os sempre em destaque." form="Soma(Preço Venda - Preço Custo)" />
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                Top Produtos Mais Rentáveis (Maior Lucro Bruto em R$)
              </h3>
              
              <div className="space-y-2.5">
                {topProfitableProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center justify-center text-xs font-black">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">{p.name}</p>
                        <p className="text-[10px] text-slate-400">{p.qty} un vendidas • Margem {p.margem.toFixed(1)}%</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-black text-emerald-600 dark:text-emerald-400 text-sm">+{formatCurrency(p.lucro)}</p>
                      <p className="text-[10px] text-slate-400 font-mono">Fat: {formatCurrency(p.faturamento)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pareto por Categoria */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Análise de Pareto por Categoria" def="Compara o faturamento de cada categoria com a curva acumulada (Regra 80/20)." tip="Foque no mix dos setores que compõem a maior parte da barra esquerda." />
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-600" />
                Vendas por Categoria (Princípio de Pareto)
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paretoData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
                    <YAxis yAxisId="left" fontSize={11} stroke="#94a3b8" tickFormatter={v => `R$${v}`} />
                    <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="#94a3b8" tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <Tooltip formatter={(v: any) => [`${v}`, '']} />
                    <Bar yAxisId="left" dataKey="vendas" fill="#8b5cf6" name="Vendas (R$)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="#f59e0b" strokeWidth={3} name="% Acumulado" dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tabela Completa da Curva ABC */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Curva ABC Completa de Todos os Produtos Vendidos
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/60 uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-center">Classe</th>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3 text-right">Qtd Vendida</th>
                    <th className="px-4 py-3 text-right">Faturamento (R$)</th>
                    <th className="px-4 py-3 text-right">Lucro Bruto (R$)</th>
                    <th className="px-4 py-3 text-right">Margem %</th>
                    <th className="px-4 py-3 text-right">% Acumulada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {abcData.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center text-xs font-black ${
                          item.class === 'A' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                          item.class === 'B' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 
                          'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {item.class}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                        {item.name}
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {item.qty} un
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrency(item.faturamento)}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(item.lucro)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold">
                        {item.margem.toFixed(1)}%
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-slate-400">
                        {item.acumuladoPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 4: CESTA DE COMPRAS & CROSS-SELLING (PRODUTOS COMPRADOS JUNTOS) */}
      {/* ========================================================================= */}
      {activeTab === 'cross_sell' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Pares Comprados Juntos */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <HelpBtn title="Cross-Selling & Itens Comprados Juntos" def="Identifica quais produtos os clientes compram simultaneamente no mesmo cupom fiscal." tip="Posicione esses produtos próximos na loja física ou monte kits promocionais para aumentar as vendas." />
              <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-emerald-600" />
                Produtos Frequentemente Comprados Juntos (Market Basket Affinity)
              </h3>

              <div className="space-y-3">
                {topCrossSellPairs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">Ainda não há vendas com múltiplos itens para correlacionar.</p>
                ) : (
                  topCrossSellPairs.map((pair, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 flex items-center justify-center text-xs font-black">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <span>{pair.prodA}</span>
                            <span className="text-amber-500 font-black">+</span>
                            <span>{pair.prodB}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">Apareceram juntos em {pair.count} compras</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-black text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg">
                          {formatCurrency(pair.revenue)} gerados
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Distribuição do Basket Size */}
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 relative flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white mb-2 text-sm flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                  Distribuição da Cesta (Itens por Compra)
                </h3>
                <p className="text-xs text-slate-400 mb-4">Volume de itens levados por atendimento.</p>

                <div className="space-y-3">
                  {basketDistributionChart.map(b => (
                    <div key={b.name} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>{b.name}</span>
                        <span>{b.vendas} vendas ({b.pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${b.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 mt-4">
                💡 <strong>Dica de Cross-Selling:</strong> Crie a promoção "Leve 1 {topCrossSellPairs[0]?.prodA || 'Item A'} + 1 {topCrossSellPairs[0]?.prodB || 'Item B'} com 5% de desconto" para aumentar a quantidade de itens por cesta.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 5: CLIENTES & CADERNETA (FIADO) */}
      {/* ========================================================================= */}
      {activeTab === 'customer_credit' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-600" /> Fiado Total a Receber
              </span>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-2">
                {formatCurrency(totalFiadoReceber)}
              </p>
              <span className="text-xs text-slate-400">em aberto na caderneta</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <Percent className="w-4 h-4 text-blue-600" /> Penetração do Fiado
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {taxaPenetracaoFiado.toFixed(1)}% <span className="text-xs font-normal text-slate-400">das vendas</span>
              </p>
              <span className="text-xs text-slate-400">{formatCurrency(totalVendasFiadoValor)} vendidos no fiado</span>
            </div>

            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 relative">
              <span className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-600" /> Comprometimento do Limite
              </span>
              <p className="text-2xl font-black text-slate-800 dark:text-white mt-2">
                {taxaComprometimentoCredito.toFixed(1)}% <span className="text-xs font-normal text-slate-400">do total</span>
              </p>
              <span className="text-xs text-slate-400">Limite total: {formatCurrency(totalLimiteConcedido)}</span>
            </div>
          </div>

          {/* Ranking de Clientes */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                Histórico & Ranking de Clientes Cadastrados
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/60 uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Contato</th>
                    <th className="px-4 py-3 text-right">Limite Concedido</th>
                    <th className="px-4 py-3 text-right">Saldo Devedor Atual</th>
                    <th className="px-4 py-3 text-right">Compras Realizadas</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {topCustomers.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800 dark:text-white">{c.name}</span>
                        {c.notes && <span className="text-[10px] text-slate-400 block">{c.notes}</span>}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-500">
                        {c.phone}
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(c.creditLimit)}
                      </td>

                      <td className="px-4 py-3 text-right font-black">
                        <span className={c.debtBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}>
                          {formatCurrency(c.debtBalance)}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-slate-800 dark:text-white">
                        {formatCurrency(c.totalPurchased)} ({c.salesCount} compras)
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          c.debtBalance > 0 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' 
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}>
                          {c.debtBalance > 0 ? 'Débito Aberto' : 'Em Dia'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Didático de Ajuda */}
      {helpInfo && (
        <MetricHelpModal 
          title={helpInfo.title}
          definition={helpInfo.definition}
          tip={helpInfo.tip}
          formula={helpInfo.formula}
          onClose={() => setHelpInfo(null)}
        />
      )}
    </div>
  );
}

export default Financial;
