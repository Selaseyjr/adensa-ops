// Invoice & receipt documents. Pure models (unit-testable, no jsPDF) plus
// branded A4 renderers. Documents print on white paper, so they use the
// print-safe palette from the quote sheet — navy ink, gold rules — rather
// than the screen chrome of the command centre.
//
// Totals follow the contract value (order.valueGhs), the same number the
// money cards show; the line items are detail, not authority, so an
// over-typed description can never change what the customer owes.

import type { jsPDF } from 'jspdf'
import type { CashEntry, CashKind, Customer, Order } from '../types'

/* ── print-safe palette (mirrors the quote sheet) ─────────────────────── */
const INK: [number, number, number] = [18, 34, 74] // #12224a navy
const SOFT: [number, number, number] = [65, 82, 111] // #41526f
const FAINT: [number, number, number] = [119, 135, 163] // #7787a3
const HAIRLINE: [number, number, number] = [221, 230, 242] // #dde6f2
const SUBTLE: [number, number, number] = [242, 246, 252] // #f2f6fc
const GOLD_INK: [number, number, number] = [156, 125, 18] // #9c7d12 — gold that survives print
const PAID: [number, number, number] = [15, 110, 70] // green
const DUE: [number, number, number] = [180, 83, 9] // amber

/** Same money format as the app's columns — GH¢ tabular figures. */
export const money = (n: number): string => `GH¢${n.toLocaleString('en-GH')}`

/** Local calendar date, matching localDate() without pulling in the datasets. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Uppercase, dash-separated — safe on every OS and filesystem. */
function sanitize(part: string): string {
  return part
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const RECEIPT_KIND_LABELS: Record<CashKind, string> = {
  deposit_in: 'Deposit received',
  balance_in: 'Balance received',
  supplier_out: 'Supplier payment',
  expense_out: 'Expense paid',
}

/** Money coming in from a customer (the kinds a receipt acknowledges). */
function isInFlow(kind: CashKind): boolean {
  return kind === 'deposit_in' || kind === 'balance_in'
}

/* ── invoice model ────────────────────────────────────────────────────── */

export interface InvoiceLine {
  description: string;
  qty: number;
  unitGhs: number;
  amountGhs: number;
}

export interface InvoiceModel {
  number: string;
  orderId: string;
  issuedOn: string;
  customerName: string;
  /** Contact / phone / city lines, in that order, only when known. */
  contactLines: string[];
  receivedOn: string;
  deliveryLabel: 'Delivered' | 'Expected delivery';
  deliveryOn?: string;
  lines: InvoiceLine[];
  totalGhs: number;
  depositGhs: number;
  balanceGhs: number;
  status: 'paid' | 'partial' | 'due';
  note?: string;
}

export function buildInvoiceModel(order: Order, customers: Customer[], asOf = todayIso()): InvoiceModel {
  const customer = customers.find((c) => c.id === order.customerId)
  // Seeded orders may omit lines; the contract value is still billable.
  const lines: InvoiceLine[] = order.lines.length
    ? order.lines.map((l) => ({
        description: l.description,
        qty: l.qty,
        unitGhs: l.unitGhs,
        amountGhs: l.qty * l.unitGhs,
      }))
    : [
        {
          description: 'Supply and delivery per agreement',
          qty: 1,
          unitGhs: order.valueGhs,
          amountGhs: order.valueGhs,
        },
      ]
  const contactLines: string[] = []
  if (customer?.contactPerson) contactLines.push(customer.contactPerson)
  if (customer?.phone) contactLines.push(customer.phone)
  if (customer?.city) contactLines.push(customer.city)
  const balance = Math.max(0, order.valueGhs - order.depositGhs)
  return {
    number: `INV-${order.id}`,
    orderId: order.id,
    issuedOn: asOf,
    customerName: customer?.name ?? 'Customer',
    contactLines,
    receivedOn: order.receivedOn,
    deliveryLabel: order.completedOn ? 'Delivered' : 'Expected delivery',
    deliveryOn: order.completedOn ?? order.expectedDelivery,
    lines,
    totalGhs: order.valueGhs,
    depositGhs: order.depositGhs,
    balanceGhs: balance,
    status: balance === 0 ? 'paid' : order.depositGhs > 0 ? 'partial' : 'due',
    note: order.receipt?.note ?? order.notes,
  }
}

export function invoiceFilename(m: InvoiceModel): string {
  return `ADENSA-INV-${sanitize(m.orderId)}.pdf`
}

/* ── receipt model ────────────────────────────────────────────────────── */

export interface ReceiptModel {
  number: string;
  date: string;
  kindLabel: string;
  direction: 'in' | 'out';
  amountGhs: number;
  description: string;
  /** Customer name — shown on money-in receipts linked to an order. */
  party?: string;
  orderId?: string;
}

export function buildReceiptModel(entry: CashEntry, orders: Order[], customers: Customer[]): ReceiptModel {
  const order = orders.find((o) => o.id === entry.orderId)
  const customer = order ? customers.find((c) => c.id === order.customerId) : undefined
  return {
    number: `RCT-${sanitize(entry.id)}`,
    date: entry.date,
    kindLabel: RECEIPT_KIND_LABELS[entry.kind],
    direction: isInFlow(entry.kind) ? 'in' : 'out',
    amountGhs: entry.ghs,
    description: entry.label,
    party: customer?.name,
    orderId: entry.orderId,
  }
}

export function receiptFilename(m: ReceiptModel): string {
  return `ADENSA-${sanitize(m.number)}.pdf`
}

/* ── pdf chrome ───────────────────────────────────────────────────────── */

const M = { left: 18, right: 192 } // A4 in mm, 18mm side margins

/** Stepped ADENSA mark + wordmark left, document title right, two-tone rule. */
function drawHeader(doc: jsPDF, title: string, sub1: string, sub2?: string): void {
  const markCx = 25
  const bars: Array<[number, [number, number, number]]> = [
    [6, [201, 162, 39]],
    [10.4, INK],
    [14.8, INK],
  ]
  let by = 15
  for (const [w, rgb] of bars) {
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
    doc.roundedRect(markCx - w / 2, by, w, 3, 0.8, 0.8, 'F')
    by += 3.8
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.setCharSpace(1.6)
  doc.text('ADENSA', 40, 21.5)
  doc.setCharSpace(0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(GOLD_INK[0], GOLD_INK[1], GOLD_INK[2])
  doc.setCharSpace(1.4)
  doc.text('SUPPLY & LOGISTICS', 40, 26.5)
  doc.setCharSpace(0)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(title, M.right, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
  doc.text(sub1, M.right, 25.5, { align: 'right' })
  if (sub2) {
    doc.setFontSize(8)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.text(sub2, M.right, 30, { align: 'right' })
  }

  // Two-tone rule: navy across, gold accent under the wordmark.
  doc.setDrawColor(INK[0], INK[1], INK[2])
  doc.setLineWidth(0.7)
  doc.line(M.left, 35, M.right, 35)
  doc.setDrawColor(201, 162, 39)
  doc.line(M.left, 36.4, 48, 36.4)
}

/** Hairline + provenance on every page. */
function drawFooter(doc: jsPDF, refLine: string): void {
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2])
    doc.setLineWidth(0.3)
    doc.line(M.left, 279, M.right, 279)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.text('Generated by Adensa Ops · adensaops.vercel.app', M.left, 284)
    doc.text(refLine, M.left, 288)
    doc.text(`Page ${p} of ${pages}`, M.right, 284, { align: 'right' })
  }
}

/* ── invoice renderer ─────────────────────────────────────────────────── */

function drawItemsTable(doc: jsPDF, m: InvoiceModel, startY: number): number {
  let y = startY
  const head = () => {
    doc.setFillColor(SUBTLE[0], SUBTLE[1], SUBTLE[2])
    doc.rect(M.left, y - 4.5, M.right - M.left, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.setCharSpace(0.6)
    doc.text('ITEM', 20.5, y)
    doc.text('QTY', 126, y, { align: 'right' })
    doc.text('UNIT', 158, y, { align: 'right' })
    doc.text('AMOUNT', 189.5, y, { align: 'right' })
    doc.setCharSpace(0)
    doc.setDrawColor(INK[0], INK[1], INK[2])
    doc.setLineWidth(0.5)
    doc.line(M.left, y + 2.5, M.right, y + 2.5)
  }
  head()
  y += 8
  for (const l of m.lines) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const wrapped = doc.splitTextToSize(l.description, 96) as string[]
    const rowH = Math.max(6.5, wrapped.length * 4.2 + 2.2)
    if (y + rowH > 262) {
      doc.addPage()
      y = 24
      head()
      y += 8
    }
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
    doc.text(wrapped, 20.5, y)
    doc.text(String(l.qty), 126, y, { align: 'right' })
    doc.text(money(l.unitGhs), 158, y, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(money(l.amountGhs), 189.5, y, { align: 'right' })
    y += rowH
    doc.setDrawColor(HAIRLINE[0], HAIRLINE[1], HAIRLINE[2])
    doc.setLineWidth(0.25)
    doc.line(M.left, y - 2.6, M.right, y - 2.6)
  }
  return y
}

export async function renderInvoicePdf(m: InvoiceModel): Promise<jsPDF> {
  // Loaded on demand: jsPDF is ~120KB gzipped and only users who actually
  // download a document should pay for it.
  const { jsPDF } = await import('jspdf')
  // compress:false keeps text greppable for tests; files stay ~20KB.
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false })
  drawHeader(doc, 'INVOICE', m.number, `Issued ${m.issuedOn}`)

  // Billed to
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
  doc.setCharSpace(0.8)
  doc.text('BILLED TO', M.left, 44)
  doc.setCharSpace(0)
  doc.setFontSize(11)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(m.customerName, M.left, 49.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
  let cy = 54
  for (const line of m.contactLines) {
    doc.text(line, M.left, cy)
    cy += 4.5
  }

  // Right meta column
  const meta: Array<[string, string]> = [['Order', m.orderId], ['Received', m.receivedOn]]
  if (m.deliveryOn) meta.push([m.deliveryLabel, m.deliveryOn])
  let my = 44
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.setCharSpace(0.6)
    doc.text(k.toUpperCase(), M.right, my, { align: 'right' })
    doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(v, M.right, my + 4.5, { align: 'right' })
    my += 10
  }

  // Items
  let y = drawItemsTable(doc, m, Math.max(cy, my) + 8)

  // Totals — contract value is authoritative, matching the money cards.
  y += 5
  const totalRow = (label: string, value: string, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(bold ? 10 : 9)
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
    doc.text(label, 128, y)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(value, 189.5, y, { align: 'right' })
    y += 6
  }
  totalRow('Total', money(m.totalGhs), false)
  totalRow('Deposit received', money(m.depositGhs), false)
  doc.setDrawColor(INK[0], INK[1], INK[2])
  doc.setLineWidth(0.4)
  doc.line(128, y - 3, M.right, y - 3)
  totalRow('Balance due', money(m.balanceGhs), true)

  // Status line — wrapped into the 64mm column above the right margin so a
  // long partial-payment sentence can never run off the page edge.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  const statusText =
    m.status === 'paid'
      ? 'Paid in full — thank you.'
      : m.status === 'partial'
        ? `${money(m.balanceGhs)} part payment received — balance outstanding.`
        : `${money(m.balanceGhs)} outstanding on receipt.`
  doc.setTextColor(...(m.status === 'paid' ? PAID : DUE))
  const statusLines = doc.splitTextToSize(statusText, 62) as string[]
  doc.text(statusLines, 128, y)
  y += statusLines.length * 4.5 + 4

  // Notes (discrepancy or order note)
  if (m.note) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.setCharSpace(0.8)
    doc.text('NOTES', M.left, y)
    doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
    doc.text(doc.splitTextToSize(m.note, 100) as string[], M.left, y + 5)
  }

  drawFooter(doc, `Invoice ${m.number} · order ${m.orderId} · generated ${m.issuedOn}`)
  return doc
}

/* ── receipt renderer ─────────────────────────────────────────────────── */

export async function renderReceiptPdf(m: ReceiptModel): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false })
  drawHeader(doc, 'RECEIPT', m.number, m.date)

  const inFlow = m.direction === 'in'

  // Kind + hero amount
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(GOLD_INK[0], GOLD_INK[1], GOLD_INK[2])
  doc.setCharSpace(1)
  doc.text(m.kindLabel.toUpperCase(), M.left, 50)
  doc.setCharSpace(0)
  doc.setFontSize(30)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(money(m.amountGhs), M.left, 62)

  // Direction chip
  const chip = inFlow ? 'MONEY IN' : 'MONEY OUT'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  const chipW = doc.getTextWidth(chip) + 8
  const chipFill: [number, number, number] = inFlow ? [224, 242, 234] : [253, 243, 220]
  doc.setFillColor(chipFill[0], chipFill[1], chipFill[2])
  doc.roundedRect(M.left, 66, chipW, 6, 3, 3, 'F')
  doc.setTextColor(...(inFlow ? PAID : DUE))
  doc.text(chip, M.left + 4, 70)

  // Description card
  let y = 84
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
  doc.setCharSpace(0.8)
  doc.text('DETAIL', M.left, y)
  doc.setCharSpace(0)
  const wrapped = doc.splitTextToSize(m.description, 160) as string[]
  const cardH = wrapped.length * 4.5 + 8
  doc.setFillColor(SUBTLE[0], SUBTLE[1], SUBTLE[2])
  doc.roundedRect(M.left, y + 2, M.right - M.left, cardH, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
  doc.text(wrapped, M.left + 4, y + 8)
  y += cardH + 12

  // Meta
  const meta: Array<[string, string]> = [['Date', m.date]]
  if (m.orderId) meta.push(['Order', m.orderId])
  if (m.party && inFlow) meta.push(['Received from', m.party])
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(FAINT[0], FAINT[1], FAINT[2])
    doc.setCharSpace(0.6)
    doc.text(k.toUpperCase(), M.left, y)
    doc.setCharSpace(0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(v, M.left + 42, y)
    y += 7
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(SOFT[0], SOFT[1], SOFT[2])
  doc.text(
    inFlow
      ? 'Received with thanks for the amount stated above.'
      : 'Payment made and recorded as stated above.',
    M.left,
    y + 6,
  )

  drawFooter(doc, `Receipt ${m.number} · generated ${todayIso()}`)
  return doc
}


/* --------------------------------------------------------------------- */
/* one-call downloads (render + hand to the browser)                      */

export async function downloadInvoicePdf(order: Order, customers: Customer[]): Promise<void> {
  const model = buildInvoiceModel(order, customers)
  ;(await renderInvoicePdf(model)).save(invoiceFilename(model))
}

export async function downloadReceiptPdf(entry: CashEntry, orders: Order[], customers: Customer[]): Promise<void> {
  const model = buildReceiptModel(entry, orders, customers)
  ;(await renderReceiptPdf(model)).save(receiptFilename(model))
}
