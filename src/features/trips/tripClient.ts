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
}

export function normalizeTripName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 80)
}

export function validDwellMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 720
}
