// Shared colour system — one palette for chips, chart cells, map markers and
// progress bars, so a category is the same colour everywhere in the app.

import type { CSSProperties } from 'react';
import type { Category, ProspectStatus } from '../types';

export const CATEGORY_COLORS: Record<Category, string> = {
  cement: '#d97706', // amber-600
  plumbing: '#0284c7', // sky-600
  electrical: '#7c3aed', // violet-600
  safety: '#059669', // emerald-600
  tools: '#e11d48', // rose-600
};

/** Short labels for chart axes where the full label is too long. */
export const CATEGORY_SHORT: Record<Category, string> = {
  cement: 'Cement',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  safety: 'Safety',
  tools: 'Tools',
};

export const STATUS_COLORS: Record<ProspectStatus, string> = {
  identified: '#a1a1aa', // zinc-400
  contacted: '#0284c7', // sky-600
  vetted: '#059669', // emerald-600
};

export const CUSTOMER_TYPE_COLORS: Record<string, string> = {
  contractor: '#4f46e5', // indigo-600
  plumber: '#0284c7', // sky-600
  electrician: '#d97706', // amber-600
  business: '#7c3aed', // violet-600
  individual: '#64748b', // slate-500
  institution: '#0d9488', // teal-600
};

/** Chart surface defaults — grid, axis and tooltip styling in one place. */
export const CHART_GRID = '#e2e8f0'; // slate-200
export const CHART_AXIS = '#94a3b8'; // slate-400
export const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
  color: '#0f172a',
};
