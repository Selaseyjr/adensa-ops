import { describe, expect, it } from 'vitest'
import { BARS, BRAND, RAY_ANGLES, SUN } from './brand'
// @ts-expect-error plain ESM build script, no type declarations
import * as assets from '../../scripts/build-brand-assets.mjs'
import committedFavicon from '../../public/favicon.svg?raw'

describe('First Light brand geometry', () => {
  it('the asset generator and the in-app logo share one geometry', () => {
    expect(assets.SUN).toEqual(SUN)
    expect(assets.RAY_ANGLES).toEqual(RAY_ANGLES)
    expect(assets.BARS).toEqual(BARS)
    expect(assets.BRAND).toEqual(BRAND)
  })

  it('the committed favicon is the current generator output', () => {
    expect(committedFavicon).toBe(assets.iconSvg())
  })

  it('has a half-sun with five rays over two bars', () => {
    expect(RAY_ANGLES).toHaveLength(5)
    expect(BARS).toHaveLength(2)
    expect(BARS[1].w).toBeGreaterThan(BARS[0].w)
  })
})
