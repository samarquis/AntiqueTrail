import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createReviewHarness } from './harness'
import { ReviewHarnessBanner, ReviewHarnessPage } from './components'

describe('review harness screen', () => {
  afterEach(cleanup)

  it('exposes role, state, ordered paths, denial checks, and reset without secrets', async () => {
    const runtime = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/review?reviewAs=representative&reviewState=blocked',
    })
    render(
      <MemoryRouter initialEntries={['/review?reviewAs=representative&reviewState=blocked']}>
        <ReviewHarnessPage runtime={runtime!} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /human review harness/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/blocked by a required release gate/i)
    expect(screen.getByText('River · representative@local.invalid')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /store portal/i })).toHaveAttribute(
      'href',
      '/store-portal?reviewAs=representative&reviewState=blocked',
    )
    expect(screen.getByRole('button', { name: /reset review fixtures/i })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('local-review-only:')
  })

  it('renders compact local context without inheriting task-card styling', async () => {
    const runtime = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/stores?reviewAs=shopper-a&reviewState=success',
    })
    render(
      <MemoryRouter initialEntries={['/stores?reviewAs=shopper-a&reviewState=success']}>
        <ReviewHarnessBanner runtime={runtime!} />
      </MemoryRouter>,
    )
    const banner = screen.getByLabelText('Local review harness')
    expect(banner).toHaveTextContent('Shopper A · success · active session')
    expect(banner).not.toHaveClass('page-card')
    expect(screen.getByRole('link', { name: 'Switch or reset' })).toHaveAttribute(
      'href',
      '/review?reviewAs=shopper-a&reviewState=success',
    )
  })
})
