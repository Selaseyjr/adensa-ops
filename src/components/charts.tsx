import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_AXIS, CHART_GRID, CHART_LABEL, CHART_TOOLTIP_STYLE } from '../lib/colors'

/**
 * White (surface) card shell used around every chart and table.
 * min-w-0 is load-bearing: grid/flex children default to min-width:auto,
 * which lets Recharts' intrinsic width push the page into horizontal
 * scroll on small screens.
 */
export function ChartCard({
  title,
  sub,
  children,
  className = '',
  action,
}: {
  title: string
  sub?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-line bg-surface p-5 ${className}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  )
}

export interface DonutSlice {
  name: string
  value: number
  color: string
}

/** Donut chart with the grand total in the middle and a legend underneath. */
export function DonutChart({
  data,
  height = 180,
  centerLabel,
}: {
  data: DonutSlice[]
  height?: number
  centerLabel?: string
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const visible = data.filter((d) => d.value > 0)

  if (total === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs text-ink-faint">
        No data yet
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {visible.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-ink">{total}</div>
          {centerLabel && (
            <div className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
              {centerLabel}
            </div>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {visible.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-ink-soft">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              {d.name}
            </span>
            <span className="shrink-0 font-semibold text-ink">
              {d.value}
              <span className="ml-1 font-normal text-ink-faint">
                {Math.round((d.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
  color: string
}

/** Vertical bar chart with per-bar colours — used for category counts. */
export function CategoryBars({ data, height = 190 }: { data: BarDatum[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="min-w-0">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: CHART_AXIS, fontSize: 11 }}
            axisLine={{ stroke: CHART_GRID }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fill: CHART_AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            domain={[0, max + 1]}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ fill: 'var(--color-subtle)' }}
            formatter={(value) => [`${value} supplier${Number(value) === 1 ? '' : 's'}`, 'Count']}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Re-export so pages can style emphasised axis labels from one place. */
export { CHART_LABEL }
