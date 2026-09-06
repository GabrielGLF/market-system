import { db } from './index';
import { hashPin } from '../utils/auth';
import { setSyncPaused } from '../utils/sync';
import type { 
  Category, Product, StoreSettings, Customer, User, Sale, SaleItem, 
  CashSession, CashMovement, DebtRecord, StockMovement, PriceHistory 
} from '../types';

// Helper to generate IDs
const generateId = () => crypto.randomUUID();

export async function seedDatabase(force: boolean = false) {
  // Dados de demonstração não devem ser espelhados na nuvem: o outbox de sync
  // fica pausado durante todo o seed (e sempre é religado, mesmo em falha).
  setSyncPaused(true);
  try {
    await seedDatabaseInner(force);
  } finally {
    setSyncPaused(false);
  }
}

async function seedDatabaseInner(force: boolean): Promise<void> {
  const productsCount = await db.products.count();
  
  if (productsCount > 0 && !force) {
    console.log('Database already populated. Skipping seed.');
    return;
  }

  if (force) {
    await Promise.all([
      db.products.clear(),
      db.categories.clear(),
      db.stockMovements.clear(),
      db.priceHistories.clear(),
      db.sales.clear(),
      db.customers.clear(),
      db.debtRecords.clear(),
      db.cashSessions.clear(),
      db.cashMovements.clear(),
      db.settings.clear(),
      db.users.clear()
    ]);
  }

  // 1. Settings
  const settings: StoreSettings = {
    id: 'store-settings-id',
    companyName: 'Mercado & Conveniência Central Ltda',
    tradeName: 'Mercado Central',
    document: '12.345.678/0001-99',
    phone: '(11) 5555-4444',
    whatsapp: '(11) 99999-8888',
    email: 'contato@mercadocentral.com',
    address: {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310-100',
    },
    receiptHeader: 'Bem-vindo ao Mercado Central!\nObrigado pela preferência.',
    receiptFooter: 'Trocas apenas com cupom fiscal, prazo 7 dias.',
    pixKey: '12.345.678/0001-99',
    pixKeyType: 'CNPJ',
    defaultCardFeeDebit: 1.5,
    defaultCardFeeCredit: 3.5,
    defaultCardFeeCreditInstallment: 4.5,
    soundEnabled: true,
    lowStockThresholdDefault: 10
  };
  await db.settings.put(settings);

  // 2. Users (PINs armazenados como hash SHA-256, nunca em texto puro)
  const adminId = generateId();
  const managerId = generateId();
  const cashierId = generateId();
  const [adminPinHash, managerPinHash, cashierPinHash] = await Promise.all([
    hashPin('1234'),
    hashPin('2222'),
    hashPin('1111')
  ]);
  await db.users.bulkPut([
    { id: adminId, name: 'Administrador', email: 'admin@mercado.com', role: 'ADMIN', pinHash: adminPinHash },
    { id: managerId, name: 'Gerente', email: 'gerente@mercado.com', role: 'MANAGER', pinHash: managerPinHash },
    { id: cashierId, name: 'Operador de Caixa', email: 'caixa@mercado.com', role: 'CASHIER', pinHash: cashierPinHash }
  ]);

  // 3. Categories
  const categories: Category[] = [
    { id: generateId(), name: 'Bebidas', color: '#3b82f6', icon: 'cup-soda', description: 'Refrigerantes, cervejas, sucos e água' },
    { id: generateId(), name: 'Mercearia', color: '#f59e0b', icon: 'shopping-basket', description: 'Alimentos básicos e enlatados' },
    { id: generateId(), name: 'Laticínios & Frios', color: '#ef4444', icon: 'cheese', description: 'Queijos, iogurtes, embutidos' },
    { id: generateId(), name: 'Padaria & Sobremesas', color: '#8b5cf6', icon: 'croissant', description: 'Pães, bolos e doces' },
    { id: generateId(), name: 'Higiene & Limpeza', color: '#10b981', icon: 'spray-can', description: 'Produtos de limpeza e higiene pessoal' },
    { id: generateId(), name: 'Hortifruti', color: '#84cc16', icon: 'apple', description: 'Frutas, legumes e verduras' },
    { id: generateId(), name: 'Tabacaria & Bomboniere', color: '#64748b', icon: 'cigarette', description: 'Cigarros, isqueiros e balas' }
  ];
  await db.categories.bulkPut(categories);
  
  const [bebidasId, merceariaId, laticiniosId, padariaId, higieneId, hortifrutiId, tabacariaId] = categories.map(c => c.id);

  // 4. Products
  const nowStr = new Date().toISOString();
  const products: Product[] = [
    { id: generateId(), name: 'Coca-Cola 2L', sku: 'BEB-001', barcode: '7894900011517', categoryId: bebidasId, costPrice: 6.50, sellPrice: 10.00, stock: 150, minStock: 30, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Cerveja Heineken Lata 350ml', sku: 'BEB-002', barcode: '7895000438125', categoryId: bebidasId, costPrice: 4.20, sellPrice: 6.50, stock: 300, minStock: 60, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Arroz Branco Camil 5kg', sku: 'MER-001', barcode: '7894321711234', categoryId: merceariaId, costPrice: 22.00, sellPrice: 28.50, stock: 80, minStock: 20, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Feijão Carioca 1kg', sku: 'MER-002', barcode: '7891234567890', categoryId: merceariaId, costPrice: 6.00, sellPrice: 8.50, stock: 50, minStock: 15, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Leite Integral Piracanjuba 1L', sku: 'LAT-001', barcode: '7896259412345', categoryId: laticiniosId, costPrice: 4.50, sellPrice: 5.99, stock: 5, minStock: 24, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr }, // Baixo estoque
    { id: generateId(), name: 'Queijo Mussarela', sku: 'LAT-002', barcode: '2000000000000', categoryId: laticiniosId, costPrice: 40.00, sellPrice: 65.00, stock: 12.5, minStock: 2, unit: 'KG', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Pão Francês', sku: 'PAD-001', barcode: '2000000000001', categoryId: padariaId, costPrice: 9.00, sellPrice: 18.00, stock: 15, minStock: 5, unit: 'KG', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Bolo de Chocolate', sku: 'PAD-002', barcode: '2000000000002', categoryId: padariaId, costPrice: 15.00, sellPrice: 35.00, stock: 2, minStock: 1, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Detergente Líquido Ypê 500ml', sku: 'HIG-001', barcode: '7898118210041', categoryId: higieneId, costPrice: 1.80, sellPrice: 2.75, stock: 120, minStock: 40, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Sabão em Pó Omo 1kg', sku: 'HIG-002', barcode: '7891150047321', categoryId: higieneId, costPrice: 11.50, sellPrice: 15.90, stock: 8, minStock: 15, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr }, // Baixo estoque
    { id: generateId(), name: 'Papel Higiênico Neve 4un', sku: 'HIG-003', barcode: '7896018701625', categoryId: higieneId, costPrice: 6.00, sellPrice: 9.50, stock: 45, minStock: 20, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Banana Prata', sku: 'HOR-001', barcode: '2000000000003', categoryId: hortifrutiId, costPrice: 3.50, sellPrice: 6.99, stock: 20, minStock: 5, unit: 'KG', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Tomate Carmem', sku: 'HOR-002', barcode: '2000000000004', categoryId: hortifrutiId, costPrice: 4.00, sellPrice: 8.50, stock: 18, minStock: 5, unit: 'KG', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { 
      id: generateId(), name: 'Cigarro Derby Azul', sku: 'TAB-001', barcode: '78931754', categoryId: tabacariaId, costPrice: 8.50, sellPrice: 10.00, stock: 30, minStock: 10, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr,
      alternativeUnit: { name: 'Avulso', factor: 20, price: 1.00, barcode: '789317540' }
    },
    { id: generateId(), name: 'Caixa de Bombom Garoto', sku: 'TAB-002', barcode: '7891008101007', categoryId: tabacariaId, costPrice: 10.00, sellPrice: 14.99, stock: 25, minStock: 10, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Café Melitta 500g', sku: 'MER-003', barcode: '7891122334455', categoryId: merceariaId, costPrice: 14.50, sellPrice: 19.90, stock: 40, minStock: 12, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Macarrão Espaguete Galo 500g', sku: 'MER-004', barcode: '7896543210123', categoryId: merceariaId, costPrice: 2.50, sellPrice: 4.00, stock: 100, minStock: 30, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Cerveja Brahma Chopp Lata 350ml', sku: 'BEB-003', barcode: '7891149103208', categoryId: bebidasId, costPrice: 3.20, sellPrice: 4.50, stock: 240, minStock: 120, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Refrigerante Guaraná Antarctica 2L', sku: 'BEB-004', barcode: '7891910000197', categoryId: bebidasId, costPrice: 6.00, sellPrice: 9.00, stock: 90, minStock: 24, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Água Mineral Minalba Sem Gás 1.5L', sku: 'BEB-005', barcode: '7897395000014', categoryId: bebidasId, costPrice: 1.50, sellPrice: 3.50, stock: 150, minStock: 30, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Sal Refinado Cisne 1kg', sku: 'MER-005', barcode: '7896015501013', categoryId: merceariaId, costPrice: 2.00, sellPrice: 3.50, stock: 60, minStock: 20, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Azeite de Oliva Galo 500ml', sku: 'MER-006', barcode: '5601012011002', categoryId: merceariaId, costPrice: 25.00, sellPrice: 35.00, stock: 3, minStock: 10, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr }, // Baixo estoque
    { id: generateId(), name: 'Creme Dental Sorriso 90g', sku: 'HIG-004', barcode: '7891030022378', categoryId: higieneId, costPrice: 1.90, sellPrice: 3.20, stock: 70, minStock: 20, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr },
    { id: generateId(), name: 'Biscoito Trakinas Morango 126g', sku: 'TAB-003', barcode: '7622300829631', categoryId: tabacariaId, costPrice: 2.20, sellPrice: 3.50, stock: 0, minStock: 15, unit: 'UN', isActive: true, createdAt: nowStr, updatedAt: nowStr }, // Ruptura
    { id: generateId(), name: 'Manteiga Aviação 200g', sku: 'LAT-003', barcode: '7896001000100', categoryId: laticiniosId, costPrice: 10.00, sellPrice: 14.50, stock: 0, minStock: 5, unit: 'UN', isActive: false, inactiveSince: nowStr, createdAt: nowStr, updatedAt: nowStr }, // Inativo
  ];
  await db.products.bulkPut(products);

  // 5. Customers
  const customers: Customer[] = [
    { id: generateId(), name: 'João Silva', phone: '(11) 98765-4321', email: 'joao@email.com', document: '111.222.333-44', creditLimit: 500, debtBalance: 150.50, createdAt: nowStr, updatedAt: nowStr, notes: 'Cliente frequente' },
    { id: generateId(), name: 'Maria Oliveira', phone: '(11) 91234-5678', email: 'maria@email.com', document: '222.333.444-55', creditLimit: 300, debtBalance: 0, createdAt: nowStr, updatedAt: nowStr, notes: '' },
    { id: generateId(), name: 'Carlos Santos (Mecânica)', phone: '(11) 99988-7766', email: '', document: '', creditLimit: 1000, debtBalance: 425.00, createdAt: nowStr, updatedAt: nowStr, notes: 'Acerta dia 05' },
    { id: generateId(), name: 'Ana Paula', phone: '(11) 95555-1234', email: '', document: '', creditLimit: 200, debtBalance: 25.00, createdAt: nowStr, updatedAt: nowStr, notes: '' }
  ];
  await db.customers.bulkPut(customers);

  // 6. Cash Session
  const sessionOpenedAt = new Date();
  sessionOpenedAt.setHours(8, 0, 0, 0);
  const currentSession: CashSession = {
    id: generateId(),
    openedAt: sessionOpenedAt.toISOString(),
    cashierId: cashierId,
    cashierName: 'Operador de Caixa',
    initialBalance: 150,
    currentBalance: 150,
    totalIn: 150,
    totalOut: 0,
    totalSales: { cash: 0, credit: 0, debit: 0, pix: 0, voucher: 0, fiado: 0, total: 0 },
    expectedCashInDrawer: 150,
    status: 'OPEN'
  };
  await db.cashSessions.put(currentSession);

  // Initial money supply
  const supply: CashMovement = {
    id: generateId(), sessionId: currentSession.id, type: 'SUPPLY', amount: 150, reason: 'Fundo de troco inicial', date: sessionOpenedAt.toISOString(), cashierName: 'Operador de Caixa'
  };
  await db.cashMovements.put(supply);

  // 7. Stock Movements & Price Histories Seeds
  const stockMovements: StockMovement[] = [];
  const priceHistories: PriceHistory[] = [];

  // Seed initial purchase entries (Entradas de Compras de Fornecedores)
  products.forEach(p => {
    const entryDate = new Date(Date.now() - (25 + Math.floor(Math.random() * 5)) * 24 * 60 * 60 * 1000);
    const purchaseQty = p.stock + Math.floor(Math.random() * 40) + 10;
    
    stockMovements.push({
      id: generateId(),
      productId: p.id,
      productName: p.name,
      type: 'IN',
      quantity: purchaseQty,
      previousStock: 0,
      newStock: purchaseQty,
      reason: 'Entrada por Nota Fiscal de Compra / Fornecedor',
      date: entryDate.toISOString(),
      userId: 'Gerente de Compras',
      costPrice: p.costPrice
    });

    // Algumas avarias / quebras registradas (Saídas avulsas)
    if (Math.random() > 0.7) {
      const lossQty = p.unit === 'KG' ? 0.5 : Math.floor(Math.random() * 3) + 1;
      const lossDate = new Date(Date.now() - Math.floor(Math.random() * 15) * 24 * 60 * 60 * 1000);
      stockMovements.push({
        id: generateId(),
        productId: p.id,
        productName: p.name,
        type: 'OUT',
        quantity: lossQty,
        previousStock: purchaseQty,
        newStock: Math.max(0, purchaseQty - lossQty),
        reason: 'Avaria / Vencimento / Embalagem Danificada',
        date: lossDate.toISOString(),
        userId: 'Conferente',
        costPrice: p.costPrice
      });
    }

    // Histórico de preços
    const oldCost = Number((p.costPrice * 0.9).toFixed(2));
    const oldSell = Number((p.sellPrice * 0.9).toFixed(2));
    const oldMargin = ((oldSell - oldCost) / oldSell) * 100;
    const newMargin = ((p.sellPrice - p.costPrice) / p.sellPrice) * 100;

    priceHistories.push({
      id: generateId(),
      productId: p.id,
      productName: p.name,
      oldCostPrice: oldCost,
      newCostPrice: p.costPrice,
      oldSellPrice: oldSell,
      newSellPrice: p.sellPrice,
      oldMargin: Number(oldMargin.toFixed(1)),
      newMargin: Number(newMargin.toFixed(1)),
      changePercentage: 10.0,
      reason: 'Reajuste de tabela pelo fornecedor',
      date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      userId: 'Admin'
    });
  });

  // 8. Sales History (30 days) with Cross-Selling Correlation
  const sales: Sale[] = [];
  const debts: DebtRecord[] = [];
  const today = new Date();
  const paymentMethods = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'FIADO'];
  let saleNumberInt = 1001;

  for (let i = 0; i < 180; i++) {
    const saleDate = new Date();
    saleDate.setDate(today.getDate() - Math.floor(Math.random() * 30));
    saleDate.setHours(7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));

    const saleItems: SaleItem[] = [];
    const numItems = Math.floor(Math.random() * 4) + 1;
    let subtotal = 0;
    let costTotal = 0;

    const usedProductIds = new Set<string>();

    for (let j = 0; j < numItems; j++) {
      const activeProducts = products.filter(p => p.isActive && !usedProductIds.has(p.id));
      if (activeProducts.length === 0) break;

      const p = activeProducts[Math.floor(Math.random() * activeProducts.length)];
      usedProductIds.add(p.id);

      const qty = p.unit === 'KG' ? Number((Math.random() * 1.5 + 0.3).toFixed(3)) : Math.floor(Math.random() * 2) + 1;
      const itemTotal = Number((qty * p.sellPrice).toFixed(2));
      const itemCostTotal = Number((qty * p.costPrice).toFixed(2));
      
      saleItems.push({
        productId: p.id,
        productName: p.name,
        quantity: Number(qty),
        unit: p.unit,
        unitPrice: p.sellPrice,
        costPrice: p.costPrice,
        subtotal: itemTotal,
        discount: 0,
        total: itemTotal
      });
      subtotal += itemTotal;
      costTotal += itemCostTotal;
    }

    subtotal = Number(subtotal.toFixed(2));
    costTotal = Number(costTotal.toFixed(2));
    const discount = Math.random() > 0.85 ? Number((subtotal * 0.05).toFixed(2)) : 0;
    const total = Number((subtotal - discount).toFixed(2));
    const profit = Number((total - costTotal).toFixed(2));

    const method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    let customerId: string | undefined;
    let customerName: string | undefined;

    if (method === 'FIADO') {
      const c = customers[Math.floor(Math.random() * customers.length)];
      customerId = c.id;
      customerName = c.name;
    }

    const saleId = generateId();
    const saleNum = `V-${saleNumberInt++}`;

    sales.push({
      id: saleId,
      saleNumber: saleNum,
      date: saleDate.toISOString(),
      items: saleItems,
      subtotal,
      discount,
      total,
      costTotal,
      profit,
      paymentMethods: [{ method: method as any, amount: total }],
      customerId,
      customerName,
      status: 'COMPLETED'
    });

    // Registra movimentação de venda
    saleItems.forEach(item => {
      stockMovements.push({
        id: generateId(),
        productId: item.productId,
        productName: item.productName,
        type: 'SALE',
        quantity: item.quantity,
        previousStock: 50,
        newStock: 50 - item.quantity,
        reason: `Venda PDV #${saleNum}`,
        date: saleDate.toISOString(),
        userId: 'Operador de Caixa',
        costPrice: item.costPrice
      });
    });

    if (method === 'FIADO' && customerId) {
      debts.push({
        id: generateId(),
        customerId,
        saleId,
        type: 'DEBIT',
        amount: total,
        previousBalance: 0,
        newBalance: total,
        date: saleDate.toISOString(),
        description: `Compra na Caderneta (Cupom #${saleNum})`,
        receiptNumber: saleNum
      });
    }
  }

  sales.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  stockMovements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Trilha de dívida CONSISTENTE: cada registro guarda o saldo anterior/novo
  // encadeado em ordem cronológica por cliente, e o saldo atual do cliente é
  // exatamente a soma do histórico (nunca pode divergir do extrato).
  const debtsByCustomer = new Map<string, DebtRecord[]>();
  for (const d of debts) {
    const list = debtsByCustomer.get(d.customerId) || [];
    list.push(d);
    debtsByCustomer.set(d.customerId, list);
  }
  const finalBalances = new Map<string, number>();
  const consistentDebts: DebtRecord[] = [];
  for (const [customerId, list] of debtsByCustomer) {
    list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = 0;
    for (const d of list) {
      d.previousBalance = Number(running.toFixed(2));
      running = Number((running + d.amount).toFixed(2));
      d.newBalance = running;
      consistentDebts.push(d);
    }
    finalBalances.set(customerId, running);
  }

  await db.sales.bulkPut(sales);
  await db.debtRecords.bulkPut(consistentDebts);
  await db.stockMovements.bulkPut(stockMovements);
  await db.priceHistories.bulkPut(priceHistories);

  // Saldo devedor do cliente = soma real dos débitos (antes ficava fixo e
  // não batia com o extrato gerado).
  await db.customers.bulkPut(customers.map(c => ({
    ...c,
    debtBalance: finalBalances.get(c.id) ?? c.debtBalance
  })));

  console.log('Database successfully seeded with highly realistic market data!');
}
