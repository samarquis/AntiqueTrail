import type { TripClient } from './types'

export const GENERIC_TRIP_ERROR = "We couldn't update this trip. Please try again."
export const MAX_ACTIVE_STOPS = 8

export const unavailableTripClient: TripClient = {
  async list() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async get() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async create() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async addStop() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async reorderStop() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async renameTrip() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async removeStop() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async setStopPriority() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async setStopDwell() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async updateSchedule() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async bindNavigatorDevice() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async transferNavigatorDevice() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async reviewHours() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async start() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async markArrived() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async completeStop() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async skipStop() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async replayOffline() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async getOfflineQueue() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async queueOfflineAction() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async resolveOfflineConflict() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async purgeOffline() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async getCollaboration() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async invitePartner() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async revokeInvitation() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async acceptInvitation() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async assignNavigator() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
  async leaveTrip() {
    throw new Error(GENERIC_TRIP_ERROR)
  },
}

export function normalizeTripName(value: string): string {
  const withoutControls = Array.from(value.normalize('NFKC'), (character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 0x1f || code === 0x7f ? ' ' : character
  }).join('')
  return withoutControls.trim().replace(/\s+/gu, ' ').slice(0, 80)
}

export function validDwellMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 720
}

export function normalizeTripPartnerEmail(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}
