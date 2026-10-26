// One money formatter for the whole product: screens, PDFs, toasts and
// notifications all print cedis the same way.
//
//   formatGhs(43600)    -> "GH¢43,600"
//   formatGhs(104.5)    -> "GH¢104.50"
//   formatGhs(-4980)    -> "-GH¢4,980"
//   formatGhsCompact(43600) -> "GH¢43.6k"  (chart axes only)

const whole = new Intl.NumberFormat('en-GH', { maximumFractionDigits: 0 })
const pesewas = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const count = new Intl.NumberFormat('en-GH', { maximumFractionDigits: 0 })

export function formatGhs(n: number): string {
  if (!Number.isFinite(n)) return 'N/A'
  const abs = Math.abs(n)
  // Show pesewas only when there are any (unit prices like 104.50).
  const body = Math.round(abs * 100) % 100 === 0 ? whole.format(abs) : pesewas.format(abs)
  return `${n < 0 ? '-' : ''}GH¢${body}`
}

export function formatGhsCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}GH¢${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`
  if (abs >= 1_000) return `${sign}GH¢${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
  return formatGhs(n)
}

/** Plain counts (quantities, supplier numbers) with thousands separators. */
export function formatCount(n: number): string {
  return count.format(n)
}
