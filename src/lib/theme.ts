// Theme state — 'The Night Never Falls' after all: the ops team works nights,
// so dark mode is a first-class feature. The <html class="dark"> flag flips
// every --color-* token defined in index.css; index.html applies the saved
// theme before first paint to avoid a flash.

import { createContext, useContext } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'adensa.theme';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode etc. — theme still applies for this session */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // Phone and tablet browsers tint the browser chrome with theme-color.
  document
    .querySelector('meta[name="theme-color"]:not([media])')
    ?.setAttribute('content', theme === 'dark' ? '#070F1F' : '#EAF1FB');
}

/** Provided by <App>; consumed by components that cannot inherit CSS tokens (Leaflet). */
export const ThemeContext = createContext<Theme>('light');

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
