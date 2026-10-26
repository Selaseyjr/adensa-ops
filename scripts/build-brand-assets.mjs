#!/usr/bin/env node
// Generate every static brand asset from one geometry definition:
//   public/favicon.svg, favicon-16/32/512.png, apple-touch-icon.png,
//   favicon.ico, the day/night lockups in public/brand/ and the social
//   preview card public/og-image.png.
//
// Usage:  npm run brand:assets
//
// The geometry mirrors src/components/brand.tsx (the in-app logo).
// src/components/brand.test.ts fails if the two ever drift apart, so edit
// both together and re-run this script. Never hand-edit the outputs.
//
// PNG rasterising uses the Playwright Chromium already installed for the
// e2e suite; no image library is needed.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')

export const BRAND = { gold: '#D4A21E', navy: '#0E1B2C', ivory: '#F6F2EA' }
export const SUN = { cx: 320, cy: 278, r: 56, rayInner: 72, rayOuter: 100, rayWidth: 13 }
export const RAY_ANGLES = [30, 60, 90, 120, 150]
export const BARS = [
  { x: 204, y: 305, w: 232, h: 72, rx: 12 },
  { x: 152, y: 403, w: 336, h: 72, rx: 12 },
]

const r1 = (n) => Math.round(n * 100) / 100

export function markShapes(bar) {
  const { cx, cy, r } = SUN
  const rays = RAY_ANGLES.map((deg) => {
    const a = (deg * Math.PI) / 180
    const dx = Math.cos(a)
    const dy = -Math.sin(a)
    return `<line x1="${r1(cx + dx * SUN.rayInner)}" y1="${r1(cy + dy * SUN.rayInner)}" x2="${r1(cx + dx * SUN.rayOuter)}" y2="${r1(cy + dy * SUN.rayOuter)}" stroke="${BRAND.gold}" stroke-width="${SUN.rayWidth}" stroke-linecap="round"/>`
  })
  return [
    `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy} Z" fill="${BRAND.gold}"/>`,
    ...rays,
    ...BARS.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.rx}" fill="${bar}"/>`),
  ].join('\n  ')
}

/** App icon: navy tile, artwork centred with breathing room. */
export function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <title>Adensa</title>
  <rect width="640" height="640" rx="140" fill="${BRAND.navy}"/>
  <g transform="translate(320 326) scale(1.25) translate(-320 -322)">
  ${markShapes(BRAND.ivory)}
  </g>
</svg>
`
}

/** Horizontal lockup (mark + ADENSA + descriptor) for docs and print. */
export function lockupSvg(variant, descriptor = 'SUPPLY &amp; LOGISTICS') {
  const ink = variant === 'night' ? BRAND.ivory : BRAND.navy
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 150" width="500" height="150">
  <title>Adensa · ${variant === 'night' ? 'Night' : 'Day'} lockup</title>
  <g transform="translate(10 10) scale(0.394) translate(-140 -160)">
  ${markShapes(ink)}
  </g>
  <text x="170" y="80" font-family="Poppins, 'Segoe UI', Arial, sans-serif" font-weight="700" font-size="54" letter-spacing="7" fill="${ink}">ADENSA</text>
  <text x="172" y="108" font-family="Poppins, 'Segoe UI', Arial, sans-serif" font-weight="600" font-size="14" letter-spacing="5.6" fill="${variant === 'night' ? BRAND.gold : '#8A6A12'}">${descriptor}</text>
</svg>
`
}

/** Minimal ICO container holding PNG-encoded images (supported since Vista). */
function icoFromPngs(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach(({ size, png }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o)
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2)
    dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4)
    dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)])
}

async function rasterise(svg, size) {
  const { chromium } = await import('@playwright/test')
  // CHROMIUM_PATH lets a machine with a different Playwright build point at its browser.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
    )
    return await page.locator('svg').screenshot({ omitBackground: true })
  } finally {
    await browser.close()
  }
}

/** Social preview card (Open Graph / Twitter), 1200x630. */
export function ogHtml() {
  const font = (pkg, file) => join(root, 'node_modules', '@fontsource', pkg, 'files', file)
  return `<!doctype html><html><head><style>
  @font-face { font-family: Inter; font-weight: 500; src: url(file://${font('inter', 'inter-latin-500-normal.woff2')}); }
  @font-face { font-family: Inter; font-weight: 600; src: url(file://${font('inter', 'inter-latin-600-normal.woff2')}); }
  @font-face { font-family: Poppins; font-weight: 700; src: url(file://${font('poppins', 'poppins-latin-700-normal.woff2')}); }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: #0A1220; color: #F6F2EA; font-family: Inter, sans-serif; display: flex; align-items: center; }
  .wrap { padding: 0 96px; display: flex; flex-direction: column; gap: 28px; }
  .lockup { display: flex; align-items: center; gap: 22px; }
  .word { font-family: Poppins; font-weight: 700; font-size: 44px; letter-spacing: 0.14em; }
  .desc { font-family: Poppins; font-weight: 700; font-size: 13px; letter-spacing: 0.32em; color: ${BRAND.gold}; margin-top: 6px; }
  h1 { margin: 12px 0 0; font-weight: 600; font-size: 72px; letter-spacing: -0.03em; line-height: 1.02; }
  p { margin: 0; font-weight: 500; font-size: 26px; color: #9AA6B8; }
  .tag { display: inline-block; margin-top: 8px; padding: 10px 18px; border: 1px solid #1E2C43; border-radius: 999px; font-size: 20px; color: #C1CAD6; }
  </style></head><body><div class="wrap">
  <div class="lockup">
    <svg width="96" height="88" viewBox="140 160 360 330">${markShapes(BRAND.ivory)}</svg>
    <div><div class="word">ADENSA</div><div class="desc">SUPPLY &amp; LOGISTICS</div></div>
  </div>
  <h1>Your project.<br/>Our procurement.</h1>
  <p>AdensaOps · operations and procurement platform</p>
  <div><span class="tag">React · TypeScript · Cloudflare D1</span></div>
  </div></body></html>`
}

async function renderOg() {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    const tmp = join(root, 'node_modules', '.og-card.html')
    writeFileSync(tmp, ogHtml())
    await page.goto(`file://${tmp}`)
    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot({ type: 'png' })
  } finally {
    await browser.close()
  }
}

async function main() {
  const icon = iconSvg()
  writeFileSync(join(pub, 'favicon.svg'), icon)
  mkdirSync(join(pub, 'brand'), { recursive: true })
  writeFileSync(join(pub, 'brand', 'adensa-lockup-day.svg'), lockupSvg('day'))
  writeFileSync(join(pub, 'brand', 'adensa-lockup-night.svg'), lockupSvg('night'))

  const sizes = { 'favicon-16.png': 16, 'favicon-32.png': 32, 'apple-touch-icon.png': 180, 'favicon-512.png': 512 }
  const pngs = {}
  for (const [name, size] of Object.entries(sizes)) {
    pngs[size] = await rasterise(icon, size)
    writeFileSync(join(pub, name), pngs[size])
  }
  const png48 = await rasterise(icon, 48)
  writeFileSync(
    join(pub, 'favicon.ico'),
    icoFromPngs([
      { size: 16, png: pngs[16] },
      { size: 32, png: pngs[32] },
      { size: 48, png: png48 },
    ]),
  )
  writeFileSync(join(pub, 'og-image.png'), await renderOg())
  console.log('Brand assets written to public/.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
