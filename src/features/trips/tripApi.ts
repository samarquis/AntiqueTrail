import {
  GENERIC_TRIP_ERROR,
  normalizeTripName,
  normalizeTripPartnerEmail,
  validDwellMinutes,
} from './tripClient'
import type {
  OfflineQueueSnapshot,
  Trip,
  TripClient,
  TripCollaboration,
  TripInvitation,
  TripParticipant,
  TripStop,
  TripMutationReplayResult,
  TripRenameResult,
  CheckMyDayServerResult,
} from './types'

export type TripApiCommand =
  | 'list_trips'
  | 'get_trip'
  | 'create_trip'
  | 'add_trip_stop'
  | 'reorder_trip_stop'
  | 'rename_trip'
  | 'remove_trip_stop'
  | 'set_trip_stop_priority'
  | 'set_trip_stop_dwell'
  | 'update_trip_schedule'
  | 'bind_navigator_device'
  | 'transfer_navigator_device'
  | 'review_trip_hours'
  | 'start_trip'
  | 'mark_arrived'
  | 'complete_trip_stop'
  | 'skip_trip_stop'
  | 'set_trip_start'
  | 'set_trip_return'
  | 'set_trip_limits'
  | 'add_rest_stop'
  | 'mark_trip_stop_closed'
  | 'restore_trip_stop'
  | 'complete_trip'
  | 'save_trip_visit_memory'
  | 'replay_trip_mutations'
  | 'replay_trip_mutation'
  | 'get_offline_trip_queue'
  | 'queue_offline_trip_action'
  | 'resolve_trip_conflict'
  | 'purge_offline_trip'
  | 'get_trip_collaboration'
  | 'invite_trip_partner'
  | 'revoke_trip_invitation'
  | 'accept_trip_invitation'
  | 'assign_navigator'
  | 'leave_trip'
  | 'save_check_my_day_choice'
  | 'request_check_my_day'
  | 'get_check_my_day_suggestion'

/** The transport derives the current actor from its authenticated session. */
export interface TripTransport {
  invoke(command: TripApiCommand, payload: Readonly<Record<string, unknown>>): Promise<unknown>
}

export interface TripDeviceIdentity {
  installId: string
  deviceKeyId: string
}

type Parser<T> = (value: unknown) => T

const TRIP_STATES = new Set(['draft', 'ready', 'active', 'completed', 'cancelled'])
const STOP_STATES = new Set(['planned', 'arrived', 'completed', 'skipped', 'observed_closed'])
const PRIORITIES = new Set(['must', 'prefer', 'flexible'])
const QUEUE_STATES = new Set(['empty', 'queued', 'replaying', 'conflict', 'purged', 'blocked'])

function genericFailure(): Error {
  return new Error(GENERIC_TRIP_ERROR)
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw genericFailure()
  return value as Record<string, unknown>
}

function string(value: unknown, maximum = 2_000): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum)
    throw genericFailure()
  return value
}

function optionalString(value: unknown, maximum = 2_000): string | undefined {
  return value == null ? undefined : string(value, maximum)
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum)
    throw genericFailure()
  return Number(value)
}

function finite(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    throw genericFailure()
  return value
}

function parseCoordinate(value: unknown): { latitude: number; longitude: number } | undefined {
  if (value == null) return undefined
  const source = record(value)
  return {
    latitude: finite(source.latitude, -90, 90),
    longitude: finite(source.longitude, -180, 180),
  }
}

function enumValue<T extends string>(value: unknown, allowed: Set<string>): T {
  const parsed = string(value, 64)
  if (!allowed.has(parsed)) throw genericFailure()
  return parsed as T
}

function parseStop(value: unknown): TripStop {
  const source = record(value)
  return {
    id: string(source.id, 128),
    storeId: source.storeId == null ? undefined : string(source.storeId, 128),
    kind: enumValue<TripStop['kind']>(source.kind, new Set(['store', 'rest'])),
    label: string(source.label, 160),
    address: optionalString(source.address, 500),
    position: integer(source.position, 0, 7),
    priority: enumValue<TripStop['priority']>(source.priority, PRIORITIES),
    plannedDwellMinutes: integer(source.plannedDwellMinutes, 5, 720),
    state: enumValue<TripStop['state']>(source.state, STOP_STATES),
    coordinate: parseCoordinate(source.coordinate),
  }
}

const parseTrip: Parser<Trip> = (value) => {
  const source = record(value)
  if (!Array.isArray(source.stops) || source.stops.length > 8) throw genericFailure()
  return {
    id: string(source.id, 128),
    name: string(source.name, 80),
    localDate: boundedDate(string(source.localDate, 10)),
    state: enumValue<Trip['state']>(source.state, TRIP_STATES),
    stops: source.stops.map(parseStop),
    version: integer(source.version, 0),
    origin: parseCoordinate(source.origin),
    returnCoordinate: parseCoordinate(source.returnCoordinate),
    departureMinute:
      source.departureMinute == null ? undefined : integer(source.departureMinute, 0, 1_439),
    transitionMinutes:
      source.transitionMinutes == null ? undefined : integer(source.transitionMinutes, 0, 180),
  }
}

function parseGrantWrappedTrip(value: unknown): Trip {
  const source = record(value)
  return source.trip == null ? parseTrip(value) : parseTrip(source.trip)
}

function parseRenameResult(value: unknown): TripRenameResult {
  const source = record(value)
  if (source.state !== 'conflict') return { state: 'applied', trip: parseTrip(value) }
  const latest = record(source.latest)
  return {
    state: 'conflict',
    latest: { name: string(latest.name, 80), version: integer(latest.version, 1) },
  }
}

function parseTripList(value: unknown): Trip[] {
  if (!Array.isArray(value) || value.length > 500) throw genericFailure()
  return value.map(parseTrip)
}

function parseNullableTrip(value: unknown): Trip | null {
  return value == null ? null : parseTrip(value)
}

function parseParticipant(value: unknown): TripParticipant {
  const source = record(value)
  return {
    userId: string(source.userId, 128),
    displayName: string(source.displayName, 160),
    role: enumValue<TripParticipant['role']>(source.role, new Set(['creator', 'partner'])),
  }
}

function parseInvitation(value: unknown): TripInvitation {
  const source = record(value)
  return {
    id: string(source.id, 128),
    state: enumValue<TripInvitation['state']>(
      source.state,
      new Set(['pending', 'accepted', 'revoked', 'expired']),
    ),
    expiresAt: string(source.expiresAt, 64),
  }
}

function parseCollaboration(value: unknown): TripCollaboration {
  const source = record(value)
  if (
    !Array.isArray(source.participants) ||
    source.participants.length < 1 ||
    source.participants.length > 2
  )
    throw genericFailure()
  const participants = source.participants.map(parseParticipant)
  if (new Set(participants.map((participant) => participant.userId)).size !== participants.length)
    throw genericFailure()
  const currentUserId = string(source.currentUserId, 128)
  const navigatorUserId = optionalString(source.navigatorUserId, 128)
  if (!participants.some((participant) => participant.userId === currentUserId))
    throw genericFailure()
  if (
    navigatorUserId &&
    !participants.some((participant) => participant.userId === navigatorUserId)
  )
    throw genericFailure()
  if (participants.filter((participant) => participant.role === 'creator').length !== 1)
    throw genericFailure()
  return {
    tripId: string(source.tripId, 128),
    currentUserId,
    participants,
    navigatorUserId,
    invitation: source.invitation == null ? undefined : parseInvitation(source.invitation),
  }
}

function parseQueue(value: unknown): OfflineQueueSnapshot {
  const source = record(value)
  const conflictSource = source.conflict == null ? undefined : record(source.conflict)
  return {
    state: enumValue<OfflineQueueSnapshot['state']>(source.state, QUEUE_STATES),
    pendingCount: integer(source.pendingCount, 0, 10_000),
    conflict: conflictSource
      ? { id: string(conflictSource.id, 128), summary: string(conflictSource.summary, 500) }
      : undefined,
    lastUpdatedAt: optionalString(source.lastUpdatedAt, 64),
    purgeReason: optionalString(source.purgeReason, 128),
  }
}

function parseMutationReplay(value: unknown): TripMutationReplayResult {
  const source = record(value)
  const state = enumValue(source.state, new Set(['accepted', 'conflict', 'unauthorized']))
  if (state === 'unauthorized') return { state } as const
  if (state === 'conflict') return { state, summary: string(source.summary, 500) } as const
  return { state: 'accepted', trip: parseTrip(source.trip) }
}

function parseCheckMyDayServerResult(value: unknown): CheckMyDayServerResult {
  const source = record(value)
  const state = enumValue<CheckMyDayServerResult['state']>(
    source.state,
    new Set(['blocked', 'ready', 'running', 'suggested', 'failed']),
  )
  const reason =
    source.reason == null
      ? undefined
      : enumValue<NonNullable<CheckMyDayServerResult['reason']>>(
          source.reason,
          new Set(['r01_blocked', 'departure_required', 'coordinates_required', 'trip_changed']),
        )
  const orderedStopIds =
    source.orderedStopIds == null
      ? undefined
      : Array.isArray(source.orderedStopIds) && source.orderedStopIds.length <= 8
        ? source.orderedStopIds.map((id) => boundedId(string(id, 128)))
        : (() => {
            throw genericFailure()
          })()
  const explanation =
    source.explanation == null
      ? undefined
      : Array.isArray(source.explanation) && source.explanation.length <= 20
        ? source.explanation.map((item) => string(item, 500))
        : (() => {
            throw genericFailure()
          })()
  return {
    requestId: boundedId(string(source.requestId, 128)),
    state,
    reason,
    orderedStopIds,
    explanation,
  }
}

function boundedId(value: string): string {
  const normalized = value.normalize('NFKC').trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(normalized)) throw genericFailure()
  return normalized
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 0x1f || code === 0x7f
  })
}

function boundedLabel(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  if (!normalized || normalized.length > 160 || hasControlCharacters(normalized))
    throw genericFailure()
  return normalized
}

function boundedDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw genericFailure()
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw genericFailure()
  return value
}

function boundedEmail(value: string): string {
  const normalized = normalizeTripPartnerEmail(value)
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized) ||
    hasControlCharacters(normalized)
  )
    throw genericFailure()
  return normalized
}

function boundedToken(value: string): string {
  if (!/^[A-Za-z0-9._~=-]{16,4096}$/u.test(value)) throw genericFailure()
  return value
}

function boundedCode(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(value)) throw genericFailure()
  return value
}

export function createTripApi(
  transport: TripTransport,
  deviceIdentity?: TripDeviceIdentity,
): TripClient {
  async function execute<T>(
    command: TripApiCommand,
    payload: () => Readonly<Record<string, unknown>>,
    parse: Parser<T>,
  ): Promise<T> {
    try {
      return parse(await transport.invoke(command, payload()))
    } catch {
      throw genericFailure()
    }
  }

  return {
    list() {
      return execute('list_trips', () => ({}), parseTripList)
    },
    get(id) {
      return execute('get_trip', () => ({ trip_id: boundedId(id) }), parseNullableTrip)
    },
    create(input) {
      return execute(
        'create_trip',
        () => {
          const name = normalizeTripName(input.name)
          if (!name) throw genericFailure()
          return { name, local_date: boundedDate(input.localDate) }
        },
        parseTrip,
      )
    },
    addStop(tripId, input) {
      return execute(
        'add_trip_stop',
        () => {
          if (!validDwellMinutes(input.plannedDwellMinutes)) throw genericFailure()
          return {
            trip_id: boundedId(tripId),
            kind: enumValue<TripStop['kind']>(input.kind, new Set(['store', 'rest'])),
            label: boundedLabel(input.label),
            priority: enumValue<TripStop['priority']>(input.priority, PRIORITIES),
            planned_dwell_minutes: input.plannedDwellMinutes,
          }
        },
        parseTrip,
      )
    },
    reorderStop(tripId, stopId, position) {
      return execute(
        'reorder_trip_stop',
        () => ({
          trip_id: boundedId(tripId),
          stop_id: boundedId(stopId),
          position: integer(position, 0, 7),
        }),
        parseTrip,
      )
    },
    renameTrip(tripId, name, expectedVersion, idempotencyKey) {
      return execute(
        'rename_trip',
        () => {
          const normalized = normalizeTripName(name)
          if (!normalized) throw genericFailure()
          return {
            trip_id: boundedId(tripId),
            new_name: normalized,
            expected_version: integer(expectedVersion, 1),
            idempotency_key: boundedId(idempotencyKey),
          }
        },
        parseRenameResult,
      )
    },
    removeStop(tripId, stopId, expectedVersion) {
      return execute(
        'remove_trip_stop',
        () => ({
          trip_id: boundedId(tripId),
          stop_id: boundedId(stopId),
          expected_version: integer(expectedVersion, 1),
        }),
        parseTrip,
      )
    },
    setStopPriority(tripId, stopId, priority, expectedVersion) {
      return execute(
        'set_trip_stop_priority',
        () => ({
          trip_id: boundedId(tripId),
          stop_id: boundedId(stopId),
          priority: enumValue(priority, PRIORITIES),
          expected_version: integer(expectedVersion, 1),
        }),
        parseTrip,
      )
    },
    setStopDwell(tripId, stopId, dwellMinutes, expectedVersion) {
      return execute(
        'set_trip_stop_dwell',
        () => ({
          trip_id: boundedId(tripId),
          stop_id: boundedId(stopId),
          dwell_minutes: integer(dwellMinutes, 5, 720),
          expected_version: integer(expectedVersion, 1),
        }),
        parseTrip,
      )
    },
    updateSchedule(tripId, input, expectedVersion) {
      return execute(
        'update_trip_schedule',
        () => ({
          trip_id: boundedId(tripId),
          local_date: boundedDate(input.localDate),
          departure_minute:
            input.departureMinute == null ? null : integer(input.departureMinute, 0, 1439),
          expected_version: integer(expectedVersion, 1),
        }),
        parseTrip,
      )
    },
    bindNavigatorDevice(tripId) {
      return execute(
        'bind_navigator_device',
        () => {
          if (!deviceIdentity) throw genericFailure()
          return { trip_id: boundedId(tripId), device_id: boundedId(deviceIdentity.deviceKeyId) }
        },
        parseCollaboration,
      )
    },
    transferNavigatorDevice(tripId) {
      return execute(
        'transfer_navigator_device',
        () => {
          if (!deviceIdentity) throw genericFailure()
          return {
            trip_id: boundedId(tripId),
            install_id: boundedId(deviceIdentity.installId),
            device_key_id: boundedId(deviceIdentity.deviceKeyId),
          }
        },
        parseGrantWrappedTrip,
      )
    },
    reviewHours(tripId) {
      return execute('review_trip_hours', () => ({ trip_id: boundedId(tripId) }), parseTrip)
    },
    start(tripId) {
      return execute('start_trip', () => ({ trip_id: boundedId(tripId) }), parseGrantWrappedTrip)
    },
    markArrived(tripId, stopId) {
      return execute(
        'mark_arrived',
        () => ({ trip_id: boundedId(tripId), stop_id: boundedId(stopId) }),
        parseTrip,
      )
    },
    completeStop(tripId, stopId) {
      return execute(
        'complete_trip_stop',
        () => ({ trip_id: boundedId(tripId), stop_id: boundedId(stopId) }),
        parseTrip,
      )
    },
    skipStop(tripId, stopId) {
      return execute(
        'skip_trip_stop',
        () => ({ trip_id: boundedId(tripId), stop_id: boundedId(stopId) }),
        parseTrip,
      )
    },
    setStart(tripId, input) {
      return execute(
        'set_trip_start',
        () => ({
          trip_id: boundedId(tripId),
          kind: enumValue(input.kind, new Set(['manual', 'current_location'])),
          label: input.label == null ? null : boundedLabel(input.label),
          latitude: input.latitude == null ? null : finite(input.latitude, -90, 90),
          longitude: input.longitude == null ? null : finite(input.longitude, -180, 180),
          departure_minute: integer(input.departureMinute, 0, 1439),
        }),
        parseTrip,
      )
    },
    setReturn(tripId, input) {
      return execute(
        'set_trip_return',
        () => ({
          trip_id: boundedId(tripId),
          clear: input == null,
          label: input?.label == null ? null : boundedLabel(input.label),
          latitude: input?.latitude == null ? null : finite(input.latitude, -90, 90),
          longitude: input?.longitude == null ? null : finite(input.longitude, -180, 180),
        }),
        parseTrip,
      )
    },
    setLimits(tripId, input) {
      return execute(
        'set_trip_limits',
        () => ({
          trip_id: boundedId(tripId),
          max_drive_miles: input.maxDriveMiles == null ? null : finite(input.maxDriveMiles, 1, 500),
          max_total_minutes:
            input.maxTotalMinutes == null ? null : integer(input.maxTotalMinutes, 30, 1440),
        }),
        parseTrip,
      )
    },
    addRestStop(tripId, input) {
      return execute(
        'add_rest_stop',
        () => ({
          trip_id: boundedId(tripId),
          label: boundedLabel(input.label),
          address: boundedLabel(input.address),
          priority: enumValue(input.priority, PRIORITIES),
          planned_dwell_minutes: integer(input.plannedDwellMinutes, 5, 720),
          latitude: input.latitude == null ? null : finite(input.latitude, -90, 90),
          longitude: input.longitude == null ? null : finite(input.longitude, -180, 180),
        }),
        parseTrip,
      )
    },
    markObservedClosed(tripId, stopId) {
      return execute(
        'mark_trip_stop_closed',
        () => ({ trip_id: boundedId(tripId), stop_id: boundedId(stopId) }),
        parseTrip,
      )
    },
    restoreStop(tripId, stopId) {
      return execute(
        'restore_trip_stop',
        () => ({ trip_id: boundedId(tripId), stop_id: boundedId(stopId) }),
        parseTrip,
      )
    },
    completeTrip(tripId) {
      return execute('complete_trip', () => ({ trip_id: boundedId(tripId) }), parseTrip)
    },
    saveVisitMemory(tripId, storeId, input) {
      return execute(
        'save_trip_visit_memory',
        () => ({
          trip_id: boundedId(tripId),
          store_id: boundedId(storeId),
          rating: input.rating == null ? null : integer(input.rating, 1, 5),
          return_choice: input.returnChoice ?? null,
          note: input.note == null ? null : string(input.note.normalize('NFKC').trim(), 2000),
        }),
        parseTrip,
      )
    },
    replayOffline(tripId) {
      return execute('replay_trip_mutations', () => ({ trip_id: boundedId(tripId) }), parseTrip)
    },
    replayOfflineMutation(envelope) {
      return execute(
        'replay_trip_mutation',
        () => ({
          trip_id: boundedId(envelope.tripId),
          envelope: {
            idempotency_key: boundedId(envelope.idempotencyKey),
            base_version: integer(envelope.baseVersion, 1),
            device_id: boundedId(envelope.deviceId),
            local_sequence: integer(envelope.localSequence, 1),
            kind: enumValue(
              envelope.kind,
              new Set([
                'mark_arrived',
                'complete_stop',
                'skip_stop',
                'mark_observed_closed',
                'restore_stop',
              ]),
            ),
            stop_id: boundedId(envelope.stopId),
            ...(envelope.conflictResolution ? { conflict_resolution: 'phone' } : {}),
          },
        }),
        parseMutationReplay,
      )
    },
    getOfflineQueue(tripId) {
      return execute('get_offline_trip_queue', () => ({ trip_id: boundedId(tripId) }), parseQueue)
    },
    queueOfflineAction(tripId, action) {
      return execute(
        'queue_offline_trip_action',
        () => ({
          trip_id: boundedId(tripId),
          action: {
            kind: boundedCode(action.kind),
            ...(action.stopId ? { stop_id: boundedId(action.stopId) } : {}),
          },
        }),
        parseQueue,
      )
    },
    resolveOfflineConflict(tripId, choice) {
      return execute(
        'resolve_trip_conflict',
        () => {
          if (choice !== 'phone' && choice !== 'saved') throw genericFailure()
          return { trip_id: boundedId(tripId), choice }
        },
        parseQueue,
      )
    },
    purgeOffline(tripId, reason) {
      return execute(
        'purge_offline_trip',
        () => ({ trip_id: boundedId(tripId), reason: boundedCode(reason) }),
        parseQueue,
      )
    },
    getCollaboration(tripId) {
      return execute(
        'get_trip_collaboration',
        () => ({ trip_id: boundedId(tripId) }),
        parseCollaboration,
      )
    },
    invitePartner(tripId, verifiedEmail) {
      return execute(
        'invite_trip_partner',
        () => ({ trip_id: boundedId(tripId), verified_email: boundedEmail(verifiedEmail) }),
        parseCollaboration,
      )
    },
    revokeInvitation(tripId, invitationId) {
      return execute(
        'revoke_trip_invitation',
        () => ({ trip_id: boundedId(tripId), invitation_id: boundedId(invitationId) }),
        parseCollaboration,
      )
    },
    acceptInvitation(fragmentToken) {
      return execute(
        'accept_trip_invitation',
        () => ({ fragment_token: boundedToken(fragmentToken) }),
        parseCollaboration,
      )
    },
    assignNavigator(tripId, participantUserId) {
      return execute(
        'assign_navigator',
        () => ({ trip_id: boundedId(tripId), participant_id: boundedId(participantUserId) }),
        parseCollaboration,
      )
    },
    leaveTrip(tripId) {
      return execute(
        'leave_trip',
        () => ({ trip_id: boundedId(tripId) }),
        () => undefined,
      )
    },
    saveCheckMyDayChoice(tripId, choice, stopIds) {
      return execute(
        'save_check_my_day_choice',
        () => ({
          trip_id: boundedId(tripId),
          choice: enumValue(choice, new Set(['suggested', 'manual'])),
          stop_ids: stopIds.map(boundedId),
        }),
        parseTrip,
      )
    },
    requestCheckMyDay(tripId) {
      return execute(
        'request_check_my_day',
        () => ({ trip_id: boundedId(tripId) }),
        parseCheckMyDayServerResult,
      )
    },
    getCheckMyDaySuggestion(requestId) {
      return execute(
        'get_check_my_day_suggestion',
        () => ({ request_id: boundedId(requestId) }),
        parseCheckMyDayServerResult,
      )
    },
  }
}
