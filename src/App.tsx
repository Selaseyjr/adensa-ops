import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FileText,
  LayoutDashboard,
  Lock,
  Eye,
  EyeOff,
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
import {
  loadLocal,
  localDate,
  mergeDataset,
  nextOrderId,
  nextQuoteId,
  saveLocal,
  type LocalRecords,
} from './lib/localData'
import { isRealUnlocked, unlockReal, verifyPin } from './lib/realAccess'
import { applyTheme, getTheme, persistTheme, ThemeContext, type Theme } from './lib/theme'
import { useNotifications } from './lib/notifications'
import { demo } from './data/demo'
import { demoNotifications } from './data/demoNotifications'
import { real } from './data/real'
import { daysSince, type Customer, type Order, type Quote, type QuoteStatus } from './types'
import lockupDay from './assets/adensa-lockup-day.svg'
import lockupNight from './assets/adensa-lockup-night.svg'
import { NotificationsBell } from './components/NotificationsBell'
import { ComparePage, CustomersPage, DashboardPage, PlannedPage, SuppliersPage } from './pages'
import { QuoteBuilderPage } from './quoteBuilder'

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

/** Stored "real" only counts if this tab has passed the PIN gate. */
function initialMode(): DataMode {
  const stored = getMode()
  return stored === 'real' && !isRealUnlocked() ? 'demo' : stored
}

export default function App() {
  const [mode, setModeState] = useState<DataMode>(initialMode)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const [page, setPage] = useState<NavKey>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Notifications: simulated feed in Demo mode ONLY. The real page always
  // gets an empty list until live events exist - never simulated data there.
  const notifItems = useMemo(() => (mode === 'demo' ? demoNotifications : []), [mode])
  const notifState = useNotifications(notifItems)

  // PIN gate state
  const [pinOpen, setPinOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinChecking, setPinChecking] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  const base: Dataset = mode === 'demo' ? demo : real

  // Records created in the UI live in the browser (per mode) and layer over
  // the seeded dataset. Swap loadLocal/saveLocal for an API when D1 lands.
  const [localRecords, setLocalRecords] = useState<LocalRecords>(() => loadLocal(initialMode()))
  const data: Dataset = useMemo(() => mergeDataset(base, localRecords), [base, localRecords])
  const realLocked = !isRealUnlocked()

  function commitRecords(next: LocalRecords) {
    setLocalRecords(next)
    saveLocal(mode, next)
  }

  /** New quote: assign the next id, optionally register its new customer. */
  function createQuote(q: Quote, newCustomer: Customer | null) {
    const id = nextQuoteId(data.quotes)
    const quote: Quote = { ...q, id }
    commitRecords({
      ...localRecords,
      customers: newCustomer ? [...localRecords.customers, newCustomer] : localRecords.customers,
      quotes: [...localRecords.quotes, quote],
    })
  }

  /** Accept/decline from the list; accepting also opens the follow-on order. */
  function setQuoteStatus(quoteId: string, status: QuoteStatus) {
    const q = data.quotes.find((x) => x.id === quoteId)
    if (!q) return
    const prev = localRecords.quoteOverrides[quoteId] ?? {}
    if (status === 'accepted' && q.orderIds.length === 0 && (prev.orderIds?.length ?? 0) === 0) {
      const orderId = nextOrderId(data.orders)
      const order: Order = {
        id: orderId,
        customerId: q.customerId,
        lines: (q.lines ?? []).map((l) => ({
          description: l.description,
          qty: l.qty,
          unitGhs: l.unitPriceGhs,
        })),
        stage: 'quoted',
        valueGhs: q.valueGhs,
        depositGhs: 0,
        receivedOn: localDate(),
        notes: `Created from accepted quote ${q.id}.`,
      }
      commitRecords({
        ...localRecords,
        orders: [...localRecords.orders, order],
        quotes: [...localRecords.quotes],
        quoteOverrides: {
          ...localRecords.quoteOverrides,
          [quoteId]: { ...prev, status, responseDays: daysSince(q.sentOn), orderIds: [orderId] },
        },
      })
      return
    }
    commitRecords({
      ...localRecords,
      quoteOverrides: {
        ...localRecords.quoteOverrides,
        [quoteId]: { ...prev, status, responseDays: daysSince(q.sentOn) },
      },
    })
  }

  // A fresh mode switch loads that mode's own records.
  useEffect(() => {
    setLocalRecords(loadLocal(mode))
  }, [mode])

  function changeMode(next: DataMode) {
    if (next === 'real' && !isRealUnlocked()) {
      setPinValue('')
      setPinError('')
      setPinOpen(true)
      return
    }
    persistMode(next)
    setModeState(next)
  }

  function closePin() {
    setPinOpen(false)
    setPinValue('')
    setPinError('')
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault()
    if (pinChecking) return
    setPinChecking(true)
    setPinError('')
    const ok = await verifyPin(pinValue)
    setPinChecking(false)
    if (ok) {
      unlockReal()
      persistMode('real')
      setModeState('real')
      closePin()
    } else {
      setPinError('Incorrect PIN. Try again.')
      pinInputRef.current?.select()
    }
  }

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const veil = document.getElementById('theme-veil')
    if (!veil || reduced) {
      applyTheme(next)
      persistTheme(next)
      setThemeState(next)
      return
    }
    // Slow smooth crossfade: a veil of the incoming canvas colour fades in,
    // the theme swaps underneath it at full cover, then the veil lifts.
    veil.style.transition = 'opacity 450ms ease'
    veil.style.backgroundColor = next === 'dark' ? '#0b1424' : '#f2f6fc'
    veil.style.opacity = '1'
    window.setTimeout(() => {
      applyTheme(next)
      persistTheme(next)
      setThemeState(next)
      veil.style.transition = 'opacity 650ms ease'
      veil.style.opacity = '0'
    }, 480)
  }

  // Close the mobile drawer whenever the page changes.
  useEffect(() => {
    setNavOpen(false)
  }, [page])

  // Dismiss the loading splash once React has painted. If the bundle was
  // slow the splash carried the user; now fade it out beneath them.
  useEffect(() => {
    const splash = document.getElementById('adensa-splash')
    if (!splash) return
    splash.classList.add('splash-hide')
    const t = window.setTimeout(() => splash.remove(), 700)
    return () => window.clearTimeout(t)
  }, [])

  // Focus the PIN field when the modal opens.
  useEffect(() => {
    if (pinOpen) pinInputRef.current?.focus()
  }, [pinOpen])

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
          className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-line bg-surface text-ink-soft transition-all duration-200 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-100 md:static md:translate-x-0 ${
            navOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-start justify-between gap-2.5 border-b border-line px-5 py-4 dark:border-brand-900">
            {/* Brand lockup: day/night image follows the theme; click returns home */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPage('dashboard')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPage('dashboard')
                }
              }}
              title="Back to dashboard"
              aria-label="AdensaOps, back to dashboard"
              className="min-w-0 cursor-pointer rounded-lg transition-opacity duration-200 hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]"
            >
              <div className="relative aspect-[410/150] w-40">
                <img
                  src={lockupNight}
                  alt=""
                  aria-hidden="true"
                  className={`absolute inset-0 h-full w-full object-contain object-left transition-opacity duration-200 ${
                    theme === 'dark' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <img
                  src={lockupDay}
                  alt="Adensa"
                  className={`absolute inset-0 h-full w-full object-contain object-left transition-opacity duration-200 ${
                    theme === 'dark' ? 'opacity-0' : 'opacity-100'
                  }`}
                />
              </div>
              <span className="mt-1.5 block text-[10px] text-ink-faint dark:text-brand-300">
                Your project, Our Procurement.
              </span>
            </div>
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close navigation"
              className="cursor-pointer rounded-md p-1 text-ink-faint transition hover:bg-subtle hover:text-ink dark:text-brand-300 dark:hover:bg-brand-900 dark:hover:text-white md:hidden"
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
                      : 'text-ink-soft hover:bg-subtle hover:text-ink dark:text-brand-200 dark:hover:bg-brand-900 dark:hover:text-white'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-white' : 'text-ink-faint dark:text-brand-400'} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="border-t border-line px-5 py-4 text-[10px] leading-relaxed text-ink-faint dark:border-brand-900 dark:text-brand-400">
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
              <div
                role="button"
                tabIndex={0}
                onClick={() => setPage('dashboard')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setPage('dashboard')
                  }
                }}
                title="Back to dashboard"
                aria-label="AdensaOps, back to dashboard"
                className="relative aspect-[410/150] h-7 shrink-0 cursor-pointer rounded transition-opacity duration-200 hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 md:hidden"
              >
                <img
                  src={lockupNight}
                  alt=""
                  aria-hidden="true"
                  className={`absolute inset-0 h-full w-full object-contain object-left transition-opacity duration-200 ${
                    theme === 'dark' ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <img
                  src={lockupDay}
                  alt="Adensa"
                  className={`absolute inset-0 h-full w-full object-contain object-left transition-opacity duration-200 ${
                    theme === 'dark' ? 'opacity-0' : 'opacity-100'
                  }`}
                />
              </div>
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
                  title={realLocked ? 'Real records are PIN-protected' : 'Real operational records'}
                  className={`flex items-center gap-1.5 px-4 py-1.5 transition ${
                    mode === 'real'
                      ? 'bg-amber-700 text-white'
                      : 'bg-surface text-ink-soft hover:bg-subtle'
                  }`}
                >
                  {realLocked && <Lock size={11} />}
                  Real
                </button>
              </div>
              {/* Notifications - top-right corner; Demo shows the simulated feed */}
              <NotificationsBell
                items={notifItems}
                state={notifState}
                onNavigate={(target) => setPage(target)}
                open={notifOpen}
                setOpen={setNotifOpen}
                emptyNote={
                  mode === 'real'
                    ? 'Live system events will appear once activity is recorded.'
                    : undefined
                }
              />
            </div>
          </header>

          {/* Page */}
          <main className="flex-1 bg-canvas px-4 py-5 sm:px-6 sm:py-6">
            {page === 'dashboard' && (
              <DashboardPage
                data={data}
                unreadCount={notifState.unreadCount}
                onNavigate={(target) => setPage(target)}
                onGetStarted={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  setPage('dashboard')
                  setNotifOpen(true)
                }}
              />
            )}
            {page === 'suppliers' && <SuppliersPage data={data} />}
            {page === 'customers' && <CustomersPage data={data} />}
            {page === 'compare' && <ComparePage data={data} />}
            {page === 'quotes' && (
              <QuoteBuilderPage
                data={data}
                mode={mode}
                onNavigate={(target) => setPage(target)}
                onCreateQuote={createQuote}
                onSetStatus={setQuoteStatus}
              />
            )}
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

      {/* Theme crossfade veil — sits above all, invisible except mid-swap */}
      <div id="theme-veil" aria-hidden="true" />

      {/* PIN modal — gates Real data mode on the public deployment */}
      {pinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 px-4"
          onClick={closePin}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pin-title"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                <Lock size={18} />
              </div>
              <div>
                <h2 id="pin-title" className="text-sm font-semibold text-ink">
                  Real data is protected
                </h2>
                <p className="text-xs text-ink-faint">Enter the admin PIN to view private records.</p>
              </div>
            </div>
            <form onSubmit={submitPin} className="mt-5">
              <div className="relative">
                <input
                  ref={pinInputRef}
                  type={pinVisible ? 'text' : 'password'}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value)}
                  placeholder="PIN"
                  autoComplete="off"
                  inputMode="text"
                  aria-label="Admin PIN"
                  className={`w-full rounded-lg border bg-canvas px-3 py-2.5 pr-10 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 ${
                    pinError
                      ? 'border-rose-400 focus:ring-rose-300'
                      : 'border-line-strong focus:ring-brand-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setPinVisible((v) => !v)}
                  aria-label={pinVisible ? 'Hide PIN' : 'Show PIN'}
                  title={pinVisible ? 'Hide PIN' : 'Show PIN'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  {pinVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {pinError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{pinError}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closePin}
                  className="rounded-lg border border-line-strong px-4 py-2 text-xs font-medium text-ink-soft transition hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pinChecking || pinValue.length === 0}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {pinChecking ? 'Checking…' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ThemeContext.Provider>
  )
}
