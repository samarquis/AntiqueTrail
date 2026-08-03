export type RoutingCapability = 'blocked' | 'available' | 'unavailable'
export type StopPriority = 'must' | 'prefer' | 'flexible'

export interface PublicPoint { id: string; latitude: number; longitude: number; name: string }
export interface MapBounds { north: number; south: number; east: number; west: number }
export interface MapRequest { bounds: MapBounds; zoom: number; q?: string; category?: string; openNow?: boolean; maxAreaCentroidMiles?: number }
export interface GeocodeRequest { text: string; purpose: 'start' | 'return' | 'rest' }
export interface RoutingPayload { origin: { latitude: number; longitude: number }; destinations: Array<{ latitude: number; longitude: number }> }

export interface CheckMyDayStop {
  id: string
  kind: 'store' | 'rest'
  name: string
  priority: StopPriority
  dwellMinutes: number
  originalIndex: number
  opensAt?: number
  closesAt?: number
}

export interface TravelLeg { from: string; to: string; miles: number; minutes: number }
export interface SuggestedStop extends CheckMyDayStop { arrivalMinute: number; departureMinute: number; warning?: string }
export interface CheckMyDayInput { stops: CheckMyDayStop[]; departureMinute: number; returnId?: string; maxDriveMiles?: number; maxTotalMinutes?: number; matrix: Record<string, TravelLeg>; matrixTimestamp: string }
export interface CheckMyDayResult { order: SuggestedStop[]; legs: TravelLeg[]; totalMiles: number; totalMinutes: number; estimatedFinishMinute: number; feasible: boolean; reasons: string[]; matrixTimestamp: string }

