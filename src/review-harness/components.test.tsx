import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { createReviewHarness } from './harness'
import { ReviewHarnessPage } from './components'

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
})
