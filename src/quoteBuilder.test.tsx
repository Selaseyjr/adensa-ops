import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { demo } from './data/demo'
import { QuoteBuilderPage } from './quoteBuilder'
import type { Quote } from './types'

function renderBuilder(onCreateQuote = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/quotes?new=1']}>
      <QuoteBuilderPage
        data={demo}
        mode="demo"
        onNavigate={() => {}}
        onViewOrder={() => {}}
        onCreateQuote={onCreateQuote}
        onSetStatus={() => {}}
      />
    </MemoryRouter>,
  )
  return { onCreateQuote, dialog: screen.getByRole('dialog', { name: 'New quote' }) }
}

describe('quote builder', () => {
  it('fills cost from the catalogue, adds transport, and splits 70% deposit / balance', async () => {
    const user = userEvent.setup()
    const { onCreateQuote, dialog } = renderBuilder()
    const d = within(dialog)

    await user.selectOptions(d.getByLabelText('Customer'), 'd-cus-002') // Adom Estates: not established
    await user.selectOptions(d.getByLabelText('Line 1 catalogue product'), 'd-prd-001')
    const qty = d.getByLabelText(/^Qty/)
    await user.clear(qty)
    await user.type(qty, '100')

    // Best delivered for 100 bags is Coastal Cement Depot: 104 + 90 per load.
    expect(d.getByLabelText('Our cost per unit')).toHaveValue('104')
    expect(d.getByText(/Best delivered: Coastal Cement Depot/)).toBeInTheDocument()
    expect(d.getByLabelText('Transport charge for Coastal Cement Depot')).toHaveValue('90')

    await user.type(d.getByLabelText('Sell price per unit'), '120')
    // 100 x 120 + 90 transport = 12,090; cost 10,400 + 90 = 10,490.
    expect(d.getByText('GH¢12,090')).toBeInTheDocument()
    expect(d.getByText('GH¢10,490')).toBeInTheDocument()
    expect(d.getByText('Deposit to confirm (70%)')).toBeInTheDocument()
    expect(d.getByText('GH¢8,470')).toBeInTheDocument()
    expect(d.getByText('GH¢3,620')).toBeInTheDocument()

    await user.click(d.getByRole('button', { name: 'Save quote' }))
    const quote = onCreateQuote.mock.calls[0][0] as Quote
    expect(quote.valueGhs).toBe(12_090)
    expect(quote.depositRate).toBe(0.7)
    expect(quote.lines).toEqual([
      expect.objectContaining({ productId: 'd-prd-001', supplierId: 'd-sup-003', qty: 100, unitCostGhs: 104, unitPriceGhs: 120 }),
      expect.objectContaining({ transport: true, qty: 1, unitCostGhs: 90, unitPriceGhs: 90 }),
    ])
  })

  it('warns instead of auto-filling a stale supplier price', async () => {
    const user = userEvent.setup()
    const { dialog } = renderBuilder()
    const d = within(dialog)
    await user.selectOptions(d.getByLabelText('Line 1 catalogue product'), 'd-prd-006')
    expect(d.getByText(/Stale price/)).toBeInTheDocument()
    expect(d.getByLabelText('Our cost per unit')).toHaveValue('')
  })
})
