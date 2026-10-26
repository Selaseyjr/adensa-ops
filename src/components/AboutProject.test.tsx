import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ABOUT_SEEN_KEY, AboutProjectDialog, AppFooter, CASE_STUDY_URL, GITHUB_URL, hasSeenAbout } from './AboutProject'

describe('About this project', () => {
  it('walks four steps and remembers that it was seen', async () => {
    localStorage.removeItem(ABOUT_SEEN_KEY)
    expect(hasSeenAbout()).toBe(false)
    const onClose = vi.fn()
    render(<AboutProjectDialog open onClose={onClose} />)
    expect(screen.getByText('1 of 4', { exact: false })).toBeInTheDocument()
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Demo and Real data')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open the dashboard' }))
    expect(onClose).toHaveBeenCalled()
    expect(hasSeenAbout()).toBe(true)
  })

  it('footer credits the author and links GitHub and the case study', () => {
    render(<AppFooter onAbout={() => {}} />)
    expect(screen.getByText('Selasey Gbeddy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', GITHUB_URL)
    expect(screen.getByRole('link', { name: 'Case study' })).toHaveAttribute('href', CASE_STUDY_URL)
  })

  it('uses no em or en dashes in its copy', () => {
    const { container } = render(<AboutProjectDialog open onClose={() => {}} />)
    expect(document.body.textContent).not.toMatch(/[\u2013\u2014]/)
    container.remove()
  })
})
