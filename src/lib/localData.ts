// Adensa Ops — local record store.
//
// The static build has no server yet, so records created in the UI (quotes,
// customers, orders from accepted quotes) are kept in the browser and merged
// over the seeded dataset at render time. Storage is keyed per data mode so a
// record created in Real can never surface in Demo (and vice versa) — the
// demo/real isolation guarantee stays intact.
//
// When the app moves to Cloudflare D1, only this file's load/save change;
// the UI keeps calling the same add/override helpers via App.

import type { CashEntry, Customer, Inquiry, Order, Quote, QuoteStatus } from '../types';
import type { DataMode, Dataset } from './dataSource';

/** Status changes made in the UI, applied over any quote (seeded or local). */
export interface QuoteOverride {
  status?: QuoteStatus;
  responseDays?: number;
  orderIds?: string[];
}

export interface LocalRecords {
  customers: Customer[];
  orders: Order[];
  inquiries: Inquiry[];
  quotes: Quote[];
  cash: CashEntry[];
  quoteOverrides: Record<string, QuoteOverride>;
}

const EMPTY: LocalRecords = {
  customers: [],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  quoteOverrides: {},
};

const key = (mode: DataMode): string => `adensa.localRecords.${mode}.v1`;

/** Never trust what is in localStorage — a corrupt payload must not crash the app. */
export function loadLocal(mode: DataMode): LocalRecords {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(key(mode));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalRecords>;
    return {
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      cash: Array.isArray(parsed.cash) ? parsed.cash : [],
      quoteOverrides:
        parsed.quoteOverrides && typeof parsed.quoteOverrides === 'object' ? parsed.quoteOverrides : {},
    };
  } catch {
    return EMPTY;
  }
}

export function saveLocal(mode: DataMode, records: LocalRecords): void {
  try {
    localStorage.setItem(key(mode), JSON.stringify(records));
  } catch {
    // Storage full or blocked: records live for this session only. The UI
    // already shows what was saved, so failing quietly is honest here.
  }
}

/** Seed dataset + locally created records + status overrides, in that order. */
export function mergeDataset(base: Dataset, local: LocalRecords): Dataset {
  const quotes = [...base.quotes, ...local.quotes].map((q) => {
    const o = local.quoteOverrides[q.id];
    return o ? { ...q, ...o } : q;
  });
  return {
    ...base,
    customers: [...base.customers, ...local.customers],
    orders: [...base.orders, ...local.orders],
    inquiries: [...base.inquiries, ...local.inquiries],
    quotes,
    cash: [...base.cash, ...local.cash],
  };
}

/** Next QT-nnn from the highest existing number (works for seed + local). */
export function nextQuoteId(existing: Quote[]): string {
  let max = 0;
  for (const q of existing) {
    const m = /^QT-(\d+)$/.exec(q.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `QT-${String(max + 1).padStart(3, '0')}`;
}

/** Ids follow the mode's seeded convention: d-cus-nnn in demo, cus-nnn in real. */
export function nextCustomerId(existing: Customer[], mode: DataMode): string {
  const prefix = mode === 'demo' ? 'd-cus-' : 'cus-';
  let max = 0;
  for (const c of existing) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(c.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextOrderId(existing: Order[]): string {
  let max = 0;
  for (const o of existing) {
    const m = /^ORD-(\d+)$/.exec(o.id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `ORD-${String(max + 1).padStart(4, '0')}`;
}

/** Local calendar date (not UTC) so "today" matches the header date. */
export function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
