export type TripState = 'draft' | 'ready' | 'active' | 'completed' | 'cancelled'
export type StopState = 'planned' | 'arrived' | 'completed' | 'skipped' | 'observed_closed'
export type StopPriority = 'must' | 'prefer' | 'flexible'
export type OfflineQueueState = 'empty' | 'queued' | 'replaying' | 'conflict' | 'purged' | 'blocked'

export interface OfflineQueueSnapshot {
  state: OfflineQueueState
  pendingCount: number
  conflict?: { id: string; summary: string }
  lastUpdatedAt?: string
  purgeReason?: string
}

export interface TripStop {
  id: string
  kind: 'store' | 'rest'
  label: string
  /** Optional private address used only for an explicit external-map handoff. */
  address?: string
  position: number
  priority: StopPriority
  plannedDwellMinutes: number
  state: StopState
  coordinate?: { latitude: number; longitude: number }
  hours?: { state: 'verified' | 'unknown' | 'stale'; opensAt?: number; closesAt?: number }
}

export interface Trip {
  id: string
  name: string
  localDate: string
  state: TripState
  stops: TripStop[]
  version: number
  origin?: { latitude: number; longitude: number }
  returnCoordinate?: { latitude: number; longitude: number }
  departureMinute?: number
  transitionMinutes?: number
  maxDriveMiles?: number
  maxTotalMinutes?: number
}

export type TripRenameResult =
  | { state: 'applied'; trip: Trip }
  | { state: 'conflict'; latest: { name: string; version: number } }

export type TripParticipantRole = 'creator' | 'partner'
export type TripInvitationState = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface TripParticipant {
  userId: string
  displayName: string
  role: TripParticipantRole
}

export interface TripInvitation {
  id: string
  state: TripInvitationState
  expiresAt: string
}

/** The server returns collaboration state for exactly one authorized trip. */
export interface TripCollaboration {
  tripId: string
  currentUserId: string
  participants: TripParticipant[]
  navigatorUserId?: string
  invitation?: TripInvitation
}

export interface TripMutationEnvelope {
  tripId: string
  idempotencyKey: string
  baseVersion: number
  deviceId: string
  localSequence: number
  kind: 'mark_arrived' | 'complete_stop' | 'skip_stop' | 'mark_observed_closed' | 'restore_stop'
  stopId: string
  conflictResolution?: 'phone'
}

export type TripMutationReplayResult =
  | { state: 'accepted'; trip: Trip }
  | { state: 'conflict'; summary: string }
  | { state: 'unauthorized' }

export type CheckMyDayServerState = 'blocked' | 'ready' | 'running' | 'suggested' | 'failed'
export interface CheckMyDayServerResult {
  requestId: string
  state: CheckMyDayServerState
  reason?: 'r01_blocked' | 'departure_required' | 'coordinates_required' | 'trip_changed'
  orderedStopIds?: string[]
  explanation?: string[]
}

export interface TripClient {
  list(): Promise<Trip[]>
  get(id: string): Promise<Trip | null>
  create(input: { name: string; localDate: string }): Promise<Trip>
  addStop(
    tripId: string,
    input: {
      kind: TripStop['kind']
      label: string
      priority: StopPriority
      plannedDwellMinutes: number
    },
  ): Promise<Trip>
  reorderStop(tripId: string, stopId: string, position: number): Promise<Trip>
  renameTrip(
    tripId: string,
    name: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<TripRenameResult>
  removeStop(tripId: string, stopId: string, expectedVersion: number): Promise<Trip>
  setStopPriority(
    tripId: string,
    stopId: string,
    priority: StopPriority,
    expectedVersion: number,
  ): Promise<Trip>
  setStopDwell(
    tripId: string,
    stopId: string,
    dwellMinutes: number,
    expectedVersion: number,
  ): Promise<Trip>
  updateSchedule(
    tripId: string,
    input: { localDate: string; departureMinute?: number },
    expectedVersion: number,
  ): Promise<Trip>
  bindNavigatorDevice(tripId: string): Promise<TripCollaboration>
  transferNavigatorDevice(tripId: string): Promise<Trip>
  reviewHours(tripId: string): Promise<Trip>
  start(tripId: string): Promise<Trip>
  markArrived(tripId: string, stopId: string): Promise<Trip>
  completeStop(tripId: string, stopId: string): Promise<Trip>
  skipStop(tripId: string, stopId: string): Promise<Trip>
  setStart?(
    tripId: string,
    input: {
      kind: 'manual' | 'current_location'
      label?: string
      latitude?: number
      longitude?: number
      departureMinute: number
    },
  ): Promise<Trip>
  setReturn?(
    tripId: string,
    input: { label?: string; latitude?: number; longitude?: number } | null,
  ): Promise<Trip>
  setLimits?(
    tripId: string,
    input: { maxDriveMiles?: number; maxTotalMinutes?: number },
  ): Promise<Trip>
  addRestStop?(
    tripId: string,
    input: {
      label: string
      address: string
      latitude?: number
      longitude?: number
      priority: StopPriority
      plannedDwellMinutes: number
    },
  ): Promise<Trip>
  markObservedClosed?(tripId: string, stopId: string): Promise<Trip>
  restoreStop?(tripId: string, stopId: string): Promise<Trip>
  completeTrip?(tripId: string): Promise<Trip>
  saveVisitMemory?(
    tripId: string,
    storeId: string,
    input: { rating?: number; returnChoice?: 'no' | 'maybe' | 'yes'; note?: string },
  ): Promise<Trip>
  replayOffline(tripId: string): Promise<Trip>
  replayOfflineMutation?(envelope: TripMutationEnvelope): Promise<TripMutationReplayResult>
  getOfflineQueue(tripId: string): Promise<OfflineQueueSnapshot>
  queueOfflineAction(
    tripId: string,
    action: { kind: string; stopId?: string },
  ): Promise<OfflineQueueSnapshot>
  resolveOfflineConflict(tripId: string, choice: 'phone' | 'saved'): Promise<OfflineQueueSnapshot>
  purgeOffline(tripId: string, reason: string): Promise<OfflineQueueSnapshot>
  getCollaboration(tripId: string): Promise<TripCollaboration>
  invitePartner(tripId: string, verifiedEmail: string): Promise<TripCollaboration>
  revokeInvitation(tripId: string, invitationId: string): Promise<TripCollaboration>
  acceptInvitation(fragmentToken: string): Promise<TripCollaboration>
  assignNavigator(tripId: string, participantUserId: string): Promise<TripCollaboration>
  leaveTrip(tripId: string): Promise<void>
  saveCheckMyDayChoice?(
    tripId: string,
    choice: 'suggested' | 'manual',
    stopIds: string[],
  ): Promise<Trip>
  requestCheckMyDay?(tripId: string): Promise<CheckMyDayServerResult>
  getCheckMyDaySuggestion?(requestId: string): Promise<CheckMyDayServerResult>
}
