import type { Customer, Price, Product, Supplier } from '../types';

export type DataMode = 'demo' | 'real';

const STORAGE_KEY = 'adensa.dataMode';

/** Demo is the default: the public case study and screenshots always use it. */
export function getMode(): DataMode {
  if (typeof localStorage === 'undefined') return 'demo';
  return localStorage.getItem(STORAGE_KEY) === 'real' ? 'real' : 'demo';
}

export function persistMode(mode: DataMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export interface Dataset {
  suppliers: Supplier[];
  products: Product[];
  prices: Price[];
  customers: Customer[];
}
