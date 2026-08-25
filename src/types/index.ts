export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  expirationDate?: string;
  imageUrl?: string;
  isActive: boolean;
  inactiveSince?: string;
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
  userId: string;
  costPrice: number;
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
  userId: string;
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
  cashierId: string;
  cashierName: string;
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
  cashierName: string;
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

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
  pin?: string;
}
