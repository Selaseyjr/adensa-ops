import { useEffect, useState } from 'react'
import {
  FileText,
  LayoutDashboard,
  Menu,
  Moon,
  Scale,
  Sun,
  Tag,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { getMode, persistMode, type DataMode, type Dataset } from './lib/dataSource'
import { applyTheme, getTheme, persistTheme, ThemeContext, type Theme } from './lib/theme'
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
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [page, setPage] = useState<NavKey>('dashboard')
  const [navOpen, setNavOpen] = useState(false)

  const data: Dataset = mode === 'demo' ? demo : real

  function changeMode(next: DataMode) {
    persistMode(next)
    setModeState(next)
  }

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    persistTheme(next)
    setThemeState(next)
  }

  // Close the mobile drawer whenever the page changes.
  useEffect(() => {
    setNavOpen(false)
  }, [page])

  return (
    <ThemeContext.Provider value={theme}>
      <div className="flex min-h-full">
        {/* Mobile backdrop */}
        {navOpen && (
          <button
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-30 bg-brand-950/50 md:hidden"
          />
        )}

        {/* Sidebar — fixed drawer on mobile, static column from md up */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-brand-900 bg-brand-950 text-brand-100 transition-transform duration-200 md:static md:translate-x-0 ${
            navOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between gap-2.5 border-b border-brand-900 px-5 py-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 shadow-sm shadow-brand-950">
                <Moon size={16} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-widest text-white">ADENSA OPS</div>
                <div className="text-[10px] text-brand-300">The Night Never Falls.</div>
              </div>
            </div>
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="rounded-md p-1 text-brand-300 hover:bg-brand-900 hover:text-white md:hidden"
            >
              <X size={18} />
            </button>
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
                      ? 'bg-brand-600 font-medium text-white shadow-sm shadow-brand-950'
                      : 'text-brand-200 hover:bg-brand-900 hover:text-white'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-white' : 'text-brand-400'} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="border-t border-brand-900 px-5 py-4 text-[10px] leading-relaxed text-brand-400">
            Adensa Supply &amp; Logistics Ltd.
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: menu + title + date + controls */}
          <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setNavOpen(true)}
                aria-label="Open navigation"
                className="rounded-lg border border-line-strong p-2 text-ink-soft transition hover:bg-subtle md:hidden"
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-ink">
                  {NAV.find((n) => n.key === page)?.label}
                </h1>
                <p className="hidden text-[11px] text-ink-faint sm:block">
                  {new Date().toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {/* Theme toggle — night shift mode */}
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="rounded-lg border border-line-strong bg-surface p-2 text-ink-soft transition hover:bg-subtle hover:text-ink"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <span className="hidden text-xs font-medium text-ink-faint sm:inline">Data mode</span>
              <div className="flex overflow-hidden rounded-full border border-line-strong text-xs font-medium shadow-sm">
                <button
                  onClick={() => changeMode('demo')}
                  className={`px-4 py-1.5 transition ${
                    mode === 'demo'
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface text-ink-soft hover:bg-subtle'
                  }`}
                >
                  Demo
                </button>
                <button
                  onClick={() => changeMode('real')}
                  className={`px-4 py-1.5 transition ${
                    mode === 'real'
                      ? 'bg-amber-600 text-white'
                      : 'bg-surface text-ink-soft hover:bg-subtle'
                  }`}
                >
                  Real
                </button>
              </div>
            </div>
          </header>

          {/* Privacy banner — the rule made visible */}
          {mode === 'demo' ? (
            <div className="border-b border-brand-200 bg-brand-50 px-4 py-2 text-xs text-brand-800 sm:px-6">
              <strong>Demo data.</strong> Synthetic records — safe for screenshots, Figma and the
              public case study.
            </div>
          ) : (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 sm:px-6">
              <strong>Real data.</strong> Private operational records — never screenshot or publish
              this mode.
            </div>
          )}

          {/* Page */}
          <main className="flex-1 bg-canvas px-4 py-5 sm:px-6 sm:py-6">
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
    </ThemeContext.Provider>
  )
}
