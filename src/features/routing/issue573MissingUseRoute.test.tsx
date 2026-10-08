import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App'
import { InMemoryAuthStore } from '../auth'
import { ROUTING_BLOCKED_MESSAGE } from './boundary'
import { unavailableTripClient } from '../trips/tripClient'
import type { TripClient } from '../trips/types'

afterEach(cleanup)

describe('Check My Day route capability admission', () => {
  it('blocks route actions when the configured client lacks Use support', async () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    const requestCheckMyDay = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
    }))
    const getCheckMyDaySuggestion = vi.fn(async () => ({
      requestId: 'request-1',
      state: 'suggested' as const,
      tripVersion: 4,
    }))
    const client: TripClient = {
      ...unavailableTripClient,
      requestCheckMyDay,
      getCheckMyDaySuggestion,
      useCheckMyDaySuggestion: undefined,
    }

    render(
      <MemoryRouter initialEntries={['/trips/trip-1/check-my-day']}>
        <App runtime={{ authStore }} clients={{ trips: client }} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /check my day/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(ROUTING_BLOCKED_MESSAGE)
    expect(screen.queryByRole('button', { name: /suggested order/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(requestCheckMyDay).not.toHaveBeenCalled()
    expect(getCheckMyDaySuggestion).not.toHaveBeenCalled()
  })
})
