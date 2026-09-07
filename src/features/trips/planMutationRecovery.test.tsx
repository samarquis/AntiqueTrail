import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanPage } from './components'
import type { Trip, TripClient } from './types'

const trip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-08-10',
  state: 'draft',
  version: 1,
  stops: [
    {
      id: 'stop-1',
      kind: 'store',
      label: 'Oak Mall',
      position: 0,
      priority: 'prefer',
      plannedDwellMinutes: 30,
      state: 'planned',
    },
  ],
}

function client(overrides: Partial<TripClient>): TripClient {
  return {
    get: vi.fn(async () => trip),
    setStopPriority: vi.fn(async () => trip),
    list: vi.fn(async () => [trip]),
    create: vi.fn(async () => trip),
    cloneCompleted: vi.fn(async () => trip),
    addStop: vi.fn(async () => trip),
    addStoreStop: vi.fn(async () => trip),
    reorderStop: vi.fn(async () => trip),
    renameTrip: vi.fn(async () => ({ state: 'applied' as const, trip })),
    removeStop: vi.fn(async () => trip),
    setStopDwell: vi.fn(async () => trip),
    updateSchedule: vi.fn(async () => trip),
    bindNavigatorDevice: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    transferNavigatorDevice: vi.fn(async () => trip),
    getCollaboration: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    invitePartner: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    revokeInvitation: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    acceptInvitation: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    assignNavigator: vi.fn(async () => ({
      tripId: trip.id,
      currentUserId: 'user-1',
      participants: [],
    })),
    leaveTrip: vi.fn(async () => undefined),
    reviewHours: vi.fn(async () => trip),
    start: vi.fn(async () => trip),
    markArrived: vi.fn(async () => trip),
    completeStop: vi.fn(async () => trip),
    skipStop: vi.fn(async () => trip),
    replayOffline: vi.fn(async () => trip),
    getOfflineQueue: vi.fn(async () => ({ state: 'empty' as const, pendingCount: 0 })),
    queueOfflineAction: vi.fn(async () => ({ state: 'queued' as const, pendingCount: 1 })),
    resolveOfflineConflict: vi.fn(async () => ({ state: 'empty' as const, pendingCount: 0 })),
    purgeOffline: vi.fn(async () => ({ state: 'purged' as const, pendingCount: 0 })),
    ...overrides,
  }
}

describe('Plan mutation recovery', () => {
  afterEach(cleanup)

  it('keeps the loaded plan and retries a failed priority change', async () => {
    const user = userEvent.setup()
    const updated = {
      ...trip,
      version: 2,
      stops: [{ ...trip.stops[0], priority: 'must' as const }],
    }
    const setStopPriority = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(updated)
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/plan']}>
        <Routes>
          <Route
            path="/trips/:tripId/plan"
            element={<PlanPage client={client({ setStopPriority })} />}
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Antique Day' })).toBeVisible()
    await user.selectOptions(screen.getByLabelText(/priority for oak mall/i), 'must')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save the priority/i)
    expect(screen.getByRole('heading', { name: 'Antique Day' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText(/must, 30 minutes/i)
    expect(setStopPriority).toHaveBeenCalledTimes(2)
  })
})
