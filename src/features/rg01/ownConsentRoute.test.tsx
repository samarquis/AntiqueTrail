import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnConsentPage } from './ownConsentRoute'
import type { OwnConsentAvailable, OwnConsentClient } from './ownConsentClient'

const ready = (consentState: OwnConsentAvailable['consentState'] = 'not_consented') => ({
  kind: 'available' as const,
  collectionActive: true as const,
  consentState,
  consentedAt: consentState === 'not_consented' ? null : '2026-09-07T12:00:00Z',
  withdrawnAt: consentState === 'withdrawn' ? '2026-09-07T12:05:00Z' : null,
})

function clientFor(
  initial: OwnConsentAvailable,
  write: (value: boolean) => Promise<void> = async () => undefined,
) {
  let current = initial
  return {
    getStatus: vi.fn(async () => current),
    setConsent: vi.fn(async (value: boolean) => {
      await write(value)
      current = ready(value ? 'consented' : 'withdrawn')
      return current
    }),
  } as unknown as OwnConsentClient
}

describe('RG-01 own consent route', () => {
  afterEach(cleanup)

  it('keeps opt-in unchecked, saves explicit consent, then confirms withdrawal', async () => {
    const user = userEvent.setup()
    const client = clientFor(ready())
    render(
      <MemoryRouter>
        <OwnConsentPage client={client} />
      </MemoryRouter>,
    )

    const checkbox = await screen.findByRole('checkbox', { name: /agree to participate/i })
    expect(checkbox).not.toBeChecked()
    expect(screen.getByRole('button', { name: /give consent/i })).toBeDisabled()
    await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: /give consent/i }))
    expect(await screen.findByText('Your consent is saved.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Your consent is saved.')

    await user.click(screen.getByRole('button', { name: /withdraw consent/i }))
    expect(screen.getByRole('heading', { name: /withdraw your consent/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^withdraw consent$/i }))
    expect(await screen.findByText('Your consent is withdrawn.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /agree to participate/i })).not.toBeChecked()
  })

  it('preserves confirmed consent and exposes Retry when a withdrawal fails', async () => {
    const user = userEvent.setup()
    const client = clientFor(ready('consented'), async () => {
      throw new Error('denied')
    })
    render(
      <MemoryRouter>
        <OwnConsentPage client={client} />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /withdraw consent/i }))
    await user.click(screen.getByRole('button', { name: /^withdraw consent$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no consent change was saved/i)
    expect(screen.getByRole('button', { name: /withdraw consent/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders generic denial without private fields when the server projection is unavailable', async () => {
    const client = {
      getStatus: vi.fn(async () => ({ kind: 'unavailable' as const, collectionActive: false })),
      setConsent: vi.fn(),
    } as unknown as OwnConsentClient
    render(
      <MemoryRouter>
        <OwnConsentPage client={client} />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /research participation unavailable/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/no consent change was saved/i)
    expect(screen.queryByText(/metrics|subject|sibling/i)).not.toBeInTheDocument()
  })
})
