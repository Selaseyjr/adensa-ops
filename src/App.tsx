import { useState } from 'react'
import {
  FileText,
  LayoutDashboard,
  Moon,
  Scale,
  Tag,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { getMode, persistMode, type DataMode, type Dataset } from './lib/dataSource'
import { demo } from './data/demo'
import { real } from './data/real'
import { ComparePage, CustomersPage, DashboardPage, PlannedPage, SuppliersPage } from './pages'

type NavKey = 'dashboard' | 'suppliers' | 'customers' | 'compare' | 'quotes' | 'orders' | 'cash'

const NAV: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'compare', label: 'Compare quotes', icon: Scale },
  { key: 'quotes', label: 'Quote builder', icon: FileText },
  { key: 'orders', label: 'Orders', icon: Tag },
  { key: 'cash', label: 'Cash tracker', icon: Wallet },
]

const PLANNED: Partial<Record<NavKey, { title: string; note: string; icon: LucideIcon }>> = {
  quotes: {
    title: 'Quote builder',
    note: 'Margin ladder + print-to-PDF. Ships Day 3 of the sprint.',
    icon: FileText,
  },
  orders: {
    title: 'Order pipeline',
    note: 'Draft → Quoted → Deposit → Ordered → Delivered → Settled, with receipt & discrepancy capture. Ships Day 4.',
    icon: Tag,
  },
  cash: {
    title: 'Cash tracker',
    note: 'Deposit-vs-balance ledger and dashboard totals. Ships Day 5.',
    icon: Wallet,
  },
}

export default function App() {
  const [mode, setModeState] = useState<DataMode>(getMode)
  const [page, setPage] = useState<NavKey>('dashboard')

  const data: Dataset = mode === 'demo' ? demo : real

  function changeMode(next: DataMode) {
    persistMode(next)
    setModeState(next)
  }

  return (
    <div className="flex min-h-full">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-100">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm shadow-indigo-950">
            <Moon size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-white">ADENSA OPS</div>
            <div className="text-[10px] text-slate-400">The Night Never Falls.</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV.map((item) => {
            const active = page === item.key
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-indigo-600 font-medium text-white shadow-sm shadow-indigo-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={16} className={active ? 'text-white' : 'text-slate-400'} />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-[10px] leading-relaxed text-slate-500">
          Adensa Supply &amp; Logistics Ltd.
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: title + date + data mode toggle */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {NAV.find((n) => n.key === page)?.label}
            </h1>
            <p className="text-[11px] text-slate-500">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Data mode</span>
            <div className="flex overflow-hidden rounded-full border border-slate-300 text-xs font-medium shadow-sm">
              <button
                onClick={() => changeMode('demo')}
                className={`px-4 py-1.5 transition ${
                  mode === 'demo' ? 'bg-amber-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => changeMode('real')}
                className={`px-4 py-1.5 transition ${
                  mode === 'real' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                Real
              </button>
            </div>
          </div>
        </header>

        {/* Privacy banner — the rule made visible */}
        {mode === 'demo' ? (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-800">
            <strong>Demo data.</strong> Synthetic records — safe for screenshots, Figma and the public case
            study.
          </div>
        ) : (
          <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-2 text-xs text-emerald-800">
            <strong>Real data.</strong> Private operational records — never screenshot or publish this mode.
          </div>
        )}

        {/* Page */}
        <main className="flex-1 bg-slate-50 px-6 py-6">
          {page === 'dashboard' && <DashboardPage data={data} mode={mode} />}
          {page === 'suppliers' && <SuppliersPage data={data} />}
          {page === 'customers' && <CustomersPage data={data} />}
          {page === 'compare' && <ComparePage data={data} />}
          {PLANNED[page] && (
            <PlannedPage
              title={PLANNED[page]!.title}
              note={PLANNED[page]!.note}
              icon={PLANNED[page]!.icon}
            />
          )}
        </main>
      </div>
    </div>
  )
}
