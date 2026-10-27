import { useState } from 'react'
import { ArrowLeft, ArrowRight, FolderGit2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { SunMark } from './brand'

export const ABOUT_SEEN_KEY = 'adensa.aboutSeen'
export const GITHUB_URL = 'https://github.com/Selaseyjr/adensa-ops'
export const CASE_STUDY_URL = `${GITHUB_URL}#case-study`
export const AUTHOR = 'Selasey Gbeddy'

/** First visit only: the About panel opens once, then lives in the footer. */
export function hasSeenAbout(): boolean {
  try {
    return localStorage.getItem(ABOUT_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markAboutSeen(): void {
  try {
    localStorage.setItem(ABOUT_SEEN_KEY, '1')
  } catch {
    /* private mode: the panel may show again next visit, which is fine */
  }
}

interface Step {
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    title: 'AdensaOps',
    body: (
      <p>
        The operations and procurement platform for Adensa Supply &amp; Logistics Ltd, a building-materials
        supplier in Accra, Ghana. One workspace runs the order pipeline from customer quote to supplier
        payment and cash collected.
      </p>
    ),
  },
  {
    title: 'Business rules, enforced',
    body: (
      <ul className="list-disc space-y-1.5 pl-4">
        <li>A 70% deposit confirms an order; established clients with 3+ paid orders may pay 50%.</li>
        <li>The balance is due before offloading on delivery.</li>
        <li>Supplier prices older than 14 days are re-checked before quoting.</li>
        <li>Every break is flagged on Orders and in the Dashboard rule checks.</li>
      </ul>
    ),
  },
  {
    title: 'How it is built',
    body: (
      <ul className="list-disc space-y-1.5 pl-4">
        <li>React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, Recharts and Leaflet.</li>
        <li>Shared metric and rule modules, so every page reports the same numbers.</li>
        <li>Cloudflare Worker with D1 for record sync; Vercel serves the app.</li>
        <li>Vitest and Playwright in CI; a deploy only ships when the tests pass.</li>
      </ul>
    ),
  },
  {
    title: 'A public demo of a real platform',
    body: (
      <p>
        This demo runs on synthetic data, dated relative to today and kept moving by a live simulation. The
        real platform is a separate build behind staff sign-in; it shares this code but never this data.
      </p>
    ),
  },
]

export function AboutProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const close = () => {
    markAboutSeen()
    setStep(0)
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-0">
        <div className="flex items-center gap-2.5">
          <SunMark className="h-7 w-auto" />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            About this project · {step + 1} of {STEPS.length}
          </span>
        </div>
        <DialogTitle className="mt-4 text-lg">{STEPS[step].title}</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-2 text-sm leading-relaxed text-ink-soft">{STEPS[step].body}</div>
        </DialogDescription>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-brand-400' : 'bg-track'}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft transition hover:text-ink"
          >
            <FolderGit2 size={14} aria-hidden="true" /> Source on GitHub
          </a>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-3 text-xs font-medium text-ink-soft transition hover:bg-subtle"
              >
                <ArrowLeft size={13} aria-hidden="true" /> Back
              </button>
            ) : (
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-lg px-3 text-xs font-medium text-ink-faint transition hover:bg-subtle hover:text-ink"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setStep((s) => s + 1))}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3.5 text-xs font-semibold text-on-primary transition hover:bg-primary-hover"
            >
              {last ? 'Open the dashboard' : 'Next'}
              {!last && <ArrowRight size={13} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Slim credit line under every page. */
export function AppFooter({ onAbout }: { onAbout: () => void }) {
  const link = 'font-medium text-ink-soft transition hover:text-ink hover:underline'
  return (
    <footer className="mx-auto mt-10 flex max-w-[1400px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-ink-faint">
      <span>
        Built by <span className="font-medium text-ink-soft">{AUTHOR}</span>
        {' · '}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={link}>
          GitHub
        </a>
        {' · '}
        <a href={CASE_STUDY_URL} target="_blank" rel="noreferrer" className={link}>
          Case study
        </a>
      </span>
      <button type="button" onClick={onAbout} className={link}>
        About this project
      </button>
    </footer>
  )
}
