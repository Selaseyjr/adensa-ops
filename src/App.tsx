import { Suspense, lazy, startTransition, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  KeyRound,
  UserCog,
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
import edition from '@edition'
import { applyTheme, getTheme, persistTheme, ThemeContext, type Theme } from './lib/theme'
import { useNotifications } from './lib/notifications'
import { daysSince, type CashEntry, type Customer, type Order, type Quote, type QuoteStatus } from './types'
import { AdensaLogo } from './components/brand'
import { NotificationsBell } from './components/NotificationsBell'
import { can, ROLE_LABELS, type Permission, type StaffUser } from './lib/permissions'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
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

type NavKey = 'dashboard' | 'suppliers' | 'customers' | 'compare' | 'quotes' | 'orders' | 'cash' | 'team'

/** Canonical URL per tab - every page is deep-linkable and shareable. */
const PATH_BY_KEY: Record<NavKey, string> = {
  dashboard: '/',
  suppliers: '/suppliers',
  customers: '/customers',
  compare: '/compare',
  quotes: '/quotes',
  orders: '/orders',
  cash: '/cash',
  team: '/team',
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
  {
    label: 'People',
    items: [
      { key: 'customers', label: 'Customers', icon: Users },
      // Team management exists only in the app edition (real staff accounts).
      ...(edition.TeamPage ? [{ key: 'team' as NavKey, label: 'Team', icon: UserCog }] : []),
    ],
  },
]

const NAV: (NavItem & { group: string })[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ ...item, group: g.label })),
)

/** This build's data mode: demo for the public demo, real for the platform. */
const mode = edition.mode

function AppInner({ user }: { user: StaffUser }) {
  const [theme, setThemeState] = useState<Theme>(getTheme)
  const location = useLocation()
  const navigate = useNavigate()
  // The URL is the source of truth: refresh, back/forward and shared links
  // all land on the right page.
  const page: NavKey = KEY_BY_PATH[location.pathname] ?? 'dashboard'
  // What this person's position may open (the demo visitor sees everything).
  const allowed = (key: NavKey) => (key !== 'team' || !!edition.TeamPage) && can(user.role, `view:${key}` as Permission)
  const [accountOpen, setAccountOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  // Transitioned navigation: while a lazy chunk loads, the whole current
  // page (title + content) stays consistent instead of the header
  // switching ahead of the suspended route.
  const setPage = (next: NavKey) => startTransition(() => navigate(PATH_BY_KEY[next]))
  const [navOpen, setNavOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const toast = useToast()
  const [paletteOpen, setPaletteOpen] = useState(false)
  // About this project (demo edition only): opens by itself on a first visit.
  const [aboutOpen, setAboutOpen] = useState(() => edition.showcase && !hasSeenAbout())
  const paletteTriggerRef = useRef<HTMLButtonElement>(null)
  // Cross-page handoff: the quote builder's View action opens that order's
  // detail popup on the Orders page (consumed once by OrdersPage).
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)

  // Records created in the UI live in the browser and layer over the seed.
  // The app edition also syncs them with D1 (local-first: render from
  // localStorage at once, merge the server copy, push every commit back).
  const [localRecords, setLocalRecords] = useState<LocalRecords>(() => loadLocal(mode))
  const pushQueueRef = useRef(edition.createPush())

  // Seed + operator records (+ the live simulation, in the demo edition).
  const { dataset: data, status: dataStatus, notifications: notifItems } = edition.useEditionData(localRecords)
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

  // Merge the server copy of the records once (no-op in the demo edition).
  useEffect(() => {
    let cancelled = false
    edition.hydrate(loadLocal(mode), (merged) => {
      if (!cancelled) {
        setLocalRecords(merged)
        saveLocal(mode, merged)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  function signOut() {
    edition.signOut()
    window.location.assign('/')
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

  // The welcome hero is a self-contained poster page: no sidebar, no top bar.
  if (edition.showcase && location.pathname === '/welcome') {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <WelcomePage />
      </Suspense>
    )
  }

  if (!pathKnown || !allowed(page)) return <Navigate to="/" replace />

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
            {NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((i) => allowed(i.key)) }))
              .filter((group) => group.items.length > 0)
              .map((group) => (
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
              {edition.name === 'demo' ? (
                <span
                  title="Synthetic data for demonstration"
                  className="hidden h-7 items-center rounded-full border border-line bg-canvas px-2.5 text-[11px] font-medium text-ink-faint sm:inline-flex"
                >
                  Demo
                </span>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-label={`Account: ${user.name}, ${ROLE_LABELS[user.role]}`}
                    aria-expanded={accountOpen}
                    className="flex h-9 items-center gap-2 rounded-lg px-1.5 text-ink-soft transition hover:bg-subtle hover:text-ink"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-on-primary">
                      {user.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="hidden text-left leading-tight lg:block">
                      <span className="block text-xs font-medium text-ink">{user.name}</span>
                      <span className="block text-[10px] text-ink-faint">{ROLE_LABELS[user.role]}</span>
                    </span>
                  </button>
                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
                      onMouseLeave={() => setAccountOpen(false)}
                    >
                      <div className="px-2.5 py-2">
                        <div className="truncate text-sm font-medium text-ink">{user.name}</div>
                        <div className="truncate text-xs text-ink-faint">{user.email}</div>
                        <div className="mt-1 text-[11px] font-medium text-brand-600">{ROLE_LABELS[user.role]}</div>
                      </div>
                      <button
                        role="menuitem"
                        onClick={() => {
                          setAccountOpen(false)
                          setPasswordOpen(true)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft transition hover:bg-subtle hover:text-ink"
                      >
                        <KeyRound size={14} aria-hidden="true" /> Change password
                      </button>
                      <button
                        role="menuitem"
                        onClick={signOut}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink-soft transition hover:bg-subtle hover:text-ink"
                      >
                        <LogOut size={14} aria-hidden="true" /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Notifications: the demo shows its simulated feed; the app never does */}
              <NotificationsBell
                items={notifItems}
                state={notifState}
                onNavigate={(target) => setPage(target)}
                open={notifOpen}
                setOpen={setNotifOpen}
                emptyNote={edition.name === 'app' ? 'Live system events will appear once activity is recorded.' : undefined}
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
            {dataStatus === 'loading' && <PageSkeleton />}
            {dataStatus === 'error' && (
              <div className="mx-auto mt-16 max-w-sm rounded-xl border border-line bg-surface p-6 text-center">
                <h2 className="text-sm font-semibold text-ink">Records could not be loaded</h2>
                <p className="mt-1 text-xs text-ink-faint">The session may have expired, or the server is unreachable.</p>
                <button
                  onClick={signOut}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-on-primary transition hover:bg-primary-hover"
                >
                  Sign in again
                </button>
              </div>
            )}
            {dataStatus === 'ready' && page === 'dashboard' && (
              <DashboardPage
                data={data}
                showCash={can(user.role, 'view:cash')}
                onNavigate={(target) => setPage(target)}
                onOpenOrder={(orderId) => {
                  setPendingOrderId(orderId)
                  setPage('orders')
                }}
              />
            )}
            {dataStatus === 'ready' && page === 'suppliers' && <SuppliersPage data={data} />}
            {dataStatus === 'ready' && page === 'customers' && <CustomersPage data={data} />}
            {dataStatus === 'ready' && page === 'compare' && <ComparePage data={data} />}
            {dataStatus === 'ready' && page === 'cash' && (
              <CashTrackerPage
                data={data}
                onNavigate={(target) => setPage(target)}
                onAddCash={addCash}
              />
            )}
            {dataStatus === 'ready' && page === 'orders' && (
              <OrdersPage
                data={data}
                permissions={{
                  approve: can(user.role, 'orders:approve'),
                  money: can(user.role, 'orders:money'),
                  deliver: can(user.role, 'orders:deliver'),
                }}
                openOrderId={pendingOrderId}
                onOpenOrderConsumed={() => setPendingOrderId(null)}
                onNavigate={(target) => setPage(target)}
                onOrderAction={updateOrder}
              />
            )}
            {dataStatus === 'ready' && page === 'quotes' && (
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
            {dataStatus === 'ready' && page === 'team' && edition.TeamPage && <edition.TeamPage me={user} />}
            {edition.showcase && <AppFooter onAbout={() => setAboutOpen(true)} />}
          </main>
        </div>
      </div>

      {edition.showcase && <AboutProjectDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />}

      {edition.ChangePassword && (
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0">
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Other sessions are signed out.</DialogDescription>
            <edition.ChangePassword
              onCancel={() => setPasswordOpen(false)}
              onDone={() => {
                setPasswordOpen(false)
                toast.success('Password changed.')
              }}
            />
          </DialogContent>
        </Dialog>
      )}

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

    </ThemeContext.Provider>
  )
}

/**
 * The app edition renders nothing but the sign-in screen until the worker
 * has verified a staff account; the demo edition opens straight into the console.
 */
/**
 * App edition: sign-in, then a forced password change for accounts still on
 * a temporary password, then the console. The demo opens straight into it.
 */
function Gate() {
  const [user, setUser] = useState<StaffUser | null>(() => edition.currentUser())

  // Re-read the profile once: a role change or deactivation applies at once.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    void edition.refreshUser().then((fresh) => {
      if (!cancelled) setUser(fresh)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Dismiss the loading splash once React has painted (sign-in or console).
  useEffect(() => {
    const splash = document.getElementById('adensa-splash')
    if (!splash) return
    splash.classList.add('splash-hide')
    const t = window.setTimeout(() => splash.remove(), 700)
    return () => window.clearTimeout(t)
  }, [])

  const { SignIn, FirstPassword } = edition
  if (!user) return SignIn ? <SignIn onSignedIn={() => setUser(edition.currentUser())} /> : null
  if (user.mustChangePassword && FirstPassword) {
    return <FirstPassword name={user.name} onDone={() => setUser(edition.currentUser())} />
  }
  return <AppInner user={user} />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </BrowserRouter>
  )
}
