// Invoice & receipt documents: model math, filenames, and PDF smoke tests.
// Renderers are exercised through output(), not save(), so the suite runs
// headless in jsdom — save() would need a real browser download manager.

import { describe, expect, it } from 'vitest'
import type { CashEntry, Customer, Order } from '../types'
import {
  buildInvoiceModel,
  buildReceiptModel,
  invoiceFilename,
  money,
  receiptFilename,
  renderInvoicePdf,
  renderReceiptPdf,
} from './invoice'

const customer: Customer = {
  id: 'cus-001',
  name: 'Cedar Homes Ltd',
  contactPerson: 'Ama Boateng',
  phone: '024 000 0000',
  city: 'Accra',
  type: 'contractor',
  productsNeeded: ['plumbing'],
}

const order: Order = {
  id: 'ORD-0233',
  customerId: 'cus-001',
  lines: [
    { description: 'PPR pipes 25mm', qty: 40, unitGhs: 120 },
    { description: 'Ball valves', qty: 10, unitGhs: 45 },
  ],
  stage: 'ordered',
  valueGhs: 12_000,
  depositGhs: 20_000,
  receivedOn: '2026-09-28',
  expectedDelivery: '2026-10-20',
}

async function pdfText(doc: Promise<Awaited<ReturnType<typeof renderInvoicePdf>>>): Promise<string> {
  // jsPDF 4.x: output() with no type returns the raw PDF bytes as a string.
  return (await doc).output()
}

describe('money', () => {
  it('formats GH¢ tabular figures', () => {
    expect(money(1234)).toBe('GH¢1,234')
    expect(money(0)).toBe('GH¢0')
  })
})

describe('buildInvoiceModel', () => {
  it('derives lines, totals, and paid-in-full status from the order', () => {
    const m = buildInvoiceModel(order, [customer], '2026-10-16')
    expect(m.number).toBe('INV-ORD-0233')
    expect(m.customerName).toBe('Cedar Homes Ltd')
    expect(m.contactLines).toEqual(['Ama Boateng', '024 000 0000', 'Accra'])
    expect(m.lines).toEqual([
      { description: 'PPR pipes 25mm', qty: 40, unitGhs: 120, amountGhs: 4800 },
      { description: 'Ball valves', qty: 10, unitGhs: 45, amountGhs: 450 },
    ])
    expect(m.totalGhs).toBe(12_000)
    expect(m.depositGhs).toBe(20_000)
    // Balance clamps at zero — an overpayment is not a negative balance.
    expect(m.balanceGhs).toBe(0)
    expect(m.status).toBe('paid')
    expect(m.deliveryLabel).toBe('Expected delivery')
    expect(m.deliveryOn).toBe('2026-10-20')
  })

  it('reports partial payment and outstanding balance', () => {
    const m = buildInvoiceModel({ ...order, depositGhs: 5_000 }, [customer])
    expect(m.balanceGhs).toBe(7_000)
    expect(m.status).toBe('partial')
  })

  it('reports due status when nothing has been received', () => {
    const m = buildInvoiceModel({ ...order, depositGhs: 0 }, [customer])
    expect(m.balanceGhs).toBe(12_000)
    expect(m.status).toBe('due')
  })

  it('falls back to a single line from the contract value when no lines were captured', () => {
    const m = buildInvoiceModel({ ...order, lines: [] }, [customer])
    expect(m.lines).toEqual([
      { description: 'Supply and delivery per agreement', qty: 1, unitGhs: 12_000, amountGhs: 12_000 },
    ])
  })

  it('degrades gracefully when the customer is unknown', () => {
    const m = buildInvoiceModel(order, [])
    expect(m.customerName).toBe('Customer')
    expect(m.contactLines).toEqual([])
  })

  it('prefers the delivery-discrepancy note over the order note', () => {
    const m = buildInvoiceModel(
      { ...order, notes: 'Order note', receipt: { on: '2026-10-10', condition: 'short', note: 'Two boxes short' } },
      [customer],
    )
    expect(m.note).toBe('Two boxes short')
  })
})

describe('filenames', () => {
  it('builds a sanitized invoice filename', () => {
    expect(invoiceFilename(buildInvoiceModel(order, [customer]))).toBe('ADENSA-INV-ORD-0233.pdf')
  })

  it('builds a sanitized receipt filename', () => {
    const entry: CashEntry = { id: 'd-csh-001', date: '2026-10-01', kind: 'deposit_in', ghs: 20_000, label: 'Deposit', orderId: 'ORD-0233' }
    expect(receiptFilename(buildReceiptModel(entry, [order], [customer]))).toBe('ADENSA-RCT-D-CSH-001.pdf')
  })

  it('strips characters no filesystem wants', () => {
    const entry: CashEntry = { id: 'a/b:c *1', date: '2026-10-01', kind: 'expense_out', ghs: 10, label: 'x' }
    expect(receiptFilename(buildReceiptModel(entry, [], []))).toBe('ADENSA-RCT-A-B-C-1.pdf')
  })
})

describe('buildReceiptModel', () => {
  const entry: CashEntry = { id: 'd-csh-001', date: '2026-10-01', kind: 'deposit_in', ghs: 20_000, label: 'Deposit for ORD-0233', orderId: 'ORD-0233' }

  it('resolves the customer through the linked order and marks money in', () => {
    const m = buildReceiptModel(entry, [order], [customer])
    expect(m.number).toBe('RCT-D-CSH-001')
    expect(m.kindLabel).toBe('Deposit received')
    expect(m.direction).toBe('in')
    expect(m.party).toBe('Cedar Homes Ltd')
    expect(m.orderId).toBe('ORD-0233')
  })

  it('marks supplier payments as money out', () => {
    const m = buildReceiptModel({ ...entry, kind: 'supplier_out' }, [order], [customer])
    expect(m.direction).toBe('out')
    expect(m.kindLabel).toBe('Supplier payment')
  })

  it('works without an order link', () => {
    const m = buildReceiptModel({ ...entry, orderId: undefined }, [order], [customer])
    expect(m.party).toBeUndefined()
    expect(m.amountGhs).toBe(20_000)
  })
})

describe('pdf renderers', () => {
  it('renders an invoice with the brand, doc number, customer, and money', async () => {
    const doc = renderInvoicePdf(buildInvoiceModel({ ...order, depositGhs: 5_000 }, [customer], '2026-10-16'))
    const text = await pdfText(doc)
    expect(text.startsWith('%PDF')).toBe(true)
    expect(text).toContain('ADENSA')
    expect(text).toContain('INVOICE')
    expect(text).toContain('INV-ORD-0233')
    expect(text).toContain('Cedar Homes Ltd')
    expect(text).toContain('PPR pipes 25mm')
    expect(text).toContain('GH¢12,000')
    expect(text).toContain('GH¢7,000')
    expect((await doc).getNumberOfPages()).toBe(1)
  })

  it('paginates an order with many lines', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i}`, qty: 1, unitGhs: 100 }))
    const doc = renderInvoicePdf(buildInvoiceModel({ ...order, lines: many }, [customer]))
    expect((await doc).getNumberOfPages()).toBeGreaterThan(1)
  })

  it('renders a receipt with kind, amount, and provenance', async () => {
    const entry: CashEntry = { id: 'd-csh-001', date: '2026-10-01', kind: 'deposit_in', ghs: 20_000, label: 'Deposit for ORD-0233', orderId: 'ORD-0233' }
    const text = await pdfText(renderReceiptPdf(buildReceiptModel(entry, [order], [customer])))
    expect(text).toContain('RECEIPT')
    expect(text).toContain('RCT-D-CSH-001')
    expect(text).toContain('DEPOSIT RECEIVED')
    expect(text).toContain('MONEY IN')
    expect(text).toContain('Cedar Homes Ltd')
    expect(text).toContain('Received with thanks')
  })

  it('renders a money-out receipt with the payment phrasing', async () => {
    const entry: CashEntry = { id: 'x1', date: '2026-10-02', kind: 'expense_out', ghs: 300, label: 'Fuel — depot run' }
    const text = await pdfText(renderReceiptPdf(buildReceiptModel(entry, [], [])))
    expect(text).toContain('MONEY OUT')
    expect(text).toContain('Payment made and recorded')
  })
})
