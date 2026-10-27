import type {
  CashEntry,
  Customer,
  Inquiry,
  OpsMeta,
  Order,
  Price,
  Product,
  Quote,
  Supplier,
} from '../types';

export type DataMode = 'demo' | 'real';

export interface Dataset {
  suppliers: Supplier[];
  products: Product[];
  prices: Price[];
  customers: Customer[];
  /** Operations layer: orders, demand and cash. Empty arrays in real mode
      until live records exist; demo ships a full simulated month. */
  orders: Order[];
  inquiries: Inquiry[];
  quotes: Quote[];
  cash: CashEntry[];
  meta: OpsMeta;
}
