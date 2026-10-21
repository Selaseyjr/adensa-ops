// One-shot: render print/invoice-form.html to a print-ready A4 PDF.
// Usage: node scripts/build-invoice-pdf.mjs
import { chromium } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const src = resolve('print/invoice-form.html')
const out = resolve('print/ADENSA-Invoice-FillIn-Print.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(pathToFileURL(src).href)
await page.evaluate(() => document.fonts.ready)
await page.pdf({
  path: out,
  printBackground: true,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
  preferCSSPageSize: true, // honour @page { size: A4; margin: 0 }
})
await browser.close()
console.log(`PDF written: ${out}`)
