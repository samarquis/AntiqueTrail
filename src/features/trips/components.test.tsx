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
import type { TripOfflineGrantSource, TripOfflineRuntime } from './tripRuntime'

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
    renameTrip: vi.fn(async () => ({ state: 'applied' as const, trip })),
    removeStop: vi.fn(async () => trip),
    setStopPriority: vi.fn(async () => trip),
    setStopDwell: vi.fn(async () => trip),
    updateSchedule: vi.fn(async () => trip),
    bindNavigatorDevice: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
      ],
      navigatorUserId: 'creator-a',
    })),
    transferNavigatorDevice: vi.fn(async () => trip),
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

  it('provides usable versioned planning and Navigator device controls', async () => {
    const user = userEvent.setup()
    const planned: Trip = {
      ...trip,
      stops: [
        {
          id: 'stop-a',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer',
          plannedDwellMinutes: 60,
          state: 'planned',
        },
      ],
    }
    const renameTrip = vi.fn(async () => ({ state: 'applied' as const, trip: planned }))
    const updateSchedule = vi.fn(async () => planned)
    const setStopPriority = vi.fn(async () => planned)
    const setStopDwell = vi.fn(async () => planned)
    const removeStop = vi.fn(async () => ({ ...planned, stops: [] }))
    const bindNavigatorDevice = vi.fn(async () => ({
      tripId: planned.id,
      currentUserId: 'creator-a',
      participants: [
        { userId: 'creator-a', displayName: 'Trip creator', role: 'creator' as const },
      ],
      navigatorUserId: 'creator-a',
    }))
    const transferNavigatorDevice = vi.fn(async () => planned)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <Routes>
          <Route
            path="/trips/:tripId/plan"
            element={
              <PlanPage
                client={client({
                  get: vi.fn(async () => planned),
                  renameTrip,
                  updateSchedule,
                  setStopPriority,
                  setStopDwell,
                  removeStop,
                  bindNavigatorDevice,
                  transferNavigatorDevice,
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    const name = await screen.findByLabelText(/^trip name$/i)
    await user.clear(name)
    await user.type(name, 'Sunday Trail')
    await user.click(screen.getByRole('button', { name: /rename trip/i }))
    expect(renameTrip).toHaveBeenCalledWith('trip-1', 'Sunday Trail', 1, expect.any(String))

    await user.clear(screen.getByLabelText(/^trip date$/i))
    await user.type(screen.getByLabelText(/^trip date$/i), '2026-08-11')
    await user.type(screen.getByLabelText(/departure time/i), '09:00')
    await user.click(screen.getByRole('button', { name: /update schedule/i }))
    expect(updateSchedule).toHaveBeenCalledWith(
      'trip-1',
      { localDate: '2026-08-11', departureMinute: 540 },
      1,
    )

    await user.selectOptions(screen.getByLabelText(/priority for oak antiques/i), 'must')
    expect(setStopPriority).toHaveBeenCalledWith('trip-1', 'stop-a', 'must', 1)
    const dwellInput = screen.getByLabelText(/dwell minutes for oak antiques/i)
    await user.clear(dwellInput)
    await user.type(dwellInput, '45')
    await user.tab()
    expect(setStopDwell).toHaveBeenCalledWith('trip-1', 'stop-a', 45, 1)
    await user.click(screen.getByRole('button', { name: /remove oak antiques/i }))
    expect(removeStop).toHaveBeenCalledWith('trip-1', 'stop-a', 1)
    await user.click(screen.getByRole('button', { name: /bind this device/i }))
    expect(bindNavigatorDevice).toHaveBeenCalledWith('trip-1')
    await user.click(screen.getByRole('button', { name: /transfer navigator/i }))
    expect(transferNavigatorDevice).toHaveBeenCalledWith('trip-1')
  })

  it('offers Reapply and Keep Latest for typed rename conflicts', async () => {
    const user = userEvent.setup()
    const renameTrip = vi
      .fn()
      .mockResolvedValueOnce({
        state: 'conflict',
        latest: { name: 'Server Name', version: 7 },
      })
      .mockResolvedValueOnce({
        state: 'conflict',
        latest: { name: 'Newer Server Name', version: 8 },
      })
      .mockResolvedValueOnce({
        state: 'applied',
        trip: { ...trip, name: 'My Reapplied Name', version: 9 },
      })
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <Routes>
          <Route
            path="/trips/:tripId/plan"
            element={<PlanPage client={client({ renameTrip })} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    const input = await screen.findByLabelText(/^trip name$/i)
    await user.clear(input)
    await user.type(input, 'Discarded Name')
    await user.click(screen.getByRole('button', { name: /rename trip/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server Name')
    await user.click(screen.getByRole('button', { name: /keep latest name/i }))
    expect(input).toHaveValue('Server Name')

    await user.clear(input)
    await user.type(input, 'My Reapplied Name')
    await user.click(screen.getByRole('button', { name: /rename trip/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Newer Server Name')
    await user.click(screen.getByRole('button', { name: /reapply my name/i }))
    expect(renameTrip).toHaveBeenLastCalledWith(
      'trip-1',
      'My Reapplied Name',
      8,
      expect.any(String),
    )
    expect(await screen.findByLabelText(/^trip name$/i)).toHaveValue('My Reapplied Name')
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

  it('starts Go through the verified offline-grant runtime when it is wired', async () => {
    const user = userEvent.setup()
    const startedTrip = { ...trip, state: 'active' as const }
    const remoteStart = vi.fn(async () => startedTrip)
    const runtime: TripOfflineRuntime = {
      installId: 'install-a',
      deviceKeyId: 'device-key-a',
      start: vi.fn(async () => startedTrip),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: false, pendingCount: 0 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    const source = {} as TripOfflineGrantSource
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage
                client={client({ get: vi.fn(async () => trip), start: remoteStart })}
                offlineRuntime={runtime}
                offlineGrantSource={source}
                accountId="shopper-a"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /start trip/i }))
    expect(runtime.start).toHaveBeenCalledWith('shopper-a', 'trip-1', source)
    expect(remoteStart).not.toHaveBeenCalled()
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
