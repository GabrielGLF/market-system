import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { 
  Search, Trash2, Camera, MonitorSmartphone,
  Smartphone, Minus, Plus, X, Package, Receipt, Check
} from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { toPackUnits } from '../utils/calc';
import type { SaleItem, Product, PaymentMethodEntry, Sale } from '../types';
import { PaymentModal } from '../components/pdv/PaymentModal';
import { ReceiptModal } from '../components/pdv/ReceiptModal';
import { BarcodeScannerModal } from '../components/pdv/BarcodeScannerModal';
import { MobileScannerModal } from '../components/pdv/MobileScannerModal';
import { useCustomerDisplay } from '../hooks/useCustomerDisplay';
import { searchProducts, getProductByCode } from '../utils/pdvSearch';
import { takePendingRepeatSale, subscribeRepeatSale } from '../utils/repeatSale';
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

  // Escalabilidade: busca em cache em memória (revalidado incrementalmente via
  // índice updatedAt) em vez de varrer a tabela de produtos a cada tecla.
  // Código de barras exato vai direto ao índice — O(log n), não O(catálogo).
  const products = useLiveQuery(
    () => searchProducts(searchTerm, selectedCategory === 'ALL' ? null : selectedCategory, 60),
    [searchTerm, selectedCategory]
  ) || [];

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
    // Busca via índices (barcode e alternativeUnit.barcode) — O(log n),
    // não varre a tabela. Scanner dispara isso várias vezes por segundo
    // em sequências rápidas de itens.
    const found = await getProductByCode(barcode);

    if (found) {
      const { product, isAlternative } = found;
      if (isAlternative) {
        addToCart(product, 1, true);
        toast.success(`Adicionado: ${product.name} (${product.alternativeUnit?.name})`);
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
    // CMV e lucro são calculados DENTRO da transação (abaixo), a partir do custo
    // médio real lido do banco no momento da baixa — imune a corridas com
    // compras simultâneas que alterem o custo entre a montagem do carrinho e a
    // confirmação. Por isso o newSale é montado dentro do bloco transacional.

    // Troco sai da gaveta: o caixa físico fica com (dinheiro recebido - troco dado)
    const totalPaid = payments.reduce((acc, pm) => acc + pm.amount, 0);
    const change = Math.max(0, totalPaid - total);
    const cashAmount = payments.filter(pm => pm.method === 'CASH').reduce((acc, pm) => acc + pm.amount, 0);
    const netCash = Math.max(0, cashAmount - change);

    try {
      // Tudo em uma transação atômica: venda + estoque + movimentações + fiado + caixa
      const sale: Sale = await db.transaction('rw', [db.sales, db.products, db.stockMovements, db.customers, db.debtRecords, db.cashSessions], async () => {
        // CMV pelo custo médio REAL lido agora (o mesmo valor usado nas
        // movimentações SALE abaixo — venda e estoque nunca divergem)
        let costTotal = 0;
        for (const item of cart) {
          const p = await db.products.get(item.productId.replace('-alt', ''));
          if (!p) {
            throw new Error(`Produto "${item.productName}" não encontrado no cadastro.`);
          }
          costTotal += (p.costPrice || 0) * item.quantity;
        }
        costTotal = Number(costTotal.toFixed(2));
        const profit = Number((total - costTotal).toFixed(2));

        const sale: Sale = {
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

        // 1. Gravar Venda
        await db.sales.add(sale);

        // 2. Baixar estoque e registrar movimentações pelo CUSTO MÉDIO real
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
              costPrice: p.costPrice,
              avgCostAfter: p.costPrice,
              totalCost: Number((p.costPrice * deduction).toFixed(2))
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
              saleId: sale.id,
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

        return sale;
      });

      // 5. Sucesso, Efeitos & Cupom
      completeSale();
      playSuccess();
      
      setPaymentOpen(false);
      setLastSale(sale);
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
    <div className="flex flex-col lg:flex-row h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-900 overflow-hidden">
      
      {/* Área Esquerda - Catálogo de Produtos e Busca */}
      <div className="flex-1 flex flex-col p-3 overflow-hidden">
        
        {/* Barra Superior de Busca & Ações */}
        <div className="bg-white dark:bg-slate-800 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 mb-3 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              ref={searchInputRef}
              type="text" 
              placeholder="Nome, SKU ou código de barras…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-14 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500 text-sm text-slate-800 dark:text-slate-100"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5 bg-white dark:bg-slate-800">F2</kbd>
          </div>

          <button 
            onClick={() => setBarcodeOpen(true)} 
            title="Leitor por câmera (F3)"
            className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <Camera className="w-4 h-4" /> Câmera <kbd className="text-[10px] font-mono text-slate-400">F3</kbd>
          </button>

          <button 
            onClick={() => setMobileScannerOpen(true)} 
            title="Usar celular como leitor (F7)"
            className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <Smartphone className="w-4 h-4" /> Celular <kbd className="text-[10px] font-mono text-slate-400">F7</kbd>
          </button>

          <button 
            onClick={() => window.open('/?view=customer-display', '_blank', 'width=900,height=650')} 
            title="Abrir display do cliente (F6)"
            className="px-2.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <MonitorSmartphone className="w-4 h-4" /> Display <kbd className="text-[10px] font-mono text-slate-400">F6</kbd>
          </button>
        </div>

        {/* Categorias */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 shrink-0">
          <button 
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            Todas
          </button>
          {categories.map(c => (
            <button 
              key={c.id} 
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === c.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
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
              <Package className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum produto encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 pb-4">
              {products.map(product => {
                const isOut = product.stock <= 0;
                const isLow = product.stock <= product.minStock;

                return (
                  <div 
                    key={product.id} 
                    onClick={() => handleProductClick(product)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors flex flex-col group"
                  >
                    {/* Imagem / Ícone */}
                    <div className="w-full aspect-square bg-slate-100 dark:bg-slate-900/60 rounded-md mb-2 flex items-center justify-center overflow-hidden">
                      {product.imageUrl?.startsWith('http') || product.imageUrl?.startsWith('data:') ? (
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      ) : product.imageUrl ? (
                        <span className="text-2xl">{product.imageUrl}</span>
                      ) : (
                        <Package className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>

                    {/* Nome */}
                    <h3 className="font-medium text-slate-800 dark:text-slate-100 text-xs leading-snug line-clamp-2 min-h-[2rem]">
                      {product.name}
                    </h3>

                    {product.alternativeUnit && (
                      <span className="mt-1 self-start text-[9px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-600 rounded px-1 py-px">
                        Fração
                      </span>
                    )}

                    {/* Preço & Estoque */}
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 flex items-baseline justify-between gap-1">
                      <span className="font-bold text-slate-900 dark:text-white text-sm tabular-nums">
                        {formatCurrency(product.sellPrice)}
                      </span>
                      <span className={`text-[10px] tabular-nums whitespace-nowrap ${
                        isOut
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : isLow
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}>
                        {isOut ? 'sem estoque' : `${product.stock} ${product.unit}`}
                      </span>
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
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
            <Receipt className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Cupom em andamento
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} {cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'itens'}
          </span>
        </div>

        {/* Lista de Itens no Carrinho */}
        <div className="flex-1 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 py-12">
              <Receipt className="w-10 h-10 text-slate-200 dark:text-slate-700" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum item no cupom</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-[220px]">Bipe um código de barras ou clique em um produto para iniciar.</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div 
                key={`${item.productId}-${idx}`} 
                className="py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-slate-800 dark:text-slate-100 text-xs leading-snug flex-1">
                    {item.productName}
                  </div>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 p-0.5 transition-colors"
                    title="Remover item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex justify-between items-center mt-1.5">
                  <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-md">
                    <button 
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)} 
                      className="p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-l-md transition-colors"
                    >
                      <Minus className="w-3 h-3"/>
                    </button>
                    <span className="w-8 text-center font-semibold text-xs text-slate-800 dark:text-white tabular-nums">
                      {item.quantity}
                    </span>
                    <button 
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)} 
                      className="p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-r-md transition-colors"
                    >
                      <Plus className="w-3 h-3"/>
                    </button>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {formatCurrency(item.unitPrice)} / {item.unit}
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm tabular-nums">
                      {formatCurrency(item.total)}
                    </div>
                  </div>
                </div>

                {/* Desconto por item: ajuste rápido sem sair da linha */}
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  {item.discount > 0 && (
                    <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400">
                      −{formatCurrency(item.discount)}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">Desconto</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={item.subtotal}
                    value={item.discount || ''}
                    placeholder="0,00"
                    onChange={(e) => updateItemDiscount(item.productId, parseFloat(e.target.value) || 0)}
                    className={`w-16 px-1.5 py-0.5 text-right text-[11px] font-semibold rounded-md border focus:outline-none focus:ring-1 ${
                      item.discount > 0
                        ? 'border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 focus:ring-rose-400'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 focus:ring-slate-400'
                    }`}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Resumo e Botão de Pagamento */}
        <div className="px-4 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-700 space-y-2.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(subtotal)}</span>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
            <span>Desconto geral (R$)</span>
            <input 
              type="number"
              step="0.01"
              min="0"
              value={globalDiscount || ''}
              onChange={(e) => setGlobalDiscount(Math.min(Math.max(0, parseFloat(e.target.value) || 0), subtotal))}
              className="w-20 px-1.5 py-1 text-right border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md font-semibold text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="0,00"
            />
          </div>

          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Total</span>
            <span className="font-bold text-slate-900 dark:text-white text-2xl tabular-nums tracking-tight">{formatCurrency(total)}</span>
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
            className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-base py-3 rounded-lg hover:bg-slate-800 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" /> PAGAR
            <kbd className="text-[10px] font-mono font-normal opacity-70 border border-white/30 dark:border-slate-900/30 rounded px-1.5 py-0.5">F4</kbd>
          </button>
        </div>

      </div>

      {/* Modal de Escolha de Fração (Unidade Alternativa) */}
      {fractionProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-5 max-w-md w-full shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-start mb-1">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Como vender este item?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {fractionProduct.name} · estoque {fractionProduct.stock} {fractionProduct.unit}
                </p>
              </div>
              <button onClick={() => setFractionProduct(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <button
                onClick={() => addToCart(fractionProduct, 1, false)}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-900 dark:hover:border-slate-300 bg-white dark:bg-slate-900 text-center transition-colors"
              >
                <p className="font-medium text-slate-700 dark:text-slate-200 text-xs">Pacote fechado ({fractionProduct.unit})</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-1.5">
                  {formatCurrency(fractionProduct.sellPrice)}
                </p>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Baixa 1 {fractionProduct.unit}</span>
              </button>

              <button
                onClick={() => addToCart(fractionProduct, 1, true)}
                className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-slate-900 dark:hover:border-slate-300 bg-white dark:bg-slate-900 text-center transition-colors"
              >
                <p className="font-medium text-slate-700 dark:text-slate-200 text-xs">
                  {fractionProduct.alternativeUnit?.name}
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums mt-1.5">
                  {formatCurrency(fractionProduct.alternativeUnit?.price || 0)}
                </p>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
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
