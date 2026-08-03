import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { NewTripPage, PlanPage } from './components'
import { normalizeTripName } from './tripClient'
import type { Trip, TripClient } from './types'

const trip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-08-10',
  state: 'draft',
  version: 1,
  stops: [],
}
function client(overrides: Partial<TripClient> = {}): TripClient {
  return {
    list: vi.fn(async () => [trip]),
    get: vi.fn(async () => trip),
    create: vi.fn(async () => trip),
    addStop: vi.fn(async (_id, input) => ({
      ...trip,
      stops: [{ id: 'stop-1', ...input, position: 0, state: 'planned' as const }],
    })),
    reorderStop: vi.fn(async () => trip),
    reviewHours: vi.fn(async (): Promise<Trip> => ({ ...trip, state: 'ready' })),
    start: vi.fn(async (): Promise<Trip> => ({ ...trip, state: 'active' })),
    markArrived: vi.fn(async (): Promise<Trip> => trip),
    completeStop: vi.fn(async () => trip),
    skipStop: vi.fn(async () => trip),
    replayOffline: vi.fn(async () => trip),
    ...overrides,
  }
}
function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

describe('manual trips', () => {
  afterEach(() => cleanup())
  it('normalizes bounded trip names and rejects empty names', () => {
    expect(normalizeTripName('  Oak\nDay  ')).toBe('Oak Day')
    expect(normalizeTripName('\u0000')).toBe('')
  })
  it('requires a date and creates a trip', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => trip)
    renderPage(
      <AuthProvider>
        <Routes>
          <Route path="*" element={<NewTripPage client={client({ create })} />} />
        </Routes>
      </AuthProvider>,
    )
    await user.type(screen.getByLabelText(/trip name/i), 'Saturday finds')
    await user.click(screen.getByRole('button', { name: /create trip/i }))
    expect(create).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/date/i), '2026-08-10')
    await user.click(screen.getByRole('button', { name: /create trip/i }))
    expect(create).toHaveBeenCalledWith({ name: 'Saturday finds', localDate: '2026-08-10' })
  })
  it('adds an ordered stop and keeps review hours travel-time neutral', async () => {
    const user = userEvent.setup()
    const addStop = vi.fn(async () => ({
      ...trip,
      stops: [
        {
          id: 'stop-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'must' as const,
          plannedDwellMinutes: 45,
          state: 'planned' as const,
        },
      ],
    }))
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <AuthProvider>
          <Routes>
            <Route path="/trips/:tripId/plan" element={<PlanPage client={client({ addStop })} />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/add stop/i), 'Oak Antiques')
    await user.click(screen.getByRole('button', { name: /^add stop$/i }))
    expect(addStop).toHaveBeenCalled()
    expect(screen.getByText(/travel time is not included/i)).toBeInTheDocument()
  })
})
