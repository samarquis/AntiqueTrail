import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import {
  AcceptTripInvitationPage,
  GoPage,
  InviteTripPartnerPage,
  NewTripPage,
  PlanPage,
} from './components'
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
    getOfflineQueue: vi.fn(async () => ({ state: 'empty' as const, pendingCount: 0 })),
    queueOfflineAction: vi.fn(async () => ({ state: 'queued' as const, pendingCount: 1 })),
    resolveOfflineConflict: vi.fn(async () => ({ state: 'empty' as const, pendingCount: 0 })),
    purgeOffline: vi.fn(async () => ({ state: 'purged' as const, pendingCount: 0 })),
    getCollaboration: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
      ],
      navigatorUserId: 'creator-a',
    })),
    invitePartner: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
      ],
      navigatorUserId: 'creator-a',
      invitation: { id: 'invite-1', state: 'pending' as const, expiresAt: '2026-08-10T00:00:00Z' },
    })),
    revokeInvitation: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
      ],
      navigatorUserId: 'creator-a',
    })),
    acceptInvitation: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'partner-b',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
        { userId: 'partner-b', displayName: 'Trip partner', role: 'partner' as const },
      ],
      navigatorUserId: 'creator-a',
    })),
    assignNavigator: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
        { userId: 'partner-b', displayName: 'Trip partner', role: 'partner' as const },
      ],
      navigatorUserId: 'partner-b',
    })),
    leaveTrip: vi.fn(async () => undefined),
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

  it('provides keyboard-accessible move controls and queues offline changes as state', async () => {
    const user = userEvent.setup()
    const orderedTrip: Trip = {
      ...trip,
      stops: [
        {
          id: 'stop-a',
          kind: 'store',
          label: 'A',
          position: 0,
          priority: 'prefer',
          plannedDwellMinutes: 60,
          state: 'planned',
        },
        {
          id: 'stop-b',
          kind: 'store',
          label: 'B',
          position: 1,
          priority: 'prefer',
          plannedDwellMinutes: 60,
          state: 'planned',
        },
      ],
    }
    const reorderStop = vi.fn(async () => orderedTrip)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <Routes>
          <Route
            path="/trips/:tripId/plan"
            element={
              <PlanPage client={client({ get: vi.fn(async () => orderedTrip), reorderStop })} />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /move b up/i }))
    expect(reorderStop).toHaveBeenCalledWith('trip-1', 'stop-b', 0)
    await user.click(screen.getByRole('button', { name: /save a change offline/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/queued offline/i)
  })

  it('offers explicit one-stop Google Maps and Waze handoff links', async () => {
    const handoffTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          kind: 'store',
          label: 'Oak Antiques',
          address: '123 Main St, Topeka KS',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'planned',
        },
      ],
    }
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={<GoPage client={client({ get: vi.fn(async () => handoffTrip) })} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    const google = await screen.findByRole('link', { name: /open in google maps/i })
    const waze = screen.getByRole('link', { name: /open in waze/i })
    expect(google).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent(handoffTrip.stops[0].address!)),
    )
    expect(waze).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent(handoffTrip.stops[0].address!)),
    )
    expect(google).toHaveAttribute('target', '_blank')
    expect(waze).toHaveAttribute('target', '_blank')
  })

  it('keeps the accepted Trip Partner read-only in Go when the creator is Navigator', async () => {
    const handoffTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'planned',
        },
      ],
    }
    const markArrived = vi.fn(async () => handoffTrip)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage
                client={client({
                  get: vi.fn(async () => handoffTrip),
                  markArrived,
                  getCollaboration: vi.fn(async () => ({
                    tripId: trip.id,
                    currentUserId: 'partner-b',
                    participants: [
                      {
                        userId: 'creator-a',
                        displayName: 'Trip creator',
                        role: 'creator' as const,
                      },
                      {
                        userId: 'partner-b',
                        displayName: 'Trip partner',
                        role: 'partner' as const,
                      },
                    ],
                    navigatorUserId: 'creator-a',
                  })),
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/read-only progress/i)).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('button', { name: /arrived/i })).not.toBeInTheDocument()
    expect(markArrived).not.toHaveBeenCalled()
  })

  it('invites one verified-email partner and assigns exactly one Navigator', async () => {
    const user = userEvent.setup()
    const collaboration = {
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
        { userId: 'partner-b', displayName: 'Trip partner', role: 'partner' as const },
      ],
      navigatorUserId: 'creator-a',
    }
    const creatorOnly = {
      ...collaboration,
      participants: collaboration.participants.slice(0, 1),
    }
    const invitePartner = vi.fn(async () => collaboration)
    const assignNavigator = vi.fn(async () => ({ ...collaboration, navigatorUserId: 'partner-b' }))
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/invite']}>
        <Routes>
          <Route
            path="/trips/:tripId/invite"
            element={
              <InviteTripPartnerPage
                client={client({
                  getCollaboration: vi.fn(async () => creatorOnly),
                  invitePartner,
                  assignNavigator,
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(await screen.findByLabelText(/partner verified email/i), 'Partner@Example.com ')
    await user.click(screen.getByRole('button', { name: /send invitation/i }))
    expect(invitePartner).toHaveBeenCalledWith('trip-1', 'partner@example.com')
    await user.click(screen.getByRole('button', { name: /make trip partner navigator/i }))
    expect(assignNavigator).toHaveBeenCalledWith('trip-1', 'partner-b')
    expect(await screen.findByText(/trip partner is navigator/i)).toBeInTheDocument()
  })

  it('accepts a fragment invitation into only the returned trip', async () => {
    const acceptInvitation = vi.fn(async () => ({
      tripId: 'trip-1',
      currentUserId: 'partner-b',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
        { userId: 'partner-b', displayName: 'Trip partner', role: 'partner' as const },
      ],
      navigatorUserId: 'creator-a',
    }))
    render(
      <MemoryRouter initialEntries={['/trip-invitations#token=opaque-secret']}>
        <Routes>
          <Route
            path="/trip-invitations"
            element={<AcceptTripInvitationPage client={client({ acceptInvitation })} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /trip invitation accepted/i }),
    ).toBeInTheDocument()
    expect(acceptInvitation).toHaveBeenCalledWith('opaque-secret')
    expect(screen.getByRole('link', { name: /open shared trip/i })).toHaveAttribute(
      'href',
      '/trips/trip-1/plan',
    )
  })
})
