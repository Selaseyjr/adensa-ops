import {
  useRef,
  type ReactNode,
} from 'react'
import {
  ChevronRight,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationTarget } from '../lib/notifications'
import type { RuleFlag } from '../lib/rules'
import { CATEGORY_COLORS, CATEGORY_SHORT, STATUS_COLORS } from '../lib/colors'
import { useFocusTrap } from '../lib/a11y'
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  daysSince,
  type CashKind,
  type Category,
  type InquiryStatus,
  type OrderStage,
  type ProspectStatus,
} from '../types'
import { formatGhs } from '../lib/format'

export const CATEGORIES: Category[] = ['cement', 'plumbing', 'electrical', 'safety', 'tools']
export const STATUSES: ProspectStatus[] = ['identified', 'contacted', 'vetted']

/** Minimum table width — inside overflow-x-auto so the PAGE never scrolls sideways. */
export const TABLE_MIN_W = 'min-w-[680px]'

/** Cedi amounts: the one shared formatter (lib/format.ts). */
export const ghs = formatGhs

export function StatusChip({ status }: { status: ProspectStatus }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function CategoryChip({ category }: { category: Category }) {
  const color = CATEGORY_COLORS[category]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {CATEGORY_SHORT[category]}
    </span>
  )
}

export function Sparkline({ data, color = 'var(--color-brand-400)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const w = 104
  const h = 30
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`)
    .join(' ')
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  alert,
  trend,
  spark,
  onClick,
  hint = 'View details',
  className = '',
}: {
  icon: LucideIcon
  tone: string
  label: string
  value: string | number
  sub?: string
  alert?: boolean
  trend?: { dir: 'up' | 'down'; label: string }
  spark?: number[]
  onClick?: () => void
  hint?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-faint">{label}</div>
          <div className={`num mt-1 text-2xl font-semibold tracking-tight ${alert ? 'text-danger' : 'text-ink'}`}>
            {value}
          </div>
        </div>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
        >
          <Icon size={16} />
        </div>
      </div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
      {trend && (
        <div
          className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium ${
            trend.dir === 'up' ? 'text-success' : 'text-warning'
          }`}
        >
          {trend.dir === 'up' ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {trend.label}
        </div>
      )}
      {spark && (
        <div className="mt-2">
          <Sparkline data={spark} />
        </div>
      )}
      {onClick && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] font-medium text-ink-faint transition-colors group-hover:text-brand-600">
          {hint}
          <ChevronRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </>
  )
  if (!onClick) {
    return <div className={`min-w-0 rounded-xl border border-line bg-surface p-4 ${className}`}>{body}</div>
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${label}. ${hint}`}
      className={`group min-w-0 w-full rounded-xl border border-line bg-surface p-4 text-left transition hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${className}`}
    >
      {body}
    </button>
  )
}

/* -------------------------------- Rule flags --------------------------------- */

/** Compact chips for business-rule breaks; the detail is in the tooltip. */
export function RuleFlagChips({ flags, max = 2 }: { flags: RuleFlag[]; max?: number }) {
  if (flags.length === 0) return null
  const shown = flags.slice(0, max)
  const extra = flags.length - shown.length
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((f) => (
        <span
          key={f.key}
          title={f.detail}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
            f.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
          }`}
        >
          {f.label}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={flags.slice(max).map((f) => f.label).join(', ')}
          className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint"
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

/* ------------------------------ KPI drill-down ------------------------------ */

export type KpiDetailKey = 'revenue' | 'cash' | 'orders' | 'collect' | 'quotes' | 'inquiries'

export const CASH_KIND_LABELS: Record<CashKind, string> = {
  deposit_in: 'Deposit received',
  balance_in: 'Balance received',
  supplier_out: 'Supplier payment',
  expense_out: 'Expense paid',
}

export const INQUIRY_STATUS_TONE: Record<InquiryStatus, string> = {
  new: 'bg-warning-soft text-warning',
  quoted: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
  converted: 'bg-subtle text-ink',
  closed: 'bg-subtle text-ink-faint',
}

export function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function DetailTotals({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-lg border border-line bg-subtle px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">{t.label}</div>
          <div className="num mt-0.5 text-sm font-bold text-ink">{t.value}</div>
        </div>
      ))}
    </div>
  )
}

export function DetailTable({
  columns,
  rows,
}: {
  columns: { label: string; right?: boolean }[]
  rows: { key: string; cells: ReactNode[] }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-left text-xs ${TABLE_MIN_W}`}>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.label}
                className={`px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint ${
                  c.right ? 'text-right' : ''
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`px-2.5 py-2 align-top text-ink ${columns[i]?.right ? 'text-right tabular-nums' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DetailEmpty({ text }: { text: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center px-4 text-center text-xs text-ink-faint">
      {text}
    </div>
  )
}

export function KpiDetailModal({
  title,
  sub,
  onClose,
  footer,
  children,
}: {
  title: string
  sub?: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Focus trap: Tab stays inside, Escape closes, focus returns to the KPI.
  useFocusTrap(panelRef, true, onClose)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 px-4 py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-line bg-surface shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-ink-faint transition hover:bg-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 text-[11px] text-ink-soft">{footer}</div>}
      </div>
    </div>
  )
}

export function MapLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {CATEGORIES.map((cat) => (
        <span key={cat} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CATEGORY_COLORS[cat] }}
          />
          {CATEGORY_LABELS[cat]}
        </span>
      ))}
      <span className="ml-auto text-[10px] text-ink-faint">
        Approximate area positions &middot; &copy; OpenStreetMap
      </span>
    </div>
  )
}

/* ---------------------------------- Dashboard --------------------------------- */

export const STAGE_COLORS: Record<OrderStage, string> = {
  draft: 'var(--color-stage-draft)',
  quoted: 'var(--color-stage-quoted)',
  deposit: 'var(--color-stage-deposit)',
  ordered: 'var(--color-stage-ordered)',
  delivered: 'var(--color-stage-delivered)',
  settled: 'var(--color-stage-settled)',
}

export { IN_MOTION_STAGES } from '../lib/metrics'

export interface AttentionItem {
  key: string
  tone: 'rose' | 'amber' | 'brand'
  icon: LucideIcon
  text: string
  age: string
  target: NotificationTarget
}

export const ATTENTION_TONE: Record<AttentionItem['tone'], string> = {
  rose: 'bg-danger-soft text-danger',
  amber: 'bg-warning-soft text-warning',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300',
}

export function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-primary bg-primary text-on-primary shadow-sm'
          : 'border-line-strong bg-surface text-ink-soft hover:border-brand-400 hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

/* --------------------------------- Customers ---------------------------------- */

export function FollowUpCell({ date }: { date?: string }) {
  if (!date) return <span className="text-ink-faint">N/A</span>
  const days = -daysSince(date)
  let chip = null
  if (days < 0) {
    chip = (
      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
        overdue
      </span>
    )
  } else if (days <= 7) {
    chip = (
      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
        due in {days}d
      </span>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink">{date}</span>
      {chip}
    </div>
  )
}

/* ------------------------------- Compare quotes ------------------------------- */

