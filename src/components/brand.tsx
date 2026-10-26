/**
 * Adensa brand: the "First Light" mark (a gold half-sun with five rays
 * rising over two stepped bars) and the horizontal lockup.
 *
 * Geometry is defined once here (on a 640 unit artboard) and shared by the
 * favicon, splash, invoice PDF header and every in-app logo, so the mark can
 * never drift between surfaces. The bars take `currentColor`-style tokens:
 * navy on light surfaces, ivory on dark ones.
 */

export const BRAND = {
  gold: '#D4A21E',
  navy: '#0E1B2C',
  ivory: '#F6F2EA',
} as const

/** Sun centre, radius and ray angles (degrees from the horizon). */
export const SUN = { cx: 320, cy: 278, r: 56, rayInner: 72, rayOuter: 100, rayWidth: 13 }
export const RAY_ANGLES = [30, 60, 90, 120, 150]
export const BARS = [
  { x: 204, y: 305, w: 232, h: 72, rx: 12 },
  { x: 152, y: 403, w: 336, h: 72, rx: 12 },
]
/** Tight crop around the artwork (x, y, w, h). */
export const MARK_VIEWBOX = [140, 160, 360, 330] as const

export function rayLines(): { x1: number; y1: number; x2: number; y2: number }[] {
  return RAY_ANGLES.map((deg) => {
    const a = (deg * Math.PI) / 180
    const dx = Math.cos(a)
    const dy = -Math.sin(a)
    return {
      x1: SUN.cx + dx * SUN.rayInner,
      y1: SUN.cy + dy * SUN.rayInner,
      x2: SUN.cx + dx * SUN.rayOuter,
      y2: SUN.cy + dy * SUN.rayOuter,
    }
  })
}

/** The mark's shapes, for embedding inside another <svg>. */
export function MarkShapes({ bar }: { bar: string }) {
  const { cx, cy, r } = SUN
  return (
    <>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={BRAND.gold} />
      {rayLines().map((l, i) => (
        <line
          key={i}
          {...l}
          stroke={BRAND.gold}
          strokeWidth={SUN.rayWidth}
          strokeLinecap="round"
        />
      ))}
      {BARS.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.rx} fill={bar} />
      ))}
    </>
  )
}

/** Standalone mark. `tone` picks the bar colour for the surface it sits on. */
export function SunMark({
  tone = 'auto',
  className,
  title,
}: {
  /** 'day' = navy bars, 'night' = ivory bars, 'auto' = follows the theme ink. */
  tone?: 'day' | 'night' | 'auto'
  className?: string
  title?: string
}) {
  const bar = tone === 'day' ? BRAND.navy : tone === 'night' ? BRAND.ivory : 'var(--color-ink)'
  return (
    <svg
      viewBox={MARK_VIEWBOX.join(' ')}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      <MarkShapes bar={bar} />
    </svg>
  )
}

/**
 * Horizontal lockup: mark + ADENSA wordmark (Poppins, the only place the
 * face is used) + optional category descriptor. Inline rather than an <img>
 * so the wordmark renders in the loaded Poppins face and follows the theme.
 */
export function AdensaLogo({
  descriptor = 'SUPPLY & LOGISTICS',
  className = '',
  tone = 'auto',
}: {
  descriptor?: string | null
  className?: string
  tone?: 'day' | 'night' | 'auto'
}) {
  const ink = tone === 'day' ? BRAND.navy : tone === 'night' ? BRAND.ivory : 'var(--color-ink)'
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SunMark tone={tone} className="h-full w-auto shrink-0" />
      <span className="flex min-w-0 flex-col justify-center leading-none">
        <span
          className="font-logo text-[17px] font-bold tracking-[0.14em]"
          style={{ color: ink }}
        >
          ADENSA
        </span>
        {descriptor && (
          <span className="font-logo mt-1 whitespace-nowrap text-[7.5px] font-semibold tracking-[0.28em] text-brand-600">
            {descriptor}
          </span>
        )}
      </span>
    </span>
  )
}
