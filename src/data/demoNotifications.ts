import type { AppNotification } from '../lib/notifications'

/**
 * SIMULATED notifications — DEMO MODE ONLY.
 *
 * These exist to demonstrate the notification flow (supplier, price, quote,
 * order, delivery, customer-inquiry events). They are never rendered on the
 * Real data page: App passes an empty list there until live events exist.
 */
export const demoNotifications: AppNotification[] = [
  {
    id: 'n-inquiry-1',
    kind: 'inquiry',
    title: 'New customer inquiry',
    message:
      'Ama Boateng requested cement pricing (50 bags, Tema) through the customer-facing app, awaiting your quotation.',
    minutesAgo: 6,
    target: 'customers',
  },
  {
    id: 'n-order-1',
    kind: 'order',
    title: 'Order received',
    message: 'Order ORD-0241 placed by Blay Construction, deposit pending.',
    minutesAgo: 42,
    target: 'orders',
  },
  {
    id: 'n-quote-1',
    kind: 'quote',
    title: 'Quotation sent',
    message: 'Quote QT-018 for plumbing supplies was sent to Nima Plumbing Works.',
    minutesAgo: 95,
    target: 'quotes',
  },
  {
    id: 'n-price-1',
    kind: 'price',
    title: 'Supplier price updated',
    message:
      'Diamond Cement distributor repriced at GH¢88.50/bag, up from GH¢86.00. Review Compare quotes before quoting.',
    minutesAgo: 180,
    target: 'compare',
  },
  {
    id: 'n-delivery-1',
    kind: 'delivery',
    title: 'Order stage update',
    message: 'Order ORD-0238 moved to Out for delivery. The client was notified automatically.',
    minutesAgo: 300,
    target: 'orders',
  },
  {
    id: 'n-supplier-1',
    kind: 'supplier',
    title: 'New supplier added',
    message:
      'Junior Masonry Supplies (safety gear, Accra) was added to the supplier pipeline as Identified.',
    minutesAgo: 1440,
    target: 'suppliers',
  },
  {
    id: 'n-price-2',
    kind: 'price',
    title: 'Price check due',
    message:
      'Two reference prices for PVC pipe are older than 14 days. Refresh them before quoting.',
    minutesAgo: 2880,
    target: 'compare',
    initiallyRead: true,
  },
  {
    id: 'n-quote-2',
    kind: 'quote',
    title: 'Quotation sent',
    message: 'Quote QT-017 for electrical fittings was sent to Elm Electrical Services.',
    minutesAgo: 4320,
    target: 'quotes',
    initiallyRead: true,
  },
]
