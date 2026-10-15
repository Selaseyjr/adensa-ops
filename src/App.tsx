import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  FileText,
  LayoutDashboard,
  Lock,
  Eye,
  EyeOff,
  Menu,
  Moon,
  Search,
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
  nextOrderId,
  nextQuoteId,
  nextCashId,
  saveLocal,
  type LocalRecords,
  type OrderOverride,
} from './lib/localData'
import { isRealUnlocked, unlockReal, verifyPin } from './lib/realAccess'
import { createPushQueue, hydrateRecords } from './lib/remote'
import { applyTheme, getTheme, persistTheme, ThemeContext, type Theme } from './lib/theme'
import { useNotifications } from './lib/notifications'
import { EMPTY_SIM, mergeSim, useSimulation } from './lib/simulation'
import { demo } from './data/demo'
import { demoNotifications } from './data/demoNotifications'
import { real } from './data/real'
import { daysSince, type CashEntry, type Customer, type Order, type Quote, type QuoteStatus } from './types'
import lockupDay from './assets/adensa-lockup-day.svg'
import lockupNight from './assets/adensa-lockup-night.svg'
import { NotificationsBell } from './components/NotificationsBell'
// Route-level chunks: each page (and its heavy chart/map vendor code) loads
// only when navigated to, so the first paint ships the shell alone.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const CashTrackerPage = lazy(() => import('./pages/CashTrackerPage').then((m) => ({ default: m.CashTrackerPage })))
const QuoteBuilderPage = lazy(() => import('./quoteBuilder').then((m) => ({ default: m.QuoteBuilderPage })))
import { ErrorBoundary, PageSkeleton } from './components/states'
import { ToastProvider, useToast } from './components/toast'
import { CommandPalette } from './components/CommandPalette'
import { useFocusTrap } from './lib/a11y'

type NavKey = 'dashboard' | 'suppliers' | 'customers' | 'compare' | 'quotes' | 'orders' | 'cash'

/** Canonical URL per tab - every page is deep-linkable and shareable. */
const PATH_BY_KEY: Record<NavKey, string> = {
  dashboard: '/',
  suppliers: '/suppliers',
  customers: '/customers',
  compare: '/compare',
  quotes: '/quotes',
  orders: '/orders',
  cash: '/cash',
}

const KEY_BY_PATH: Record<string, NavKey> = Object.fromEntries(
  Object.entries(PATH_BY_KEY).map(([key, path]) => [path, key as NavKey]),
)

const NAV: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'compare', label: 'Compare quotes', icon: Scale },
  { key: 'quotes', label: 'Quote builder', icon: FileText },
  { key: 'orders', label: 'Orders', icon: Tag },
  { key: 'cash', label: 'Cash tracker', icon: Wallet },
]

/** Stored "real" only counts if this tab has passed the PIN gate. */
function initialMode(): DataMode {
  const stored = getMode()
  return stored === 'real' && !isRealUnlocked() ? 'demo' : stored
}

function AppInner() {
  const [mode, setModeState] = useState<DataMode>(initialMode)
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const location = useLocation()
  const navigate = useNavigate()
  // The URL is the source of truth: refresh, back/forward and shared links
  // all land on the right page.
  const page: NavKey = KEY_BY_PATH[location.pathname] ?? 'dashboard'
  // Transitioned navigation: while a lazy chunk loads, the whole current
  // page (title + content) stays consistent instead of the header
  // switching ahead of the suspended route.
  const setPage = (next: NavKey) => startTransition(() => navigate(PATH_BY_KEY[next]))
  const [navOpen, setNavOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const toast = useToast()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteTriggerRef = useRef<HTMLButtonElement>(null)
  const pinDialogRef = useRef<HTMLDivElement>(null)

  // PIN gate state
  const [pinOpen, setPinOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinChecking, setPinChecking] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  const base: Dataset = mode === 'demo' ? demo : real

  // Records created in the UI live in the browser (per mode) and layer over
  // the seeded dataset. Local-first sync: render from localStorage at once,
  // merge the D1 copy in when it arrives, and push every commit back (debounced).
  const [localRecords, setLocalRecords] = useState<LocalRecords>(() => loadLocal(initialMode()))
  const pushQueueRef = useRef(createPushQueue(initialMode()))

  // Demo simulation overlay: timed events (inquiries, orders, payments, stage
  // moves, repricing) so the demo numbers keep moving. Gated on demo mode;
  // real mode never merges or renders simulated records (privacy rule).
  const { layer: simLayer, notifications: simNotifications } = useSimulation(
    mode === 'demo',
    (sim) => mergeSim(base, localRecords, sim),
  )
  const simInMode = mode === 'demo' ? simLayer : EMPTY_SIM
  const data: Dataset = useMemo(
    () => mergeSim(base, localRecords, simInMode),
    [base, localRecords, simInMode],
  )
  const realLocked = !isRealUnlocked()

  // Notifications: static seed feed + live simulation events (demo only).
  // Live items age from createdAt on every tick; real mode always gets [].
  const notifItems = useMemo(() => {
    if (mode !== 'demo') return []
    if (simNotifications.length === 0) return demoNotifications
    const now = Date.now()
    const live = simNotifications.map((n) => ({
      ...n,
      minutesAgo: Math.max(0, (now - n.createdAt) / 60_000),
    }))
    return [...live, ...demoNotifications]
  }, [mode, simNotifications])
  const notifState = useNotifications(notifItems, mode)

  function commitRecords(next: LocalRecords) {
    setLocalRecords(next)
    saveLocal(mode, next)
    pushQueueRef.current(next)
  }

  /** New quote: assign the next id, optionally register its new customer. */
  function createQuote(q: Quote, newCustomer: Customer | null) {
    const before = localRecords
    const id = nextQuoteId(data.quotes)
    const quote: Quote = { ...q, id }
    commitRecords({
      ...localRecords,
      customers: newCustomer ? [...localRecords.customers, newCustomer] : localRecords.customers,
      quotes: [...localRecords.quotes, quote],
    })
    toast.success(`Quote ${id} created.`, { label: 'Undo', onClick: () => commitRecords(before) })
  }

  /** Accept/decline from the list; accepting also opens the follow-on order. */
  function setQuoteStatus(quoteId: string, status: QuoteStatus) {
    const q = data.quotes.find((x) => x.id === quoteId)
    if (!q) return
    const before = localRecords
    const confirmStatus = () =>
      toast.success(
        status === 'accepted'
          ? `Quote ${quoteId} accepted. Order opened.`
          : `Quote ${quoteId} declined.`,
        { label: 'Undo', onClick: () => commitRecords(before) },
      )
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
      confirmStatus()
      return
    }
    commitRecords({
      ...localRecords,
      quoteOverrides: {
        ...localRecords.quoteOverrides,
        [quoteId]: { ...prev, status, responseDays: daysSince(q.sentOn) },
      },
    })
    confirmStatus()
  }

  /** Stage / money transitions on any order, seeded or local. Each change
      lands as an override (+ optional cash entries) with an Undo toast. */
  function updateOrder(
    orderId: string,
    patch: OrderOverride,
    opts?: { cash?: Omit<CashEntry, 'id'>[]; message: string },
  ) {
    const before = localRecords
    const prev = localRecords.orderOverrides[orderId] ?? {}
    let cash = localRecords.cash
    for (const entry of opts?.cash ?? []) {
      cash = [...cash, { ...entry, id: nextCashId([...data.cash, ...cash], mode) }]
    }
    commitRecords({
      ...localRecords,
      cash,
      orderOverrides: { ...localRecords.orderOverrides, [orderId]: { ...prev, ...patch } },
    })
    toast.success(opts?.message ?? 'Order updated.', {
      label: 'Undo',
      onClick: () => commitRecords(before),
    })
  }

  /** Record a supplier payment or expense from the Cash tracker. */
  function addCash(entry: Omit<CashEntry, 'id'>, message: string) {
    const before = localRecords
    const id = nextCashId(data.cash, mode)
    commitRecords({ ...localRecords, cash: [...localRecords.cash, { ...entry, id }] })
    toast.success(message, { label: 'Undo', onClick: () => commitRecords(before) })
  }

  // A fresh mode switch loads that mode's own records, then merges the
  // server copy (D1) if a backend is reachable. Without a backend this is
  // exactly the old behaviour: local records only.
  useEffect(() => {
    pushQueueRef.current = createPushQueue(mode)
    const local = loadLocal(mode)
    setLocalRecords(local)
    let cancelled = false
    void hydrateRecords(mode, local, (merged) => {
      if (!cancelled) {
        setLocalRecords(merged)
        saveLocal(mode, merged)
      }
    })
    return () => {
      cancelled = true
    }
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
      toast.info('Real records unlocked for this session.')
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

  // Close the mobile drawer and jump to the top on navigation.
  useEffect(() => {
    setNavOpen(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Command palette shortcuts: Cmd/Ctrl+K anywhere, "/" outside inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement
        const typing =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          (el instanceof HTMLElement && el.isContentEditable)
        if (!typing) {
          e.preventDefault()
          setPaletteOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Unknown paths fall back to the dashboard instead of a blank screen.
  const pathKnown = location.pathname in KEY_BY_PATH

  // Dismiss the loading splash once React has painted. If the bundle was
  // slow the splash carried the user; now fade it out beneath them.
  useEffect(() => {
    const splash = document.getElementById('adensa-splash')
    if (!splash) return
    splash.classList.add('splash-hide')
    const t = window.setTimeout(() => splash.remove(), 700)
    return () => window.clearTimeout(t)
  }, [])

  // Focus trap: keeps Tab inside the PIN dialog, Escape closes it,
  // focus returns to the control that opened it.
  useFocusTrap(pinDialogRef, pinOpen, closePin)

  if (!pathKnown) return <Navigate to="/" replace />

  return (
    <ThemeContext.Provider value={theme}>
      <div className="flex min-h-full">
        {/* Skip link: first tab stop, jumps over nav for keyboard users */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
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
          className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-surface text-ink-soft transition-all duration-200 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-100 md:static md:w-60 md:translate-x-0 ${
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
              {/* w-full + max-w so the lockup shrinks beside the toggle buttons
                  instead of overlapping them (on a phone the old fixed w-40 sat
                  on top of the theme toggle and swallowed every tap on it). */}
              <div className="relative aspect-[410/150] w-full max-w-40">
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
            {/* z-10 keeps these tappable above the lockup image at any width */}
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-ink-faint transition hover:bg-subtle hover:text-ink dark:text-brand-300 dark:hover:bg-brand-900 dark:hover:text-white sm:hidden"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-ink-faint transition hover:bg-subtle hover:text-ink dark:text-brand-300 dark:hover:bg-brand-900 dark:hover:text-white md:hidden"
              >
                <X size={18} />
              </button>
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
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
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
          <header className="flex items-center justify-between gap-1.5 border-b border-line bg-surface px-3 py-3 sm:gap-3 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
              <button
                onClick={() => setNavOpen(true)}
                aria-label="Open navigation"
                className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-ink-soft transition hover:bg-subtle md:hidden"
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
                className="relative hidden aspect-[410/150] h-7 shrink-0 cursor-pointer rounded transition-opacity duration-200 hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:block md:hidden"
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
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[13px] font-semibold text-ink sm:text-base">
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
              {/* Search trigger for the command palette */}
              <button
                ref={paletteTriggerRef}
                onClick={() => setPaletteOpen(true)}
                aria-label="Search (Command K)"
                title="Search · Ctrl+K"
                className="hidden min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-2.5 text-ink-soft transition hover:bg-subtle hover:text-ink sm:flex lg:min-w-auto lg:justify-start"
              >
                <Search size={16} aria-hidden="true" />
                <span className="hidden text-xs lg:inline">Search</span>
              </button>
              {/* Theme toggle — night shift mode */}
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="hidden min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-surface text-ink-soft transition hover:bg-subtle hover:text-ink sm:flex"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <span className="hidden text-xs font-medium text-ink-faint sm:inline">Data mode</span>
              <div className="flex overflow-hidden rounded-full border border-line-strong text-xs font-medium shadow-sm">
                <button
                  onClick={() => changeMode('demo')}
                  className={`min-h-11 px-2 transition sm:px-4 ${
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
                  className={`flex min-h-11 items-center gap-1.5 px-2 transition sm:px-4 ${
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
          <main id="main" className="flex-1 bg-canvas px-4 py-5 sm:px-6 sm:py-6">
            <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
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
            {page === 'cash' && (
              <CashTrackerPage
                data={data}
                onNavigate={(target) => setPage(target)}
                onAddCash={addCash}
              />
            )}
            {page === 'orders' && (
              <OrdersPage
                data={data}
                onNavigate={(target) => setPage(target)}
                onOrderAction={updateOrder}
              />
            )}
            {page === 'quotes' && (
              <QuoteBuilderPage
                data={data}
                mode={mode}
                onNavigate={(target) => setPage(target)}
                onCreateQuote={createQuote}
                onSetStatus={setQuoteStatus}
              />
            )}
            </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      {/* Theme crossfade veil — sits above all, invisible except mid-swap */}
      <div id="theme-veil" aria-hidden="true" />

      <CommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false)
          paletteTriggerRef.current?.focus()
        }}
        data={data}
        onNavigate={setPage}
      />

      {/* PIN modal — gates Real data mode on the public deployment */}
      {pinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/60 px-4"
          onClick={closePin}
          role="presentation"
        >
          <div
            ref={pinDialogRef}
            tabIndex={-1}
            className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-xl outline-none"
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

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </BrowserRouter>
  )
}
