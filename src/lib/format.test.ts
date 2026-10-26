import { describe, expect, it } from 'vitest'
import { formatCount, formatGhs, formatGhsCompact } from './format'

describe('formatGhs', () => {
  it('prints whole cedis with thousands separators', () => {
    expect(formatGhs(43600)).toBe('GH¢43,600')
    expect(formatGhs(0)).toBe('GH¢0')
  })
  it('shows pesewas only when present', () => {
    expect(formatGhs(104.5)).toBe('GH¢104.50')
    expect(formatGhs(0.1 + 0.2)).toBe('GH¢0.30')
  })
  it('puts the sign before the currency', () => {
    expect(formatGhs(-4980)).toBe('-GH¢4,980')
  })
  it('never prints NaN', () => {
    expect(formatGhs(Number.NaN)).toBe('N/A')
  })
  it('has a compact form for chart axes', () => {
    expect(formatGhsCompact(34000)).toBe('GH¢34k')
    expect(formatGhsCompact(8500)).toBe('GH¢8.5k')
    expect(formatGhsCompact(900)).toBe('GH¢900')
  })
  it('formats counts', () => {
    expect(formatCount(1234)).toBe('1,234')
  })
})
