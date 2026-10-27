import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Vitest runs with globals: false, so React Testing Library can't register
// its own cleanup hook — we do it here.
afterEach(() => {
  cleanup()
})

// localStorage is app state (local records, theme, session): isolate tests.
// Node-environment files (the worker tests) have no DOM, so skip it there.
beforeEach(() => {
  if (typeof localStorage === 'undefined') return
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
