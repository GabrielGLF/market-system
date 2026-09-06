import Dexie, { Table } from 'dexie';
import { 
  Product, Category, StockMovement, PriceHistory, Sale, Customer, 
  DebtRecord, CashSession, CashMovement, StoreSettings, SyncOutboxEntry
} from '../types';

export class MarketDB extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  stockMovements!: Table<StockMovement, string>;
  priceHistories!: Table<PriceHistory, string>;
  sales!: Table<Sale, string>;
  customers!: Table<Customer, string>;
  debtRecords!: Table<DebtRecord, string>;
  cashSessions!: Table<CashSession, string>;
  cashMovements!: Table<CashMovement, string>;
  settings!: Table<StoreSettings, string>;
  syncOutbox!: Table<SyncOutboxEntry, string>;

  constructor() {
    super('MarketSystemDB');
    this.version(1).stores({
      products: 'id, barcode, sku, name, categoryId, isActive',
      categories: 'id, name',
      stockMovements: 'id, productId, type, date',
      priceHistories: 'id, productId, date',
      sales: 'id, saleNumber, date, customerId, status, cashierSessionId',
      customers: 'id, name, document',
      debtRecords: 'id, customerId, saleId, date',
      cashSessions: 'id, openedAt, closedAt, cashierId, status',
      cashMovements: 'id, sessionId, type, date',
      settings: 'id',
      users: 'id, email, role'
    });
    // Aditivo: não toca nas tabelas existentes (nenhuma migração de dados).
    this.version(2).stores({
      syncOutbox: 'id, entity, entityId, updatedAt'
    });
    // Sistema monousuário: remove a tabela legada de usuários (com seus papéis
    // e PINs) — os dados antigos são descartados na atualização do schema.
    this.version(3).stores({
      users: null
    });
  }
}

export const db = new MarketDB();
