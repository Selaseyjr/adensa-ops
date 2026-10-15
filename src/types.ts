// Adensa Ops — core data schema (authoritative contract).
// Data files (src/data/*) and all UI build against this file.

export type Category =
  | 'cement'
  | 'plumbing'
  | 'electrical'
  | 'safety'
  | 'tools';

export type ProspectStatus = 'identified' | 'contacted' | 'vetted';

export type PriceType = 'market_reference' | 'quoted';

export type DeliveryCapability =
  | 'own_fleet'
  | 'third_party'
  | 'collection_only'
  | 'unknown';

export interface Supplier {
  id: string;
  name: string;
  category: Category;
  location: string; // market / area, e.g. "Opera Square, Accra"
  city: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  status: ProspectStatus;
  vettedOn?: string; // ISO date, set only when status === 'vetted'
  /** Earned through completed orders — never filled in speculatively. */
  reliability?: 1 | 2 | 3 | 4 | 5;
  delivery: DeliveryCapability;
  paymentTerms?: string;
  notes?: string;
  /** Where the record came from (URL for directory sourcing, "Agnes contact dump", etc.) */
  source?: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  brand: string;
  /** Size / class / rating / model — only like-for-like specs may be compared. */
  spec: string;
  /** bag, metre, roll, piece, ... */
  unit: string;
}

export interface Price {
  productId: string;
  /** Required for `quoted` prices; omitted for `market_reference` observations. */
  supplierId?: string;
  ghs: number;
  type: PriceType;
  /** ISO date the price was captured. */
  capturedOn: string;
  /** Required in spirit for market_reference: where it came from. */
  source?: string;
  /** Delivery/transport charge quoted for this line, if any. */
  transportGhs?: number;
  /** Estimated days from order to arrival. */
  leadTimeDays?: number;
  /** false = supplier flagged partial or no stock at capture time. */
  inStock?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  whatsapp?: string;
  city: string;
  type: 'contractor' | 'plumber' | 'electrician' | 'business' | 'individual' | 'institution';
  specialisation?: string;
  productsNeeded: Category[];
  lastContact?: string;
  nextFollowUp?: string;
  notes?: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  cement: 'Cement & building materials',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  safety: 'Safety equipment',
  tools: 'Industrial tools',
};

export const STATUS_LABELS: Record<ProspectStatus, string> = {
  identified: 'Identified',
  contacted: 'Contacted',
  vetted: 'Vetted',
};

/** Stable identity of a price row: overrides (sim, imports) key on this. */
export function priceKey(p: Price): string {
  return `${p.productId}|${p.supplierId ?? ''}|${p.type}`
}
export const PRICE_STALE_DAYS = 14;

export function daysSince(isoDate: string, asOf: Date = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00`);
  return Math.floor((asOf.getTime() - then.getTime()) / 86_400_000);
}

/** A stale price produces wrong quotes — flag it loudly. */
export function isPriceStale(price: Price, asOf?: Date): boolean {
  return daysSince(price.capturedOn, asOf) > PRICE_STALE_DAYS;
}
export type OrderStage = 'draft' | 'quoted' | 'deposit' | 'ordered' | 'delivered' | 'settled';

export const ORDER_STAGES: OrderStage[] = [
  'draft',
  'quoted',
  'deposit',
  'ordered',
  'delivered',
  'settled',
];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  draft: 'Draft',
  quoted: 'Quoted',
  deposit: 'Deposit paid',
  ordered: 'Ordered',
  delivered: 'Delivered',
  settled: 'Settled',
};

export interface OrderLine {
  productId?: string;
  description: string;
  qty: number;
  unitGhs: number;
}

export type DeliveryCondition = 'complete' | 'short' | 'damaged';

/** Receipt & discrepancy capture — recorded when an order is delivered. */
export interface DeliveryReceipt {
  /** ISO date the goods physically reached the customer. */
  on: string;
  condition: DeliveryCondition;
  /** Short-delivery / damage detail; note it whenever condition !== 'complete'. */
  note?: string;
}

export interface Order {
  id: string;
  customerId: string;
  lines: OrderLine[];
  stage: OrderStage;
  /** Total contract value in GHc. */
  valueGhs: number;
  /** Cash received against this order so far. */
  depositGhs: number;
  receivedOn: string;
  expectedDelivery?: string;
  /** Set when the order reaches delivered or settled. */
  completedOn?: string;
  /** Populated by the delivery step on the Orders pipeline. */
  receipt?: DeliveryReceipt;
  notes?: string;
}

export type InquiryChannel = 'customer app' | 'phone' | 'whatsapp' | 'walk-in';
export type InquiryStatus = 'new' | 'quoted' | 'converted' | 'closed';

export interface Inquiry {
  id: string;
  customerName: string;
  customerId?: string;
  category: Category;
  description: string;
  receivedOn: string;
  channel: InquiryChannel;
  status: InquiryStatus;
  quoteId?: string;
}

export type QuoteStatus = 'sent' | 'accepted' | 'declined' | 'expired';

/** One priced row on a quote. unitCost is what we pay; unitPrice what the
    customer pays — the gap is the margin the ladder helps set. */
export interface QuoteLine {
  description: string;
  qty: number;
  unitCostGhs?: number;
  unitPriceGhs: number;
}

export interface Quote {
  id: string;
  customerId: string;
  valueGhs: number;
  sentOn: string;
  status: QuoteStatus;
  responseDays?: number;
  orderIds: string[];
  /** Present on quotes created in the builder; seeded records may omit it. */
  lines?: QuoteLine[];
  validUntil?: string;
  notes?: string;
}

/** Totals for a quote's line items; empty when no lines were captured. */
export function quoteLineTotals(q: Quote): { costGhs: number; priceGhs: number; marginGhs: number } | null {
  if (!q.lines || q.lines.length === 0) return null;
  let cost = 0;
  let price = 0;
  for (const l of q.lines) {
    cost += (l.unitCostGhs ?? 0) * l.qty;
    price += l.unitPriceGhs * l.qty;
  }
  return { costGhs: cost, priceGhs: price, marginGhs: price - cost };
}

export type CashKind = 'deposit_in' | 'balance_in' | 'supplier_out' | 'expense_out';

export interface CashEntry {
  id: string;
  date: string;
  kind: CashKind;
  ghs: number;
  label: string;
  orderId?: string;
}

export interface OpsMeta {
  /** Reporting month as ISO prefix, e.g. "2026-10". */
  month: string;
  revenueTargetGhs: number;
  openingCashGhs: number;
}
