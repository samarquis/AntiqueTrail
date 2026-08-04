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
  it('preserves the stable store identifier required for private visit memories', async () => {
    const wire = transport({
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
          state: 'completed',
        },
      ],
    })
    await expect(createTripApi(wire).get('trip-1')).resolves.toMatchObject({
      stops: [{ id: 'stop-1', storeId: 'store-1' }],
    })
  })

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

  it('clones completed history through one authoritative command', async () => {
    const wire = transport({ ...trip, id: 'trip-2' })
    await expect(createTripApi(wire).cloneCompleted('trip-1')).resolves.toMatchObject({
      id: 'trip-2',
    })
    expect(wire.invoke).toHaveBeenCalledWith('clone_completed_trip', { trip_id: 'trip-1' })
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

  it('sends the bounded offline mutation envelope to the authoritative replay command', async () => {
    const wire = transport({ state: 'unauthorized' })
    const api = createTripApi(wire)
    await expect(
      api.replayOfflineMutation?.({
        tripId: 'trip-1',
        idempotencyKey: 'device-a:1',
        baseVersion: 4,
        deviceId: 'device-a',
        localSequence: 1,
        kind: 'mark_arrived',
        stopId: 'stop-1',
      }),
    ).resolves.toEqual({ state: 'unauthorized' })
    expect(wire.invoke).toHaveBeenCalledWith('replay_trip_mutation', {
      trip_id: 'trip-1',
      envelope: {
        idempotency_key: 'device-a:1',
        base_version: 4,
        device_id: 'device-a',
        local_sequence: 1,
        kind: 'mark_arrived',
        stop_id: 'stop-1',
      },
    })
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

  it('uses the authoritative Check My Day request and suggestion commands', async () => {
    const wire = transport({ requestId: 'request-1', state: 'blocked', reason: 'r01_blocked' })
    const api = createTripApi(wire)
    await expect(api.requestCheckMyDay?.('trip-1')).resolves.toEqual({
      requestId: 'request-1',
      state: 'blocked',
      reason: 'r01_blocked',
    })
    await expect(api.getCheckMyDaySuggestion?.('request-1')).resolves.toEqual({
      requestId: 'request-1',
      state: 'blocked',
      reason: 'r01_blocked',
    })
    expect(wire.invoke.mock.calls).toEqual([
      ['request_check_my_day', { trip_id: 'trip-1' }],
      ['get_check_my_day_suggestion', { request_id: 'request-1' }],
    ])
  })

  it('covers private planning, observed-closed, completion, and visit memory commands', async () => {
    const wire = transport(trip)
    const api = createTripApi(wire)
    await api.setStart?.('trip-1', { kind: 'manual', label: 'Home', departureMinute: 540 })
    await api.setReturn?.('trip-1', { label: 'Home' })
    await api.setLimits?.('trip-1', { maxDriveMiles: 80, maxTotalMinutes: 600 })
    await api.addRestStop?.('trip-1', {
      label: 'Lunch',
      address: '123 Main St',
      priority: 'flexible',
      plannedDwellMinutes: 45,
    })
    await api.markObservedClosed?.('trip-1', 'stop-1')
    await api.restoreStop?.('trip-1', 'stop-1')
    await api.completeTrip?.('trip-1')
    await api.saveVisitMemory?.('trip-1', 'store-1', {
      rating: 5,
      returnChoice: 'yes',
      note: 'Great booths.',
    })
    expect(wire.invoke.mock.calls.map(([command]) => command)).toEqual([
      'set_trip_start',
      'set_trip_return',
      'set_trip_limits',
      'add_rest_stop',
      'mark_trip_stop_closed',
      'restore_trip_stop',
      'complete_trip',
      'save_trip_visit_memory',
    ])
  })

  it('exposes bounded versioned planning and stable-device commands', async () => {
    const wire = transport(trip)
    const api = createTripApi(wire, { installId: 'install-a', deviceKeyId: 'device-key-a' })
    await api.renameTrip('trip-1', '  Sunday\nTrail ', 4, 'rename-1')
    await api.removeStop('trip-1', 'stop-1', 5)
    await api.setStopPriority('trip-1', 'stop-1', 'must', 6)
    await api.setStopDwell('trip-1', 'stop-1', 45, 7)
    await api.updateSchedule('trip-1', { localDate: '2026-08-11', departureMinute: 540 }, 8)
    wire.invoke.mockResolvedValueOnce(collaboration)
    await api.bindNavigatorDevice('trip-1')
    wire.invoke.mockResolvedValueOnce({ trip, grant: { keyId: 'key-v1' } })
    await api.transferNavigatorDevice('trip-1')
    expect(wire.invoke.mock.calls).toEqual([
      [
        'rename_trip',
        {
          trip_id: 'trip-1',
          new_name: 'Sunday Trail',
          expected_version: 4,
          idempotency_key: 'rename-1',
        },
      ],
      ['remove_trip_stop', { trip_id: 'trip-1', stop_id: 'stop-1', expected_version: 5 }],
      [
        'set_trip_stop_priority',
        { trip_id: 'trip-1', stop_id: 'stop-1', priority: 'must', expected_version: 6 },
      ],
      [
        'set_trip_stop_dwell',
        { trip_id: 'trip-1', stop_id: 'stop-1', dwell_minutes: 45, expected_version: 7 },
      ],
      [
        'update_trip_schedule',
        { trip_id: 'trip-1', local_date: '2026-08-11', departure_minute: 540, expected_version: 8 },
      ],
      ['bind_navigator_device', { trip_id: 'trip-1', device_id: 'device-key-a' }],
      [
        'transfer_navigator_device',
        { trip_id: 'trip-1', install_id: 'install-a', device_key_id: 'device-key-a' },
      ],
    ])
  })

  it('unwraps the signed server envelope for fallback start', async () => {
    const wire = transport({ trip: { ...trip, state: 'active' }, grant: { keyId: 'key-v1' } })
    await expect(createTripApi(wire).start('trip-1')).resolves.toMatchObject({
      id: 'trip-1',
      state: 'active',
    })
  })

  it('preserves a typed rename conflict with only the latest shared name', async () => {
    const wire = transport({ state: 'conflict', latest: { name: 'Server Name', version: 7 } })
    await expect(
      createTripApi(wire).renameTrip('trip-1', 'My Name', 4, 'rename-1'),
    ).resolves.toEqual({ state: 'conflict', latest: { name: 'Server Name', version: 7 } })
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
