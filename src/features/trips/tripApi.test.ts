import { describe, expect, it, vi } from 'vitest'
import { GENERIC_TRIP_ERROR } from './tripClient'
import { createTripApi, type TripApiCommand, type TripTransport } from './tripApi'
import type { OfflineQueueSnapshot, Trip, TripCollaboration } from './types'

const trip: Trip = {
  id: 'trip-1',
  name: 'Antique Day',
  localDate: '2026-08-10',
  state: 'draft',
  version: 1,
  stops: [],
}
const collaboration: TripCollaboration = {
  tripId: trip.id,
  currentUserId: 'creator-a',
  participants: [{ userId: 'creator-a', displayName: 'Trip creator', role: 'creator' }],
  navigatorUserId: 'creator-a',
}
const queue: OfflineQueueSnapshot = { state: 'queued', pendingCount: 1 }

function transport(result: unknown): TripTransport & { invoke: ReturnType<typeof vi.fn> } {
  return {
    invoke: vi.fn(async (_command: TripApiCommand, _payload: Readonly<Record<string, unknown>>) => {
      void _command
      void _payload
      return result
    }),
  }
}

describe('implicit-actor TripClient transport', () => {
  it('normalizes bounded create input and sends no caller-supplied actor identity', async () => {
    const wire = transport(trip)
    const api = createTripApi(wire)
    await expect(api.create({ name: '  Antique\nDay ', localDate: '2026-08-10' })).resolves.toEqual(
      trip,
    )
    expect(wire.invoke).toHaveBeenCalledWith('create_trip', {
      name: 'Antique Day',
      local_date: '2026-08-10',
    })
    expect(JSON.stringify(wire.invoke.mock.calls[0][1])).not.toMatch(/actor|owner|current_user/i)
  })

  it('covers planning and Go commands using resource identifiers only', async () => {
    const wire = transport(trip)
    const api = createTripApi(wire)
    await api.addStop('trip-1', {
      kind: 'store',
      label: ' Oak Antiques ',
      priority: 'must',
      plannedDwellMinutes: 45,
    })
    await api.reorderStop('trip-1', 'stop-1', 0)
    await api.reviewHours('trip-1')
    await api.start('trip-1')
    await api.markArrived('trip-1', 'stop-1')
    await api.completeStop('trip-1', 'stop-1')
    await api.skipStop('trip-1', 'stop-1')

    expect(wire.invoke.mock.calls).toEqual([
      [
        'add_trip_stop',
        {
          trip_id: 'trip-1',
          kind: 'store',
          label: 'Oak Antiques',
          priority: 'must',
          planned_dwell_minutes: 45,
        },
      ],
      ['reorder_trip_stop', { trip_id: 'trip-1', stop_id: 'stop-1', position: 0 }],
      ['review_trip_hours', { trip_id: 'trip-1' }],
      ['start_trip', { trip_id: 'trip-1' }],
      ['mark_arrived', { trip_id: 'trip-1', stop_id: 'stop-1' }],
      ['complete_trip_stop', { trip_id: 'trip-1', stop_id: 'stop-1' }],
      ['skip_trip_stop', { trip_id: 'trip-1', stop_id: 'stop-1' }],
    ])
  })

  it('covers offline operations without adding an actor or accepting arbitrary action shapes', async () => {
    const wire = transport(queue)
    const api = createTripApi(wire)
    await expect(api.getOfflineQueue('trip-1')).resolves.toEqual(queue)
    await api.queueOfflineAction('trip-1', { kind: 'go_action', stopId: 'stop-1' })
    await api.resolveOfflineConflict('trip-1', 'phone')
    await api.purgeOffline('trip-1', 'confirmed_logout')

    expect(wire.invoke.mock.calls).toEqual([
      ['get_offline_trip_queue', { trip_id: 'trip-1' }],
      [
        'queue_offline_trip_action',
        { trip_id: 'trip-1', action: { kind: 'go_action', stop_id: 'stop-1' } },
      ],
      ['resolve_trip_conflict', { trip_id: 'trip-1', choice: 'phone' }],
      ['purge_offline_trip', { trip_id: 'trip-1', reason: 'confirmed_logout' }],
    ])
  })

  it('covers one-trip invitation and Navigator operations with an implicit current actor', async () => {
    const wire = transport(collaboration)
    const api = createTripApi(wire)
    await api.getCollaboration('trip-1')
    await api.invitePartner('trip-1', ' Partner@Example.com ')
    await api.revokeInvitation('trip-1', 'invite-1')
    await api.acceptInvitation('opaque-fragment-token')
    await api.assignNavigator('trip-1', 'partner-b')
    await api.leaveTrip('trip-1')

    expect(wire.invoke.mock.calls).toEqual([
      ['get_trip_collaboration', { trip_id: 'trip-1' }],
      ['invite_trip_partner', { trip_id: 'trip-1', verified_email: 'partner@example.com' }],
      ['revoke_trip_invitation', { trip_id: 'trip-1', invitation_id: 'invite-1' }],
      ['accept_trip_invitation', { fragment_token: 'opaque-fragment-token' }],
      ['assign_navigator', { trip_id: 'trip-1', participant_id: 'partner-b' }],
      ['leave_trip', { trip_id: 'trip-1' }],
    ])
    for (const [, payload] of wire.invoke.mock.calls) expect(payload).not.toHaveProperty('actor_id')
  })

  it('normalizes transport, malformed-response, and local-validation failures reason-neutrally', async () => {
    const denied: TripTransport = {
      async invoke() {
        throw new Error('user is not navigator for trip-1')
      },
    }
    await expect(createTripApi(denied).get('trip-1')).rejects.toThrow(GENERIC_TRIP_ERROR)
    await expect(
      createTripApi(transport({ secret: 'wrong account' })).get('trip-1'),
    ).rejects.toThrow(GENERIC_TRIP_ERROR)
    const wire = transport(trip)
    await expect(
      createTripApi(wire).queueOfflineAction('trip-1', { kind: '../arbitrary action' }),
    ).rejects.toThrow(GENERIC_TRIP_ERROR)
    expect(wire.invoke).not.toHaveBeenCalled()
  })
})
