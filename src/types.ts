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

export const PRICE_STALE_DAYS = 14;

export function daysSince(isoDate: string, asOf: Date = new Date()): number {
  const then = new Date(`${isoDate}T00:00:00`);
  return Math.floor((asOf.getTime() - then.getTime()) / 86_400_000);
}

/** A stale price produces wrong quotes — flag it loudly. */
export function isPriceStale(price: Price, asOf?: Date): boolean {
  return daysSince(price.capturedOn, asOf) > PRICE_STALE_DAYS;
}
