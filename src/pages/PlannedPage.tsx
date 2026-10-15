import {
  Building2,
  type LucideIcon,
} from 'lucide-react'

export function PlannedPage({
  title,
  note,
  icon: Icon,
}: {
  title: string
  note: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface p-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
        <Icon size={22} />
      </div>
      <div className="text-sm font-semibold text-ink">{title}: not built yet</div>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-soft">{note}</p>
      <div className="mx-auto mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
        <Building2 size={12} />
        On the AdensaOps build roadmap
      </div>
    </div>
  )
}
