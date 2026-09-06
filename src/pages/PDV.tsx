import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  Search, ShoppingCart, Trash2, Camera, MonitorSmartphone, 
  Smartphone, Minus, Plus, Layers, AlertCircle, Check, 
  Tag, X, LockOpen 
} from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { toPackUnits } from '../utils/calc';
import type { SaleItem, Product, PaymentMethodEntry, Sale } from '../types';
import { PaymentModal } from '../components/pdv/PaymentModal';
import { ReceiptModal } from '../components/pdv/ReceiptModal';
import { BarcodeScannerModal } from '../components/pdv/BarcodeScannerModal';
import { MobileScannerModal } from '../components/pdv/MobileScannerModal';
import { useCustomerDisplay } from '../hooks/useCustomerDisplay';
import { takePendingRepeatSale, subscribeRepeatSale } from '../utils/repeatSale';
import confetti from 'canvas-confetti';
import { playSuccess, playBeep, playError } from '../utils/audio';
import { toast } from 'sonner';

export const PDV: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [globalDiscount, setGlobalDiscount] = useState(0);
  
  const [isPaymentOpen, setPaymentOpen] = useState(false);
  const [isReceiptOpen, setReceiptOpen] = useState(false);
  const [isBarcodeOpen, setBarcodeOpen] = useState(false);
  const [isMobileScannerOpen, setMobileScannerOpen] = useState(false);
  
  // Modal de escolha de fração para produto com unidade alternativa
  const [fractionProduct, setFractionProduct] = useState<Product | null>(null);

  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const { updateCart, startPayment, updatePayment, completeSale, setIdle } = useCustomerDisplay();

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const activeSession = useLiveQuery(() => db.cashSessions.where('status').equals('OPEN').first());

  const products = useLiveQuery(() => {
    return db.products.filter(p => {
      if (!p.isActive) return false;
      const matchesSearch = 
        !searchTerm ||
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.barcode === searchTerm || 
        p.sku.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat = selectedCategory === 'ALL' || p.categoryId === selectedCategory;
      return matchesSearch && matchesCat;
    }).limit(60).toArray();
  }, [searchTerm, selectedCategory]) || [];

  const subtotal = cart.reduce((acc, item) => acc + item.total, 0);
  const total = Math.max(0, subtotal - globalDiscount);

  // Sync cart with Customer Display
  useEffect(() => {
    updateCart(cart, subtotal, globalDiscount, total);
  }, [cart, subtotal, globalDiscount, total, updateCart]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') { 
        e.preventDefault(); 
        searchInputRef.current?.focus(); 
      } else if (e.key === 'F3') { 
        e.preventDefault(); 
        setBarcodeOpen(true); 
      } else if (e.key === 'F4') { 
        e.preventDefault(); 
        if (cart.length > 0) {
          if (!activeSession) {
            toast.error('O caixa está fechado. Abra o caixa antes de realizar vendas.');
          } else {
            setPaymentOpen(true);
          }
        }
      } else if (e.key === 'F6') { 
        e.preventDefault(); 
        window.open('/?view=customer-display', '_blank', 'width=900,height=650'); 
      } else if (e.key === 'F7') { 
        e.preventDefault(); 
        setMobileScannerOpen(true); 
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0) {
          setCart(cart.slice(0, -1));
          toast.info('Último item removido do carrinho.');
        }
      } else if (e.key === 'F9') { 
        e.preventDefault(); 
        setCart([]); 
        setGlobalDiscount(0); 
        setIdle(); 
        toast.info('Carrinho limpo.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, activeSession, setIdle]);

  // Scanner de Código de Barras USB / Bluetooth (Buffer)
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;
    
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const currentTime = new Date().getTime();
      if (currentTime - lastTime > 120) {
        buffer = '';
      }
      lastTime = currentTime;

      if (e.key === 'Enter' && buffer.length >= 3) {
        handleBarcodeScanned(buffer.trim());
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [cart]);

  // Repetir Venda: recarrega no carrinho os itens de uma venda anterior
  // (cliente fiel), usando os dados atuais do produto (preço, estoque, unidade).
  const applyRepeatSale = async (items: SaleItem[]) => {
    const rebuilt: SaleItem[] = [];
    const warnings: string[] = [];

    for (const item of items) {
      const rawProdId = item.productId.replace('-alt', '');
      const product = await db.products.get(rawProdId);

      if (!product) {
        warnings.push(`"${item.productName}" não está mais cadastrado e foi ignorado.`);
        continue;
      }
      if (!product.isActive) {
        warnings.push(`"${item.productName}" está inativo e foi ignorado.`);
        continue;
      }

      const isAlternative = Boolean(item.isAlternativeUnit) && Boolean(product.alternativeUnit);
      const unitName = isAlternative ? product.alternativeUnit!.name : product.unit;
      const unitPrice = isAlternative ? product.alternativeUnit!.price : product.sellPrice;
      const costPrice = isAlternative
        ? product.costPrice / (product.alternativeUnit?.factor || 1)
        : product.costPrice;
      const cartItemId = isAlternative ? `${product.id}-alt` : product.id;
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));

      rebuilt.push({
        productId: cartItemId,
        productName: isAlternative ? `${product.name} (${product.alternativeUnit!.name})` : product.name,
        quantity: item.quantity,
        unit: unitName,
        unitPrice,
        costPrice,
        subtotal,
        discount: 0,
        total: subtotal,
        isAlternativeUnit: isAlternative,
        originalUnitFactor: isAlternative ? product.alternativeUnit?.factor : undefined
      });

      // Aviso de estoque (a validação final continua na finalização da venda)
      const needed = toPackUnits(item.quantity, isAlternative ? product.alternativeUnit?.factor : undefined);
      if (needed > product.stock + 0.0001) {
        warnings.push(`"${product.name}": estoque insuficiente para repetir (disponível ${product.stock} ${product.unit}, necessário ${needed.toFixed(3)}).`);
      }
    }

    if (rebuilt.length === 0) {
      playError();
      toast.error('Nenhum item pôde ser repetido — todos estão inativos ou sem estoque.');
      return;
    }

    setCart(prev => {
      const next = [...prev];
      for (const newItem of rebuilt) {
        const idx = next.findIndex(i => i.productId === newItem.productId);
        if (idx >= 0) {
          const existing = next[idx];
          const qty = existing.quantity + newItem.quantity;
          const sub = existing.unitPrice * qty;
          next[idx] = { ...existing, quantity: qty, subtotal: sub, total: Math.max(0, sub - existing.discount) };
        } else {
          next.push(newItem);
        }
      }
      return next;
    });

    playBeep();
    toast.success(`${rebuilt.length} ${rebuilt.length === 1 ? 'item repetido' : 'itens repetidos'} no carrinho.`);
    warnings.forEach(w => toast.warning(w));
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

  // Ao montar o PDV, consome a venda pendente vinda do Histórico de Vendas
  useEffect(() => {
    const pending = takePendingRepeatSale();
    if (pending && pending.length > 0) {
      applyRepeatSale(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PDV já montado: repetição disparada pelo cupom recém-finalizado (ReceiptModal)
  useEffect(() => {
    return subscribeRepeatSale(items => {
      if (items.length > 0) applyRepeatSale(items);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProductClick = (product: Product) => {
    if (product.stock <= 0) {
      toast.warning(`Atenção: "${product.name}" está sem estoque.`);
    }

    // Se tiver unidade alternativa de venda (ex: vender maço ou cigarro avulso)
    if (product.alternativeUnit) {
      setFractionProduct(product);
    } else {
      addToCart(product, 1, false);
    }
  };

  const addToCart = (product: Product, quantity = 1, isAlternative = false) => {
    playBeep();

    const unitName = isAlternative ? product.alternativeUnit!.name : product.unit;
    const unitPrice = isAlternative ? product.alternativeUnit!.price : product.sellPrice;
    const costPrice = isAlternative ? (product.costPrice / (product.alternativeUnit?.factor || 1)) : product.costPrice;
    const cartItemId = isAlternative ? `${product.id}-alt` : product.id;

    // Atualização funcional: evita perda de itens quando dois códigos de barras
    // são lidos em sequência rápida (antes, um closure desatualizado sobrescrevia o outro).
    setCart(prev => {
      const existing = prev.find(item => item.productId === cartItemId);
      if (existing) {
        const newQty = existing.quantity + quantity;
        const itemSub = existing.unitPrice * newQty;
        return prev.map(item => 
          item.productId === cartItemId
            ? { ...item, quantity: newQty, subtotal: itemSub, total: Math.max(0, itemSub - item.discount) }
            : item
        );
      }
      const itemSubtotal = unitPrice * quantity;
      return [...prev, {
        productId: cartItemId,
        productName: isAlternative ? `${product.name} (${product.alternativeUnit!.name})` : product.name,
        quantity,
        unit: unitName,
        unitPrice,
        costPrice,
        subtotal: itemSubtotal,
        discount: 0,
        total: itemSubtotal,
        isAlternativeUnit: isAlternative,
        originalUnitFactor: isAlternative ? product.alternativeUnit?.factor : undefined
      }];
    });

    setFractionProduct(null);
  };

  const updateQuantity = (cartItemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart(prev => prev.map(item => {
      if (item.productId === cartItemId) {
        const itemSub = item.unitPrice * qty;
        return { 
          ...item, 
          quantity: qty, 
          subtotal: itemSub, 
          total: Math.max(0, itemSub - item.discount) 
        };
      }
      return item;
    }));
  };

  // Desconto por item: nunca pode passar do subtotal da linha nem ser negativo
  const updateItemDiscount = (cartItemId: string, discount: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === cartItemId) {
        const d = Math.min(Math.max(0, discount), item.subtotal);
        return { ...item, discount: d, total: Math.max(0, item.subtotal - d) };
      }
      return item;
    }));
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(item => item.productId !== cartItemId));
  };

  const handleBarcodeScanned = async (barcode: string) => {
    // Busca por código de barras principal ou código de barras de fração
    const product = await db.products.filter(p => 
      Boolean(p.isActive && (
        p.barcode === barcode || 
        (p.alternativeUnit && p.alternativeUnit.barcode === barcode)
      ))
    ).first();

    if (product) {
      if (product.alternativeUnit && product.alternativeUnit.barcode === barcode) {
        addToCart(product, 1, true);
        toast.success(`Adicionado: ${product.name} (${product.alternativeUnit.name})`);
      } else if (product.alternativeUnit) {
        setFractionProduct(product);
      } else {
        addToCart(product, 1, false);
        toast.success(`Adicionado: ${product.name}`);
      }
    } else {
      playError();
      toast.error(`Código de barras não encontrado: ${barcode}`);
    }
  };

  const handlePaymentComplete = async (
    payments: PaymentMethodEntry[], 
    customerId?: string, 
    customerName?: string
  ) => {
    if (!activeSession) {
      toast.error('O caixa está fechado. Abra o caixa para registrar vendas.');
      return;
    }

    if (cart.length === 0) {
      toast.error('O carrinho está vazio.');
      return;
    }

    // Validação de estoque ANTES de registrar: impede venda de quantidade maior que o disponível
    const stockNeeded = new Map<string, { name: string; needed: number; available: number }>();
    for (const item of cart) {
      const rawProdId = item.productId.replace('-alt', '');
      const p = await db.products.get(rawProdId);
      if (!p) {
        toast.error(`Produto "${item.productName}" não encontrado no cadastro.`);
        return;
      }
      const deduction = toPackUnits(item.quantity, item.isAlternativeUnit ? item.originalUnitFactor : undefined);
      const current = stockNeeded.get(rawProdId) || { name: p.name, needed: 0, available: p.stock };
      current.needed += deduction;
      stockNeeded.set(rawProdId, current);
    }

    const outOfStock = Array.from(stockNeeded.values()).filter(s => s.needed > s.available + 0.0001);
    if (outOfStock.length > 0) {
      const list = outOfStock.map(s => `"${s.name}" (necessário ${s.needed.toFixed(3)}, disponível ${s.available.toFixed(3)})`).join(', ');
      toast.error(`Estoque insuficiente: ${list}`);
      return;
    }

    const saleNumber = await (async () => {
      const base = Date.now().toString().slice(-6);
      // Evita cupons duplicados em vendas consecutivas rápidas
      const exists = await db.sales.where('saleNumber').equals(base).count();
      if (!exists) return base;
      for (let i = 0; i < 26; i++) {
        const candidate = `${base}-${String.fromCharCode(65 + i)}`;
        const used = await db.sales.where('saleNumber').equals(candidate).count();
        if (!used) return candidate;
      }
      return `${base}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    })();

    const saleDate = new Date().toISOString();
    const costTotal = cart.reduce((acc, item) => acc + (item.costPrice * item.quantity), 0);
    const profit = Number((total - costTotal).toFixed(2));

    // Troco sai da gaveta: o caixa físico fica com (dinheiro recebido - troco dado)
    const totalPaid = payments.reduce((acc, pm) => acc + pm.amount, 0);
    const change = Math.max(0, totalPaid - total);
    const cashAmount = payments.filter(pm => pm.method === 'CASH').reduce((acc, pm) => acc + pm.amount, 0);
    const netCash = Math.max(0, cashAmount - change);

    const newSale: Sale = {
      id: crypto.randomUUID(),
      saleNumber,
      date: saleDate,
      items: cart,
      subtotal,
      discount: globalDiscount,
      total,
      costTotal,
      profit,
      paymentMethods: payments.map(pm => pm.method === 'CASH'
        ? { ...pm, details: { receivedAmount: pm.amount, change } }
        : pm),
      customerId,
      customerName,
      status: 'COMPLETED',
      cashierSessionId: activeSession.id
    };

    try {
      // Tudo em uma transação atômica: venda + estoque + movimentações + fiado + caixa
      await db.transaction('rw', [db.sales, db.products, db.stockMovements, db.customers, db.debtRecords, db.cashSessions], async () => {
        // 1. Gravar Venda
        await db.sales.add(newSale);

        // 2. Baixar estoque e registrar movimentações
        for (const item of cart) {
          const rawProdId = item.productId.replace('-alt', '');
          const p = await db.products.get(rawProdId);
          if (p) {
            const deduction = toPackUnits(item.quantity, item.isAlternativeUnit ? item.originalUnitFactor : undefined);

            const previousStock = p.stock;
            const newStock = Number((previousStock - deduction).toFixed(3));

            if (newStock < 0) {
              throw new Error(`Estoque insuficiente para "${p.name}"`);
            }

            await db.products.update(p.id, { 
              stock: newStock, 
              updatedAt: saleDate 
            });

            await db.stockMovements.add({
              id: crypto.randomUUID(),
              productId: p.id,
              productName: p.name,
              type: 'SALE',
              quantity: Number(deduction.toFixed(3)),
              previousStock,
              newStock,
              reason: `Venda PDV #${saleNumber}`,
              date: saleDate,
              userId: activeSession.cashierName || 'Operador',
              costPrice: p.costPrice
            });
          }
        }

        // 3. Atualizar Fiado se houver
        const fiadoPayment = payments.find(pm => pm.method === 'FIADO');
        if (fiadoPayment && customerId) {
          const customer = await db.customers.get(customerId);
          if (customer) {
            const prevBalance = customer.debtBalance || 0;
            const newBalance = prevBalance + fiadoPayment.amount;

            await db.customers.update(customerId, {
              debtBalance: newBalance,
              updatedAt: saleDate
            });

            await db.debtRecords.add({
              id: crypto.randomUUID(),
              customerId,
              saleId: newSale.id,
              type: 'DEBIT',
              amount: fiadoPayment.amount,
              previousBalance: prevBalance,
              newBalance,
              date: saleDate,
              description: `Compra na Caderneta (Cupom #${saleNumber})`,
              receiptNumber: saleNumber
            });
          }
        }

        // 4. Atualizar Sessão de Caixa Ativa (sem mutar o objeto da live query)
        const session = await db.cashSessions.get(activeSession.id);
        if (session) {
          const totals = { ...session.totalSales };
          payments.forEach(pm => {
            if (pm.method === 'CASH') {
              totals.cash += netCash;
            } else if (pm.method === 'PIX') {
              totals.pix += pm.amount;
            } else if (pm.method === 'CREDIT_CARD') {
              totals.credit += pm.amount;
            } else if (pm.method === 'DEBIT_CARD') {
              totals.debit += pm.amount;
            } else if (pm.method === 'FIADO') {
              totals.fiado += pm.amount;
            } else if (pm.method === 'VOUCHER') {
              totals.voucher += pm.amount;
            }
          });

          await db.cashSessions.update(session.id, {
            totalSales: totals,
            expectedCashInDrawer: Number((session.expectedCashInDrawer + netCash).toFixed(2))
          });
        }
      });

      // 5. Sucesso, Efeitos & Cupom
      completeSale();
      playSuccess();
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      
      setPaymentOpen(false);
      setLastSale(newSale);
      setReceiptOpen(true);
      
      setCart([]);
      setGlobalDiscount(0);
      setSearchTerm('');
      toast.success(`Venda #${saleNumber} finalizada com sucesso!`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar a venda.');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] bg-slate-100 dark:bg-slate-900 overflow-hidden">
      
      {/* Área Esquerda - Catálogo de Produtos e Busca */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        
        {/* Barra Superior de Busca & Ações */}
        <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 mb-3 flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Buscar por nome, SKU ou Código de Barras (F2)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-800 dark:text-slate-100"
            />
          </div>

          <button 
            onClick={() => setBarcodeOpen(true)} 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-1.5 text-xs font-bold transition-colors"
          >
            <Camera className="w-4 h-4 text-emerald-600" /> F3 Câmera
          </button>

          <button 
            onClick={() => setMobileScannerOpen(true)} 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-1.5 text-xs font-bold transition-colors"
          >
            <Smartphone className="w-4 h-4 text-blue-600" /> F7 Mobile
          </button>

          <button 
            onClick={() => window.open('/?view=customer-display', '_blank', 'width=900,height=650')} 
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center gap-1.5 text-xs font-bold transition-colors"
          >
            <MonitorSmartphone className="w-4 h-4 text-violet-600" /> F6 Display
          </button>
        </div>

        {/* Categorias */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 shrink-0">
          <button 
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            Todas as Categorias
          </button>
          {categories.map(c => (
            <button 
              key={c.id} 
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === c.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Grid de Produtos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {products.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <AlertCircle className="w-12 h-12 mb-2 opacity-30 text-emerald-500" />
              <p className="text-sm font-semibold">Nenhum produto ativo encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 pb-4">
              {products.map(product => {
                const isOut = product.stock <= 0;
                const isLow = product.stock <= product.minStock;

                return (
                  <div 
                    key={product.id} 
                    onClick={() => handleProductClick(product)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    {/* Badge de Estoque */}
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        isOut 
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400' 
                          : isLow 
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        {product.stock} {product.unit}
                      </span>

                      {product.alternativeUnit && (
                        <span className="px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 text-[10px] rounded font-bold">
                          Fração
                        </span>
                      )}
                    </div>

                    {/* Imagem / Ícone */}
                    <div className="w-full aspect-square bg-slate-100 dark:bg-slate-700/50 rounded-xl mb-2.5 flex items-center justify-center overflow-hidden">
                      {product.imageUrl?.startsWith('http') || product.imageUrl?.startsWith('data:') ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <span className="text-3xl">{product.imageUrl || '📦'}</span>
                      )}
                    </div>

                    {/* Nome & Preço */}
                    <div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight line-clamp-2 mb-1.5">
                        {product.name}
                      </h3>
                      <div className="font-black text-emerald-600 dark:text-emerald-400 text-base">
                        {formatCurrency(product.sellPrice)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Área Direita - Carrinho de Vendas */}
      <div className="w-full lg:w-[420px] bg-white dark:bg-slate-800 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700 flex flex-col shadow-xl z-10 shrink-0">
        
        {/* Cabeçalho do Carrinho */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-800 dark:text-white font-bold text-base">
            <ShoppingCart className="w-5 h-5 text-emerald-600" />
            Carrinho do PDV
          </div>
          <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-3 py-0.5 rounded-full text-xs font-black">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} itens
          </span>
        </div>

        {/* Lista de Itens no Carrinho */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 py-12">
              <ShoppingCart className="w-14 h-14 opacity-20 text-emerald-500" />
              <p className="text-sm font-medium">O carrinho está vazio</p>
              <p className="text-xs text-slate-400 text-center max-w-[200px]">Clique em um produto ou bipe o código de barras (F2 / F3).</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div 
                key={`${item.productId}-${idx}`} 
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-xs relative group"
              >
                <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs pr-7 mb-1.5 leading-snug">
                  {item.productName}
                </div>
                <div className="flex justify-between items-end">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button 
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)} 
                      className="p-1 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5"/>
                    </button>
                    <span className="w-7 text-center font-black text-xs text-slate-800 dark:text-white">
                      {item.quantity}
                    </span>
                    <button 
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)} 
                      className="p-1 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5"/>
                    </button>
                  </div>

                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">
                      {formatCurrency(item.unitPrice)} / {item.unit}
                    </div>
                    <div className="font-black text-slate-800 dark:text-white text-sm">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                </div>

                {/* Desconto por item (F2/F3: alteração rápida sem sair da linha) */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Desc.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={item.subtotal}
                      value={item.discount || ''}
                      placeholder="0.00"
                      onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                      className={`w-16 px-1.5 py-0.5 text-right text-[11px] font-bold rounded-md border focus:outline-none focus:ring-1 ${
                        item.discount > 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 focus:ring-rose-400'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 focus:ring-emerald-400'
                      }`}
                    />
                  </div>
                  {item.discount > 0 && (
                    <span className="text-[10px] font-semibold text-rose-500">
                      -{formatCurrency(item.discount)} na linha
                    </span>
                  )}
                </div>

                <button 
                  onClick={() => removeFromCart(item.productId)} 
                  className="absolute top-2.5 right-2.5 text-slate-400 hover:text-rose-600 p-1 transition-colors"
                  title="Remover Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Resumo e Botão de Pagamento */}
        <div className="p-5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(subtotal)}</span>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-600 dark:text-slate-400">
            <span>Desconto Geral (R$)</span>
            <input 
              type="number"
              step="0.01"
              min="0"
              value={globalDiscount || ''}
              onChange={(e) => setGlobalDiscount(Math.min(Math.max(0, parseFloat(e.target.value) || 0), subtotal))}
              className="w-20 p-1 text-right border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-rose-600 rounded font-bold text-xs"
              placeholder="0.00"
            />
          </div>

          <div className="flex justify-between text-lg font-black text-slate-800 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
            <span>TOTAL:</span>
            <span className="text-emerald-600 dark:text-emerald-400 text-2xl">{formatCurrency(total)}</span>
          </div>

          <button 
            onClick={() => {
              if (cart.length > 0) {
                if (activeSession) {
                  setPaymentOpen(true);
                  startPayment('CASH');
                } else {
                  toast.error('O caixa está fechado! Acesse o menu "Caixa" para realizar a abertura de turno.');
                }
              }
            }}
            disabled={cart.length === 0}
            className="w-full bg-emerald-600 text-white font-bold text-lg py-3.5 rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" /> PAGAR (F4)
          </button>
        </div>

      </div>

      {/* Modal de Escolha de Fração (Unidade Alternativa) */}
      {fractionProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 dark:text-white text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-violet-600" />
                Como deseja vender este item?
              </h3>
              <button onClick={() => setFractionProduct(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Produto: <strong>{fractionProduct.name}</strong> (Estoque: {fractionProduct.stock} {fractionProduct.unit})
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => addToCart(fractionProduct, 1, false)}
                className="p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-500 bg-slate-50 dark:bg-slate-900 text-center hover:bg-emerald-50/50 transition-all"
              >
                <p className="font-bold text-slate-800 dark:text-white text-sm">Pacote Fechado ({fractionProduct.unit})</p>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(fractionProduct.sellPrice)}
                </p>
                <span className="text-[10px] text-slate-400">Baixa 1 {fractionProduct.unit}</span>
              </button>

              <button
                onClick={() => addToCart(fractionProduct, 1, true)}
                className="p-4 rounded-xl border-2 border-violet-300 dark:border-violet-700 hover:border-violet-500 bg-violet-50/50 dark:bg-violet-950/30 text-center hover:bg-violet-50 transition-all"
              >
                <p className="font-bold text-violet-900 dark:text-violet-300 text-sm">
                  {fractionProduct.alternativeUnit?.name}
                </p>
                <p className="text-lg font-black text-violet-600 dark:text-violet-400 mt-1">
                  {formatCurrency(fractionProduct.alternativeUnit?.price || 0)}
                </p>
                <span className="text-[10px] text-violet-600 dark:text-violet-400">
                  Baixa 1/{fractionProduct.alternativeUnit?.factor} do pacote
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais de Pagamento, Recibo e Leitores */}
      <PaymentModal 
        isOpen={isPaymentOpen} 
        onClose={() => { setPaymentOpen(false); setIdle(); }}
        total={total}
        onComplete={handlePaymentComplete}
        onPaymentChange={(paid, change, method, pixData) => {
          if (method) startPayment(method, pixData);
          updatePayment(paid, change);
        }}
      />

      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => { setReceiptOpen(false); setIdle(); }}
        sale={lastSale}
      />

      <BarcodeScannerModal
        isOpen={isBarcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />

      <MobileScannerModal
        isOpen={isMobileScannerOpen}
        onClose={() => setMobileScannerOpen(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />
      
    </div>
  );
};

export default PDV;
