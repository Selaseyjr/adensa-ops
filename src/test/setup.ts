import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// Vitest runs with globals: false, so React Testing Library can't register
// its own cleanup hook — we do it here.
afterEach(() => {
  cleanup()
})

// localStorage is app state (data mode, local records, theme): isolate tests.
beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
