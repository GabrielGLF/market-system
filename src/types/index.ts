export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  /** Custo unitário médio ponderado (atualizado a cada compra pelo motor de custo médio). Base para CMV e margem. */
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  expirationDate?: string;
  imageUrl?: string;
  isActive: boolean;
  inactiveSince?: string;
  /** Custo da última compra efetiva (preço pago na entrada mais recente). */
  lastPurchaseCost?: number;
  /** Data ISO da última compra efetiva. */
  lastPurchaseDate?: string;
  /** Fornecedor da última compra. */
  lastSupplier?: string;
  createdAt: string;
  updatedAt: string;
  alternativeUnit?: {
    name: string;
    factor: number;
    price: number;
    barcode?: string;
  };
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'IN' | 'OUT' | 'ADJUST' | 'SALE' | 'RETURN';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  date: string;
  /** Legado (sistema monousuário) — mantido por compatibilidade de dados existentes */
  userId?: string;
  /** Custo unitário de referência no momento da movimentação. Em IN, é o preço de compra desta entrada; em SALE, o custo médio usado na baixa. */
  costPrice: number;
  /** Custo unitário MÉDIO ponderado APÓS esta movimentação (entradas atualizam; saídas mantêm). Permite auditoria do histórico de custos. */
  avgCostAfter?: number;
  /** Valor total da linha (quantity × costPrice) — para relatórios de investimento em compras e perdas. */
  totalCost?: number;
  /** Fornecedor informado na entrada de compra (opcional). */
  supplier?: string;
  /** Nº da nota/fatura da compra (opcional). */
  invoiceNumber?: string;
}

export interface PriceHistory {
  id: string;
  productId: string;
  productName: string;
  oldSellPrice: number;
  newSellPrice: number;
  oldCostPrice: number;
  newCostPrice: number;
  oldMargin: number;
  newMargin: number;
  changePercentage: number;
  date: string;
  reason: string;
  /** Legado (sistema monousuário) — mantido por compatibilidade de dados existentes */
  userId?: string;
}

export type PaymentMethodType = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'VOUCHER' | 'FIADO' | 'SPLIT';

export interface PaymentMethodEntry {
  method: PaymentMethodType;
  amount: number;
  details?: {
    installments?: number;
    cardBrand?: string;
    receivedAmount?: number;
    change?: number;
    pixTxId?: string;
  };
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
  discount: number;
  total: number;
  isAlternativeUnit?: boolean;
  originalUnitFactor?: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  profit: number;
  paymentMethods: PaymentMethodEntry[];
  customerId?: string;
  customerName?: string;
  status: 'COMPLETED' | 'CANCELLED' | 'PENDING_SYNC';
  cancelReason?: string;
  cancelledAt?: string;
  cashierSessionId?: string;
  notes?: string;
  // Trilha de devoluções parciais: a venda permanece COMPLETED com itens/valores
  // ajustados (quantidades, total, custo e formas de pagamento líquidos), e cada
  // devolução fica registrada aqui para auditoria completa.
  refunds?: SaleRefund[];
  refundedAmount?: number;
}

export interface SaleRefundItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  amount: number;
  costPrice: number;
}

export interface SaleRefund {
  id: string;
  saleId: string;
  date: string;
  reason: string;
  amount: number;
  items: SaleRefundItem[];
  paymentRefunds: PaymentMethodEntry[];
  cashierSessionId?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  document: string;
  creditLimit: number;
  debtBalance: number;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface DebtRecord {
  id: string;
  customerId: string;
  saleId: string;
  type: 'DEBIT' | 'PAYMENT';
  amount: number;
  previousBalance: number;
  newBalance: number;
  date: string;
  description: string;
  receiptNumber: string;
}

export interface CashSession {
  id: string;
  openedAt: string;
  closedAt?: string;
  /** Legado (sistema monousuário) — mantido por compatibilidade de dados existentes */
  cashierId?: string;
  /** Legado (sistema monousuário) — mantido por compatibilidade de dados existentes */
  cashierName?: string;
  initialBalance: number;
  currentBalance: number;
  totalIn: number;
  totalOut: number;
  totalSales: {
    cash: number;
    credit: number;
    debit: number;
    pix: number;
    voucher: number;
    fiado: number;
    total: number;
  };
  expectedCashInDrawer: number;
  actualCashCounted?: number;
  difference?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface CashMovement {
  id: string;
  sessionId: string;
  type: 'SUPPLY' | 'BLEED';
  amount: number;
  reason: string;
  date: string;
  /** Legado (sistema monousuário) — mantido por compatibilidade de dados existentes */
  cashierName?: string;
}

export interface StoreSettings {
  id: string;
  companyName: string;
  tradeName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  logoUrl?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  pixKey?: string;
  pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
  defaultCardFeeDebit: number;
  defaultCardFeeCredit: number;
  defaultCardFeeCreditInstallment: number;
  soundEnabled: boolean;
  lowStockThresholdDefault: number;
}

/** Entidades locais espelhadas na nuvem (Supabase) pelo motor de sync. */
export type SyncEntity =
  | 'sales'
  | 'stockMovements'
  | 'cashSessions'
  | 'cashMovements'
  | 'debtRecords'
  | 'customers';

/**
 * Outbox transacional: cada gravação local em tabela sincronizada gera (via
 * hook Dexie, na MESMA transação) uma entrada pendente. O motor de push lê a
 * entrada, busca o estado atual da entidade e envia um upsert idempotente.
 * A chave é `entity:entityId` — gravações repetidas coalescem numa só entrada.
 */
export interface SyncOutboxEntry {
  id: string;
  entity: SyncEntity;
  entityId: string;
  op: 'PUT' | 'DELETE';
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
}
