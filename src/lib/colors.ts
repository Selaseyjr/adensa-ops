// Shared colour system — one blue family across chips, chart cells, map
// markers and progress bars. Categories are separated by wide, clearly
// visible steps of blue (deep navy → royal → sky → light sky → teal-blue)
// so a category is the same colour everywhere in the app.
//
// Amber and rose are reserved STRICTLY for alerts (stale price, overdue
// follow-up, no stock) — they mean "look here", never decoration.
// Gold is the brand accent: focus rings, highlights, the tagline dot.
//
// Every semantic colour is a CSS variable (defined in index.css for both
// light and dark) so a chip on a dark surface uses the dark-mode value
// automatically — dark navy text no longer disappears into the night.

import type { CSSProperties } from 'react';
import type { Category, ProspectStatus } from '../types';

export const CATEGORY_COLORS: Record<Category, string> = {
  cement: 'var(--color-cat-cement)',
  plumbing: 'var(--color-cat-plumbing)',
  electrical: 'var(--color-cat-electrical)',
  safety: 'var(--color-cat-safety)',
  tools: 'var(--color-cat-tools)',
};

/** Short labels for chart axes where the full label is too long. */
export const CATEGORY_SHORT: Record<Category, string> = {
  cement: 'Cement',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  safety: 'Safety',
  tools: 'Tools',
};

/** Pipeline stages read as deepening trust: light → mid → deep blue. */
export const STATUS_COLORS: Record<ProspectStatus, string> = {
  identified: 'var(--color-status-identified)',
  contacted: 'var(--color-status-contacted)',
  vetted: 'var(--color-status-vetted)',
};

/** Blue steps wide enough apart for a six-slice donut. */
export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  contractor: 'var(--color-ctype-contractor)',
  plumber: 'var(--color-ctype-plumber)',
  electrician: 'var(--color-ctype-electrician)',
  business: 'var(--color-ctype-business)',
  individual: 'var(--color-ctype-individual)',
  institution: 'var(--color-ctype-institution)',
};

// ---- Chart surface tokens ----
// CSS variables so charts restyle themselves in dark mode with no prop
// drilling — the <html class="dark"> switch flips them via index.css.

export const CHART_GRID = 'var(--color-line)'; // grid + axis lines
export const CHART_AXIS = 'var(--color-ink-faint)'; // tick text
export const CHART_LABEL = 'var(--color-ink-soft)'; // emphasised tick text
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-surface)',
  border: '1px solid var(--color-line)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(2, 8, 30, 0.18)',
  color: 'var(--color-ink)',
};

/** Semantic accents kept out of the blue family on purpose. */
export const ALERT_AMBER = 'var(--color-alert-amber)'; // stale / caution
export const ALERT_ROSE = 'var(--color-alert-rose)'; // overdue / no stock
export const SUCCESS_BLUE = 'var(--color-success)'; // "best delivered" — stays in family
export const SUCCESS_BLUE_SOFT = 'var(--color-brand-300)';
export const GOLD = 'var(--color-gold-400)'; // brand accent
