import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import {
  AcceptTripInvitationPage,
  AddToTripPage,
  GoPage,
  InviteTripPartnerPage,
  NewTripPage,
  PlanPage,
  SummaryPage,
} from './components'
import { normalizeTripName } from './tripClient'
import type { Trip, TripClient } from './types'
import type { OfflineQueueSnapshot } from './types'
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
    addStoreStop: vi.fn(async () => trip),
    cloneCompleted: vi.fn(async () => ({ ...trip, id: 'trip-2' })),
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
    completeTrip: vi.fn(async () => ({ ...trip, state: 'completed' as const })),
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
  it('offers the explicit chooser and seeds a store into a newly created trip on success', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => trip)
    const addStoreStop = vi.fn(async () => ({
      ...trip,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer' as const,
          plannedDwellMinutes: 60,
          state: 'planned' as const,
        },
      ],
    }))
    render(
      <MemoryRouter initialEntries={['/trips/new?addStoreId=store-1']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/trips/new"
              element={<NewTripPage client={client({ addStoreStop, create })} />}
            />
            <Route path="/trips/:tripId/plan" element={<p>Trip seeded</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Add to Antique Day' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to stores' })).toHaveAttribute('href', '/stores')
    await user.type(screen.getByLabelText(/trip name/i), 'Saturday finds')
    await user.type(screen.getByLabelText(/date/i), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Create trip and add store' }))
    expect(await screen.findByRole('heading', { name: 'Added to Antique Day' })).toBeVisible()
    expect(create).toHaveBeenCalledWith({ name: 'Saturday finds', localDate: '2026-08-10' })
    expect(addStoreStop).toHaveBeenCalledWith('trip-1', 'store-1')
    expect(screen.getByRole('link', { name: 'View Trip' })).toHaveAttribute(
      'href',
      '/trips/trip-1/plan',
    )
    await user.click(screen.getByRole('link', { name: 'View Trip' }))
    expect(await screen.findByText('Trip seeded')).toBeInTheDocument()
  })

  it('adds a store to an eligible existing trip and can undo the addition', async () => {
    const user = userEvent.setup()
    const addStoreStop = vi.fn(async () => ({
      ...trip,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer' as const,
          plannedDwellMinutes: 60,
          state: 'planned' as const,
        },
      ],
    }))
    const removeStop = vi.fn(async () => trip)
    render(
      <MemoryRouter initialEntries={['/trips/new?addStoreId=store-1']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/trips/new"
              element={<NewTripPage client={client({ addStoreStop, removeStop })} />}
            />
            <Route path="/trips/:tripId/plan" element={<p>Trip seeded</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Add to Antique Day' }))
    expect(await screen.findByRole('heading', { name: 'Added to Antique Day' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The store was removed from Antique Day.',
    )
    expect(removeStop).toHaveBeenCalledWith('trip-1', 'stop-1', trip.version)
    expect(screen.getByRole('button', { name: 'Add to Antique Day' })).toBeVisible()
  })

  it('excludes full trips and trips that already contain the store, and explains why', async () => {
    const emptyTrip = { ...trip, name: 'Empty Day' }
    const alreadyTrip = {
      ...trip,
      id: 'trip-2',
      name: 'Already Trip',
      stops: [
        {
          id: 'stop-0',
          storeId: 'store-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer' as const,
          plannedDwellMinutes: 60,
          state: 'planned' as const,
        },
      ],
    }
    const fullTrip = {
      ...trip,
      id: 'trip-3',
      name: 'Full Trip',
      stops: Array.from({ length: 8 }, (_, index) => ({
        id: `stop-${index}`,
        storeId: `other-${index}`,
        kind: 'store' as const,
        label: `Store ${index}`,
        position: index,
        priority: 'prefer' as const,
        plannedDwellMinutes: 60,
        state: 'planned' as const,
      })),
    }
    const list = vi.fn(async () => [alreadyTrip, fullTrip, emptyTrip])
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ list })} />
      </AuthProvider>,
    )
    expect(await screen.findByText('This store is already on: Already Trip.')).toBeVisible()
    expect(screen.getByText('One trip is full and is not listed.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add to Already Trip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add to Full Trip' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to Empty Day' })).toBeVisible()
    expect(screen.getByText('2026-08-10 · 0 of 8 stops')).toBeVisible()
  })

  it('explains when no existing trip can receive the store', async () => {
    const list = vi.fn(async () => [])
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ list })} />
      </AuthProvider>,
    )
    expect(await screen.findByText('You have no trips yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create trip and add store' })).toBeVisible()
    expect(screen.queryByText('Antique Day')).not.toBeInTheDocument()
  })

  it('preserves the new-trip form and explains when creating the trip fails', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(trip)
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ create })} />
      </AuthProvider>,
    )
    await user.type(await screen.findByLabelText(/trip name/i), 'Saturday finds')
    await user.type(screen.getByLabelText(/date/i), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Create trip and add store' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't update this trip. Please try again.",
    )
    expect(screen.getByLabelText(/trip name/i)).toHaveValue('Saturday finds')
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-08-10')
  })

  it('reuses a created trip when adding the store must be retried', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => trip)
    const added = {
      ...trip,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer' as const,
          plannedDwellMinutes: 60,
          state: 'planned' as const,
        },
      ],
    }
    const addStoreStop = vi
      .fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(added)
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ addStoreStop, create })} />
      </AuthProvider>,
    )
    await user.type(await screen.findByLabelText(/trip name/i), 'Saturday finds')
    await user.type(screen.getByLabelText(/date/i), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Create trip and add store' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Antique Day was created, but the store was not added',
    )
    expect(screen.getByLabelText(/trip name/i)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry adding store' }))
    expect(await screen.findByRole('heading', { name: 'Added to Antique Day' })).toBeVisible()
    expect(create).toHaveBeenCalledTimes(1)
    expect(addStoreStop).toHaveBeenCalledTimes(2)
    expect(addStoreStop).toHaveBeenNthCalledWith(2, 'trip-1', 'store-1')
  })

  it('reconciles a lost add response without submitting the stop again', async () => {
    const user = userEvent.setup()
    const created = vi.fn(async () => trip)
    const committed = {
      ...trip,
      version: 2,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store' as const,
          label: 'Oak Antiques',
          position: 0,
          priority: 'prefer' as const,
          plannedDwellMinutes: 60,
          state: 'planned' as const,
        },
      ],
    }
    const addStoreStop = vi.fn(async () => {
      throw new Error('response lost')
    })
    const get = vi.fn(async () => committed)
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ addStoreStop, create: created, get })} />
      </AuthProvider>,
    )
    await user.type(await screen.findByLabelText(/trip name/i), 'Saturday finds')
    await user.type(screen.getByLabelText(/date/i), '2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Create trip and add store' }))
    expect(await screen.findByRole('heading', { name: 'Added to Antique Day' })).toBeVisible()
    expect(created).toHaveBeenCalledTimes(1)
    expect(addStoreStop).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('trip-1')
  })

  it('recovers from a list failure and guards against duplicate add clicks', async () => {
    const user = userEvent.setup()
    const list = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([trip])
    let settle!: (value: Trip) => void
    const pending = new Promise<Trip>((resolve) => {
      settle = resolve
    })
    const addStoreStop = vi.fn(async () => pending)
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" client={client({ addStoreStop, list })} />
      </AuthProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    const addButton = await screen.findByRole('button', { name: 'Add to Antique Day' })
    await user.click(addButton)
    expect(addButton).toBeDisabled()
    expect(screen.getByText('Adding to Antique Day…')).toBeVisible()
    await act(async () => {
      settle({
        ...trip,
        stops: [
          {
            id: 'stop-1',
            storeId: 'store-1',
            kind: 'store',
            label: 'Oak Antiques',
            position: 0,
            priority: 'prefer',
            plannedDwellMinutes: 60,
            state: 'planned',
          },
        ],
      })
      await pending
    })
    expect(await screen.findByRole('heading', { name: 'Added to Antique Day' })).toBeVisible()
  })

  it('routes Back through the same-origin returnTo boundary', async () => {
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" returnTo="/saved" client={client()} />
      </AuthProvider>,
    )
    expect(screen.getByRole('link', { name: 'Back to saved stores' })).toHaveAttribute(
      'href',
      '/saved',
    )
    cleanup()
    renderPage(
      <AuthProvider>
        <AddToTripPage storeId="store-1" returnTo="//evil.example" client={client()} />
      </AuthProvider>,
    )
    expect(screen.getByRole('link', { name: 'Back to stores' })).toHaveAttribute('href', '/stores')
  })

  it('saves a manual start before Go and requires explicit acknowledgement for hours warnings', async () => {
    const user = userEvent.setup()
    const reviewed: Trip = {
      ...trip,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 45,
          state: 'planned',
          hours: {
            state: 'stale',
            warning: 'Hours need verification for this trip date.',
          },
        },
        {
          id: 'stop-2',
          storeId: 'store-2',
          kind: 'store',
          label: 'Verified Vintage',
          position: 1,
          priority: 'prefer',
          plannedDwellMinutes: 60,
          state: 'planned',
          hours: { state: 'verified', opensAt: 600, closesAt: 1_020, closed: false },
        },
        {
          id: 'stop-3',
          storeId: 'store-3',
          kind: 'store',
          label: 'Unknown Finds',
          position: 2,
          priority: 'flexible',
          plannedDwellMinutes: 30,
          state: 'planned',
          hours: { state: 'unknown', warning: 'Hours unavailable for this trip date.' },
        },
        {
          id: 'stop-4',
          storeId: 'store-4',
          kind: 'store',
          label: 'Closed Today',
          position: 3,
          priority: 'prefer',
          plannedDwellMinutes: 30,
          state: 'planned',
          hours: {
            state: 'verified',
            closed: true,
            warning: 'Store is closed on this trip date.',
          },
        },
      ],
      hoursReview: {
        reviewedAt: '2026-08-05T12:00:00Z',
        hasUnresolvedWarnings: true,
        acknowledged: false,
      },
    }
    const setStart = vi.fn(async () => ({
      ...reviewed,
      startKind: 'manual' as const,
      startLabel: 'Home',
    }))
    const reviewHours = vi
      .fn<TripClient['reviewHours']>()
      .mockResolvedValueOnce(reviewed)
      .mockResolvedValueOnce({
        ...reviewed,
        state: 'ready',
        hoursReview: { ...reviewed.hoursReview!, acknowledged: true },
      })
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/trips/:tripId/plan"
              element={
                <PlanPage
                  client={client({ get: vi.fn(async () => reviewed), setStart, reviewHours })}
                />
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/manual starting place/i), 'Home')
    await user.type(screen.getByLabelText(/^start time$/i), '09:00')
    await user.click(screen.getByRole('button', { name: /save starting place/i }))
    expect(setStart).toHaveBeenCalledWith('trip-1', {
      kind: 'manual',
      label: 'Home',
      departureMinute: 540,
    })

    await user.click(screen.getByRole('button', { name: /^review hours$/i }))
    expect(await screen.findByText(/hours need verification/i)).toBeInTheDocument()
    expect(screen.getByText(/trip-date hours: 10:00 AM–5:00 PM/i)).toBeInTheDocument()
    expect(screen.getByText(/hours unavailable for this trip date/i)).toBeInTheDocument()
    expect(screen.getByText(/closed on this trip date/i)).toBeInTheDocument()
    expect(screen.getAllByText(/travel time is not included/i)).not.toHaveLength(0)
    expect(reviewHours).toHaveBeenNthCalledWith(1, 'trip-1', false)
    await user.click(screen.getByLabelText(/i understand these hours warnings/i))
    await user.click(screen.getByRole('button', { name: /acknowledge warnings/i }))
    expect(reviewHours).toHaveBeenNthCalledWith(2, 'trip-1', true)
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

  it('surfaces a replay conflict surfaced by getOfflineQueue and resolves it with the saved version', async () => {
    const user = userEvent.setup()
    const conflictSnapshot: OfflineQueueSnapshot = {
      state: 'conflict',
      pendingCount: 1,
      conflict: { id: 'plan_edit', summary: 'A queued action no longer applies.' },
    }
    const getOfflineQueue = vi
      .fn()
      .mockResolvedValueOnce({ state: 'empty' as const, pendingCount: 0 })
      .mockResolvedValueOnce(conflictSnapshot)
    const resolveOfflineConflict = vi.fn(async () => ({
      state: 'empty' as const,
      pendingCount: 0,
    }))
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <Routes>
          <Route
            path="/trips/:tripId/plan"
            element={
              <PlanPage
                client={client({
                  getOfflineQueue,
                  resolveOfflineConflict,
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /save a change offline/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/queued offline/i)
    await user.click(screen.getByRole('button', { name: /replay queued changes/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/a queued action no longer applies/i)
    expect(screen.getByRole('button', { name: /keep this phone's version/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /keep saved version/i }))
    expect(resolveOfflineConflict).toHaveBeenCalledWith('trip-1', 'saved')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
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

    expect(screen.getByRole('button', { name: /^rename trip$/i })).toHaveClass('button')
    expect(screen.getByRole('button', { name: /^bind this device$/i })).toHaveClass(
      'button--secondary',
    )
    expect(screen.getByRole('button', { name: /move oak antiques up/i })).toHaveClass(
      'button--secondary',
    )
    const remove = screen.getByRole('button', { name: /remove oak antiques/i })
    expect(remove).toHaveClass('button--danger')
    await user.click(remove)
    expect(
      screen.getByText('Removing Oak Antiques changes this trip plan immediately.'),
    ).toBeInTheDocument()
    expect(removeStop).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /keep oak antiques/i }))
    expect(removeStop).not.toHaveBeenCalled()
    expect(remove).toHaveFocus()

    await user.click(remove)
    await user.click(screen.getByRole('button', { name: /yes, remove oak antiques/i }))
    expect(removeStop).toHaveBeenCalledWith('trip-1', 'stop-a', 1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Oak Antiques was removed from this trip.',
    )
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

  it('lets a trip member save a private memory after a completed store stop', async () => {
    const user = userEvent.setup()
    const completedTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'completed',
        },
      ],
    }
    const saveVisitMemory = vi.fn(async () => completedTrip)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage
                client={client({
                  get: vi.fn(async () => completedTrip),
                  saveVisitMemory,
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
    await user.selectOptions(await screen.findByLabelText(/private rating for oak antiques/i), '5')
    await user.selectOptions(screen.getByLabelText(/return to oak antiques/i), 'yes')
    await user.type(screen.getByLabelText(/private note for oak antiques/i), 'Great lamps')
    await user.click(screen.getByRole('button', { name: /save private memory for oak antiques/i }))
    expect(saveVisitMemory).toHaveBeenCalledWith('trip-1', 'store-1', {
      rating: 5,
      returnChoice: 'yes',
      note: 'Great lamps',
    })
    expect(await screen.findByRole('status', { name: /oak antiques memory/i })).toHaveTextContent(
      /private memory saved/i,
    )
  })

  it('lets the Navigator undo a skipped stop', async () => {
    const user = userEvent.setup()
    const skippedTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'skipped',
        },
      ],
    }
    const restoredTrip = {
      ...skippedTrip,
      stops: skippedTrip.stops.map((stop) => ({ ...stop, state: 'planned' as const })),
    }
    const restoreStop = vi.fn(async () => restoredTrip)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage client={client({ get: vi.fn(async () => skippedTrip), restoreStop })} />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /undo skip for oak antiques/i }))
    expect(restoreStop).toHaveBeenCalledWith('trip-1', 'stop-1')
    expect(await screen.findByText(/oak antiques — planned/i)).toBeInTheDocument()
  })

  it.each([
    ['skipped', /undo skip for oak antiques/i],
    ['observed_closed', /restore stop/i],
  ] as const)(
    'queues %s restoration through the protected offline pathway',
    async (state, actionName) => {
      const user = userEvent.setup()
      const offlineTrip: Trip = {
        ...trip,
        state: 'active',
        stops: [
          {
            id: 'stop-1',
            storeId: 'store-1',
            kind: 'store',
            label: 'Oak Antiques',
            position: 0,
            priority: 'must',
            plannedDwellMinutes: 60,
            state,
          },
          {
            id: 'stop-2',
            storeId: 'store-2',
            kind: 'store',
            label: 'Pine Finds',
            position: 1,
            priority: 'prefer',
            plannedDwellMinutes: 45,
            state: 'planned',
          },
        ],
      }
      const queueMutation = vi.fn(async () => ({ state: 'queued' as const, pendingCount: 1 }))
      const runtime: TripOfflineRuntime = {
        installId: 'install-a',
        deviceKeyId: 'device-key-a',
        start: vi.fn(),
        recover: vi.fn(async () => ({ state: 'absent' as const })),
        queueMutation,
        prepareSignOut: vi.fn(async () => ({ requiresConfirmation: false, pendingCount: 0 })),
        purgeAccount: vi.fn(async () => undefined),
      }
      const restoreStop = vi.fn(async () => offlineTrip)
      render(
        <MemoryRouter initialEntries={['/trips/trip-1/go']}>
          <Routes>
            <Route
              path="/trips/:tripId/go"
              element={
                <GoPage
                  client={client({ get: vi.fn(async () => offlineTrip), restoreStop })}
                  offlineRuntime={runtime}
                  accountId="shopper-a"
                />
              }
            />
          </Routes>
        </MemoryRouter>,
      )
      await user.click(await screen.findByRole('button', { name: /work offline/i }))
      await user.click(screen.getByRole('button', { name: actionName }))
      expect(queueMutation).toHaveBeenCalledWith(
        'shopper-a',
        expect.objectContaining({
          stops: expect.arrayContaining([
            expect.objectContaining({ id: 'stop-1', state: 'planned' }),
          ]),
        }),
        { kind: 'restore_stop', stopId: 'stop-1' },
      )
      expect(restoreStop).not.toHaveBeenCalled()
    },
  )

  it('opens Summary automatically after the final stop is completed', async () => {
    const user = userEvent.setup()
    const activeTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'arrived',
        },
      ],
    }
    const finished = {
      ...activeTrip,
      stops: activeTrip.stops.map((stop) => ({ ...stop, state: 'completed' as const })),
    }
    const completed = { ...finished, state: 'completed' as const, durationMinutes: 60 }
    const completeTrip = vi.fn(async () => completed)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage
                client={client({
                  get: vi.fn(async () => activeTrip),
                  completeStop: vi.fn(async () => finished),
                  completeTrip,
                })}
              />
            }
          />
          <Route path="/trips/:tripId/summary" element={<p>Automatic summary</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /done/i }))
    expect(completeTrip).toHaveBeenCalledWith('trip-1')
    expect(await screen.findByText('Automatic summary')).toBeInTheDocument()
  })

  it('keeps terminal offline work pending until replay authoritatively completes the trip', async () => {
    const user = userEvent.setup()
    const activeTrip: Trip = {
      ...trip,
      state: 'active',
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'arrived',
        },
      ],
    }
    const terminal = {
      ...activeTrip,
      version: 2,
      stops: activeTrip.stops.map((stop) => ({ ...stop, state: 'completed' as const })),
    }
    const completed = { ...terminal, version: 3, state: 'completed' as const }
    const queueMutation = vi.fn(async () => ({ state: 'queued' as const, pendingCount: 1 }))
    const recordCompleted = vi.fn(async () => undefined)
    const runtime: TripOfflineRuntime = {
      installId: 'install-a',
      deviceKeyId: 'device-key-a',
      start: vi.fn(),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      queueMutation,
      replay: vi.fn(async () => ({
        state: 'empty' as const,
        pendingCount: 0 as const,
        trip: terminal,
      })),
      recordCompleted,
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: false, pendingCount: 0 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    const completeTrip = vi.fn(async () => completed)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/go']}>
        <Routes>
          <Route
            path="/trips/:tripId/go"
            element={
              <GoPage
                client={client({ get: vi.fn(async () => activeTrip), completeTrip })}
                offlineRuntime={runtime}
                accountId="shopper-a"
              />
            }
          />
          <Route path="/trips/:tripId/summary" element={<p>Completed offline summary</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /work offline/i }))
    await user.click(screen.getByRole('button', { name: /done/i }))
    expect(queueMutation).toHaveBeenCalled()
    expect(completeTrip).not.toHaveBeenCalled()
    expect(screen.queryByText('Completed offline summary')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reconnect and replay/i }))
    expect(await screen.findByText('Completed offline summary')).toBeInTheDocument()
    expect(completeTrip).toHaveBeenCalledWith('trip-1')
    expect(recordCompleted).toHaveBeenCalledWith('shopper-a', completed)
  })

  it('clones completed history into a new draft with Plan Again', async () => {
    const user = userEvent.setup()
    const completedTrip: Trip = {
      ...trip,
      state: 'completed',
      durationMinutes: 135,
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'completed',
          memoryStatus: 'saved',
        },
        {
          id: 'stop-2',
          storeId: 'store-2',
          kind: 'store',
          label: 'Pine Finds',
          position: 1,
          priority: 'prefer',
          plannedDwellMinutes: 45,
          state: 'skipped',
          memoryStatus: 'missing',
        },
        {
          id: 'stop-3',
          storeId: 'store-3',
          kind: 'store',
          label: 'Maple Market',
          position: 2,
          priority: 'flexible',
          plannedDwellMinutes: 30,
          state: 'observed_closed',
          memoryStatus: 'missing',
        },
      ],
    }
    const cloned = {
      ...completedTrip,
      id: 'trip-2',
      state: 'draft' as const,
      stops: completedTrip.stops.map((stop) => ({ ...stop, state: 'planned' as const })),
    }
    const cloneCompleted = vi.fn(async () => cloned)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/summary']}>
        <Routes>
          <Route
            path="/trips/:tripId/summary"
            element={
              <SummaryPage
                client={client({ get: vi.fn(async () => completedTrip), cloneCompleted })}
              />
            }
          />
          <Route path="/trips/:tripId/plan" element={<p>Cloned plan</p>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/visited: 1/i)).toBeInTheDocument()
    expect(screen.getByText(/skipped: 1/i)).toBeInTheDocument()
    expect(screen.getByText(/appeared closed: 1/i)).toBeInTheDocument()
    expect(screen.getByText(/duration: 2 hr 15 min/i)).toBeInTheDocument()
    expect(screen.getByText(/oak antiques: visited — private memory saved/i)).toBeInTheDocument()
    expect(screen.getByText(/pine finds: skipped — private memory missing/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /plan again/i }))
    expect(cloneCompleted).toHaveBeenCalledWith('trip-1')
    expect(await screen.findByText('Cloned plan')).toBeInTheDocument()
  })

  it('offers a private-memory action from completed immutable history when one is missing', async () => {
    const completedTrip: Trip = {
      ...trip,
      state: 'completed',
      stops: [
        {
          id: 'stop-1',
          storeId: 'store-1',
          kind: 'store',
          label: 'Oak Antiques',
          position: 0,
          priority: 'must',
          plannedDwellMinutes: 60,
          state: 'completed',
          memoryStatus: 'missing',
        },
      ],
    }
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/summary']}>
        <Routes>
          <Route
            path="/trips/:tripId/summary"
            element={
              <SummaryPage
                client={client({
                  get: vi.fn(async () => completedTrip),
                  saveVisitMemory: vi.fn(async () => ({
                    ...completedTrip,
                    stops: completedTrip.stops.map((stop) => ({
                      ...stop,
                      memoryStatus: 'saved' as const,
                    })),
                  })),
                })}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('button', { name: /save private memory for oak antiques/i }),
    ).toBeInTheDocument()
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
