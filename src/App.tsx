import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  FileText,
  LayoutDashboard,
  Lock,
  Eye,
  EyeOff,
  Menu,
  Moon,
  Plus,
  Search,
  Scale,
  Sun,
  Package,
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
import { fetchRealDataset, isRealUnlocked, lockReal, unlockReal } from './lib/realAccess'
import { createPushQueue, hydrateRecords } from './lib/remote'
import { applyTheme, getTheme, persistTheme, ThemeContext, type Theme } from './lib/theme'
import { useNotifications } from './lib/notifications'
import { EMPTY_SIM, mergeSim, useSimulation } from './lib/simulation'
import { demo } from './data/demo'
import { demoNotifications } from './data/demoNotifications'
import { daysSince, type CashEntry, type Customer, type Order, type Quote, type QuoteStatus } from './types'
import { AdensaLogo } from './components/brand'
import { NotificationsBell } from './components/NotificationsBell'
import { AboutProjectDialog, AppFooter, hasSeenAbout } from './components/AboutProject'
// Route-level chunks: each page (and its heavy chart/map vendor code) loads
// only when navigated to, so the first paint ships the shell alone.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const ComparePage = lazy(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage })))
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const CashTrackerPage = lazy(() => import('./pages/CashTrackerPage').then((m) => ({ default: m.CashTrackerPage })))
const QuoteBuilderPage = lazy(() => import('./quoteBuilder').then((m) => ({ default: m.QuoteBuilderPage })))
// Public exhibition hero — the only route rendered outside the console shell.
const WelcomePage = lazy(() => import('./pages/WelcomePage'))
import { ErrorBoundary, PageSkeleton } from './components/states'
import { ToastProvider, useToast } from './components/toast'
import { CommandPalette } from './components/CommandPalette'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'

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

interface NavItem {
  key: NavKey
  label: string
  icon: LucideIcon
}

/** Slim grouped navigation: the order operators actually work in. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operate',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'orders', label: 'Orders', icon: Package },
      { key: 'quotes', label: 'Quotes', icon: FileText },
    ],
  },
  {
    label: 'Source',
    items: [
      { key: 'suppliers', label: 'Suppliers', icon: Truck },
      { key: 'compare', label: 'Compare prices', icon: Scale },
    ],
  },
  { label: 'Money', items: [{ key: 'cash', label: 'Cash', icon: Wallet }] },
  { label: 'People', items: [{ key: 'customers', label: 'Customers', icon: Users }] },
]

const NAV: (NavItem & { group: string })[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ ...item, group: g.label })),
)

/** Real mode before its dataset arrives: empty, never simulated. */
const EMPTY_REAL: Dataset = {
  suppliers: [],
  products: [],
  prices: [],
  customers: [],
  orders: [],
  inquiries: [],
  quotes: [],
  cash: [],
  meta: { month: localDate().slice(0, 7), revenueTargetGhs: 0, openingCashGhs: 0 },
}

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
  // About this project: opens by itself on a first visit only.
  const [aboutOpen, setAboutOpen] = useState(() => !hasSeenAbout())
  const paletteTriggerRef = useRef<HTMLButtonElement>(null)
  // Cross-page handoff: the quote builder's View action opens that order's
  // detail popup on the Orders page (consumed once by OrdersPage).
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)

  // PIN gate state
  const [pinOpen, setPinOpen] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinChecking, setPinChecking] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  // Real data never ships in the bundle: it is fetched from the API with the
  // PIN session token, and Real mode renders empty until it arrives.
  const [realData, setRealData] = useState<Dataset | null>(null)
  const base: Dataset = mode === 'demo' ? demo : (realData ?? EMPTY_REAL)

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
    const confirmStatus = (orderId?: string) =>
      toast.success(
        status === 'accepted'
          ? orderId
            ? `Quote ${quoteId} accepted. Order ${orderId} opened, awaiting approval.`
            : `Quote ${quoteId} accepted.`
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
          ...(l.productId ? { productId: l.productId } : {}),
          description: l.description,
          qty: l.qty,
          unitGhs: l.unitPriceGhs,
        })),
        stage: 'draft',
        valueGhs: q.valueGhs,
        depositGhs: 0,
        receivedOn: localDate(),
        notes: `Created from accepted quote ${q.id}. Awaiting manager approval.`,
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
      confirmStatus(orderId)
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

  // Real dataset: load once per unlocked session; a rejected or expired
  // session drops back to Demo instead of showing a half-empty Real mode.
  useEffect(() => {
    if (mode !== 'real' || realData) return
    let cancelled = false
    void fetchRealDataset().then((dataset) => {
      if (cancelled) return
      if (dataset) {
        setRealData(dataset)
      } else {
        if (!isRealUnlocked()) lockReal()
        persistMode('demo')
        setModeState('demo')
        toast.info('Real records could not be loaded. Showing demo data.')
      }
    })
    return () => {
      cancelled = true
    }
    // toast is stable for the provider's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, realData])

  async function submitPin(e: React.FormEvent) {
    e.preventDefault()
    if (pinChecking) return
    setPinChecking(true)
    setPinError('')
    const result = await unlockReal(pinValue)
    setPinChecking(false)
    if (result === 'ok') {
      persistMode('real')
      setModeState('real')
      closePin()
      toast.info('Real records unlocked for this session.')
    } else {
      setPinError(
        result === 'locked'
          ? 'Too many attempts. Try again in a minute.'
          : result === 'unavailable'
            ? 'Real records are unavailable right now.'
            : 'Incorrect PIN. Try again.',
      )
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
    veil.style.backgroundColor = next === 'dark' ? '#0A1220' : '#F6F5F1'
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

  // The welcome hero is a self-contained poster page: no sidebar, no top bar.
  if (location.pathname === '/welcome') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <WelcomePage />
      </Suspense>
    )
  }

  if (!pathKnown) return <Navigate to="/" replace />

  return (
    <ThemeContext.Provider value={theme}>
      <div className="flex min-h-full">
        {/* Skip link: first tab stop, jumps over nav for keyboard users */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary"
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

        {/* Sidebar: fixed drawer on mobile, slim static column from md up.
            Surface-coloured in light, navy surface under .dark. */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-rail-line bg-rail text-rail-ink-soft transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 ${
            navOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            {/* Brand logo: returns to the dashboard. Not a button visually. */}
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
              title="Dashboard"
              aria-label="AdensaOps, back to dashboard"
              className="flex h-8 min-w-0 items-center rounded transition-opacity duration-200 hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <AdensaLogo className="h-8" />
            </div>
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-rail-ink-soft transition hover:bg-rail-soft hover:text-rail-ink sm:hidden"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                onClick={() => setNavOpen(false)}
                aria-label="Close navigation"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-rail-ink-soft transition hover:bg-rail-soft hover:text-rail-ink md:hidden"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rail-ink-soft">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = page === item.key
                    const Icon = item.icon
                    return (
                      <li key={item.key}>
                        <button
                          onClick={() => setPage(item.key)}
                          aria-current={active ? 'page' : undefined}
                          className={`relative flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                            active
                              ? 'bg-rail-soft font-medium text-rail-ink'
                              : 'text-rail-ink-soft hover:bg-rail-soft hover:text-rail-ink'
                          }`}
                        >
                          {active && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-400"
                            />
                          )}
                          <Icon size={15} className={active ? 'text-rail-ink' : 'text-rail-ink-soft'} />
                          {item.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-rail-line px-5 py-3 text-[10px] leading-relaxed text-rail-ink-soft">
            Adensa Supply &amp; Logistics Ltd.
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: breadcrumbs, search, mode switch, notifications, New quote */}
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:gap-3 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
              <button
                onClick={() => setNavOpen(true)}
                aria-label="Open navigation"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-soft transition hover:bg-subtle md:hidden"
              >
                <Menu size={18} />
              </button>
              <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  <li className="hidden shrink-0 text-ink-faint sm:block">
                    {NAV.find((n) => n.key === page)?.group}
                  </li>
                  <li aria-hidden="true" className="hidden text-ink-faint sm:block">
                    <ChevronRight size={13} />
                  </li>
                  <li className="min-w-0">
                    <h1 aria-current="page" className="truncate text-[13px] font-semibold text-ink">
                      {NAV.find((n) => n.key === page)?.label}
                    </h1>
                  </li>
                </ol>
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              {/* Search or jump to: opens the command palette */}
              <button
                ref={paletteTriggerRef}
                onClick={() => setPaletteOpen(true)}
                aria-label="Search or jump to (Ctrl K)"
                title="Search or jump to · Ctrl+K"
                className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-ink-faint transition hover:border-line-strong hover:text-ink sm:flex lg:w-64"
              >
                <Search size={15} aria-hidden="true" />
                <span className="hidden flex-1 text-left text-xs lg:inline">Search or jump to</span>
                <kbd className="hidden rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-faint lg:inline">
                  Ctrl K
                </kbd>
              </button>
              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="hidden h-9 w-9 items-center justify-center rounded-lg text-ink-soft transition hover:bg-subtle hover:text-ink sm:flex"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {/* Demo / Real data switch */}
              <div
                role="group"
                aria-label="Data mode"
                className="flex h-9 items-center rounded-lg border border-line bg-canvas p-0.5 text-xs font-medium"
              >
                <button
                  onClick={() => changeMode('demo')}
                  aria-pressed={mode === 'demo'}
                  className={`h-full rounded-md px-2.5 transition sm:px-3 ${
                    mode === 'demo'
                      ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                      : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  Demo
                </button>
                <button
                  onClick={() => changeMode('real')}
                  aria-pressed={mode === 'real'}
                  title={realLocked ? 'Real records are PIN-protected' : 'Real operational records'}
                  className={`flex h-full items-center gap-1 rounded-md px-2.5 transition sm:px-3 ${
                    mode === 'real'
                      ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                      : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {realLocked && <Lock size={11} aria-hidden="true" />}
                  Real
                </button>
              </div>
              {/* Notifications: Demo shows the simulated feed */}
              <NotificationsBell
                items={notifItems}
                state={notifState}
                onNavigate={(target) => setPage(target)}
                open={notifOpen}
                setOpen={setNotifOpen}
                emptyNote={mode === 'real' ? 'Live system events will appear once activity is recorded.' : undefined}
              />
              <button
                onClick={() => startTransition(() => navigate('/quotes?new=1'))}
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-on-primary transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:inline-flex"
              >
                <Plus size={14} aria-hidden="true" />
                New quote
              </button>
            </div>
          </header>

          {/* Page */}
          <main id="main" className="flex-1 bg-canvas px-4 py-5 sm:px-6 sm:py-6">
            <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
            {page === 'dashboard' && (
              <DashboardPage
                data={data}
                onNavigate={(target) => setPage(target)}
                onOpenOrder={(orderId) => {
                  setPendingOrderId(orderId)
                  setPage('orders')
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
                openOrderId={pendingOrderId}
                onOpenOrderConsumed={() => setPendingOrderId(null)}
                onNavigate={(target) => setPage(target)}
                onOrderAction={updateOrder}
              />
            )}
            {page === 'quotes' && (
              <QuoteBuilderPage
                data={data}
                mode={mode}
                onNavigate={(target) => setPage(target)}
                onViewOrder={(orderId) => {
                  setPendingOrderId(orderId)
                  setPage('orders')
                }}
                onCreateQuote={createQuote}
                onSetStatus={setQuoteStatus}
              />
            )}
            </Suspense>
            </ErrorBoundary>
            <AppFooter onAbout={() => setAboutOpen(true)} />
          </main>
        </div>
      </div>

      <AboutProjectDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

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

      {/* PIN modal — gates Real data mode on the public deployment.
          Radix Dialog supplies the focus trap, Escape handling and aria
          wiring the hand-rolled version carried; visuals are unchanged. */}
      <Dialog
        open={pinOpen}
        onOpenChange={(open) => {
          if (!open) closePin()
        }}
      >
        <DialogContent
          hideClose
          aria-modal="true"
          className="w-[calc(100%-2rem)] gap-0"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
              <Lock size={18} />
            </div>
            <div>
              <DialogTitle>
                Real data is protected<span className="sr-only">. Enter PIN</span>
              </DialogTitle>
              <DialogDescription>Enter the admin PIN to view private records.</DialogDescription>
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
                    ? 'border-danger/40 focus:ring-danger/40'
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
            {pinError && <p className="mt-2 text-xs text-danger">{pinError}</p>}
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
                className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover disabled:opacity-50"
              >
                {pinChecking ? 'Checking…' : 'Unlock'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
