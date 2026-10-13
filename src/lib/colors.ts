// Shared colour system — one blue family across chips, chart cells, map
// markers and progress bars. Categories are separated by wide, clearly
// visible steps of blue (deep navy → royal → sky → light sky → teal-blue)
// so a category is the same colour everywhere in the app.
//
// Amber and rose are reserved STRICTLY for alerts (stale price, overdue
// follow-up, no stock) — they mean "look here", never decoration.

import type { CSSProperties } from 'react';
import type { Category, ProspectStatus } from '../types';

export const CATEGORY_COLORS: Record<Category, string> = {
  cement: '#1e3a8a', // blue-900 — deep navy
  plumbing: '#2563eb', // blue-600 — royal
  electrical: '#0ea5e9', // sky-500 — bright sky
  safety: '#93c5fd', // blue-300 — light sky
  tools: '#0369a1', // sky-700 — teal-blue
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
  identified: '#93c5fd', // blue-300
  contacted: '#3b82f6', // blue-500
  vetted: '#1e3a8a', // blue-900
};

/** Blue steps wide enough apart for a six-slice donut. */
export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  contractor: '#1e3a8a', // blue-900
  plumber: '#2563eb', // blue-600
  electrician: '#0ea5e9', // sky-500
  business: '#1d4ed8', // blue-700
  individual: '#93c5fd', // blue-300
  institution: '#0369a1', // sky-700
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
export const ALERT_AMBER = '#d97706'; // stale / caution
export const ALERT_ROSE = '#e11d48'; // overdue / no stock
export const SUCCESS_BLUE = '#1d4ed8'; // "best delivered" — stays in family
export const SUCCESS_BLUE_SOFT = '#93c5fd';
