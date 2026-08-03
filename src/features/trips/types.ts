export type TripState = 'draft' | 'ready' | 'active' | 'completed' | 'cancelled'
export type StopState = 'planned' | 'arrived' | 'completed' | 'skipped' | 'observed_closed'
export type StopPriority = 'must' | 'prefer' | 'flexible'

export interface TripStop {
  id: string
  kind: 'store' | 'rest'
  label: string
  position: number
  priority: StopPriority
  plannedDwellMinutes: number
  state: StopState
}

export interface Trip {
  id: string
  name: string
  localDate: string
  state: TripState
  stops: TripStop[]
  version: number
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
  reviewHours(tripId: string): Promise<Trip>
  start(tripId: string): Promise<Trip>
  markArrived(tripId: string, stopId: string): Promise<Trip>
  completeStop(tripId: string, stopId: string): Promise<Trip>
  skipStop(tripId: string, stopId: string): Promise<Trip>
  replayOffline(tripId: string): Promise<Trip>
}
