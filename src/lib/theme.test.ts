// Unit tests for theme state: class toggle, browser-chrome theme-color,
// persistence key, and the light-first fallback when DOM is unavailable.

import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getTheme, persistTheme } from './theme'

beforeEach(() => {
  document.documentElement.className = ''
  document.querySelector('meta[name="theme-color"]')?.remove()
})

describe('getTheme', () => {
  it('reads dark from the html class, defaulting to light', () => {
    expect(getTheme()).toBe('light')
    document.documentElement.classList.add('dark')
    expect(getTheme()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('toggles the dark class both ways', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('retints the theme-color meta so phone/tablet browser chrome follows the theme', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)

    applyTheme('dark')
    expect(meta.getAttribute('content')).toBe('#070F1F')
    applyTheme('light')
    expect(meta.getAttribute('content')).toBe('#EAF1FB')
  })

  it('never throws when the theme-color meta is absent', () => {
    expect(() => applyTheme('dark')).not.toThrow()
  })
})

describe('persistTheme', () => {
  it('stores the choice under the documented key', () => {
    persistTheme('dark')
    expect(localStorage.getItem('adensa.theme')).toBe('dark')
    persistTheme('light')
    expect(localStorage.getItem('adensa.theme')).toBe('light')
  })
})
