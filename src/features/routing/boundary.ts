import type { GeocodeRequest, MapRequest, PublicPoint, RoutingCapability, RoutingPayload, CheckMyDayInput, CheckMyDayResult, CheckMyDayStop, SuggestedStop, TravelLeg } from './types'

export const ROUTING_BLOCKED_MESSAGE = 'Map and travel-time suggestions are not available yet. Your list is still available.'

export function buildMapRequest(capability: RoutingCapability, request: MapRequest): MapRequest | null {
  return capability === 'available' ? { ...request, q: request.q?.trim() || undefined } : null
}

export function buildGeocodeRequest(capability: RoutingCapability, text: string, purpose: GeocodeRequest['purpose']): GeocodeRequest | null {
  const normalized = text.normalize('NFKC').trim()
  return capability === 'available' && normalized ? { text: normalized, purpose } : null
}

export function buildProviderPayload(capability: RoutingCapability, origin: PublicPoint, destinations: PublicPoint[]): RoutingPayload | null {
  if (capability !== 'available') return null
  return { origin: coordinates(origin), destinations: destinations.map(coordinates) }
}

function coordinates(point: PublicPoint) { return { latitude: point.latitude, longitude: point.longitude } }

export function mapFallback(capability: RoutingCapability): { mapVisible: boolean; message?: string } {
  return capability === 'available' ? { mapVisible: true } : { mapVisible: false, message: ROUTING_BLOCKED_MESSAGE }
}

export function suggestCheckMyDay(input: CheckMyDayInput): CheckMyDayResult {
  if (input.stops.length < 1 || input.stops.length > 8) throw new Error('stop_limit')
  const candidates = permutations(input.stops)
  const scored = candidates.map((order) => evaluate(order, input)).sort(compare)
  const best = scored[0]
  return best.result
}

interface Scored { result: CheckMyDayResult; score: [number, number, number, number, number, number, number, string] }
function evaluate(order: CheckMyDayStop[], input: CheckMyDayInput): Scored {
  let clock = input.departureMinute; let totalMiles = 0; let totalTravel = 0; let late = 0; const result: SuggestedStop[] = []; const legs: TravelLeg[] = []
  let previous = '__start__'
  for (const stop of order) {
    const leg = input.matrix[`${previous}->${stop.id}`] ?? { from: previous, to: stop.id, miles: 0, minutes: 0 }
    legs.push(leg); totalMiles += leg.miles; totalTravel += leg.minutes; clock += leg.minutes
    let warning: string | undefined
    if (stop.kind === 'store' && stop.closesAt == null) warning = 'Hours unavailable'
    if (stop.kind === 'store' && stop.opensAt != null && clock < stop.opensAt) clock = stop.opensAt
    if (stop.kind === 'store' && stop.closesAt != null && clock > stop.closesAt) { late += clock - stop.closesAt; warning = warning ?? 'Arrives after closing' }
    const arrivalMinute = clock; clock += stop.dwellMinutes; const departureMinute = clock
    result.push({ ...stop, arrivalMinute, departureMinute, warning }); previous = stop.id
    if (result.length < order.length) clock += 10
  }
  if (input.returnId) { const leg = input.matrix[`${previous}->${input.returnId}`] ?? { from: previous, to: input.returnId, miles: 0, minutes: 0 }; legs.push(leg); totalMiles += leg.miles; totalTravel += leg.minutes; clock += leg.minutes }
  const maxExcess = Math.max(0, (input.maxDriveMiles == null ? 0 : totalMiles - input.maxDriveMiles)) + Math.max(0, (input.maxTotalMinutes == null ? 0 : clock - input.departureMinute - input.maxTotalMinutes))
  const mustComplete = result.filter((stop) => stop.priority === 'must' && !stop.warning).length
  const points = result.filter((stop) => !stop.warning).reduce((sum, stop) => sum + (stop.priority === 'must' ? 3 : stop.priority === 'prefer' ? 2 : 1), 0)
  const allComplete = result.filter((stop) => !stop.warning).length
  const originalPairs = result.slice(1).filter((stop, index) => stop.originalIndex === result[index].originalIndex + 1).length
  const feasible = maxExcess === 0 && late === 0
  const reasons = [feasible ? 'Within selected limits.' : 'Shows warnings for limits or store hours.', 'Use Suggested Order applies only after explicit confirmation.', 'Keep My Order remains available.']
  return { result: { order: result, legs, totalMiles, totalMinutes: totalTravel, estimatedFinishMinute: clock, feasible, reasons, matrixTimestamp: input.matrixTimestamp }, score: [feasible ? 0 : 1, -mustComplete, -points, -allComplete, maxExcess, late, -originalPairs, result.map((stop) => stop.id).join('\u0000')] }
}

function compare(a: Scored, b: Scored): number { for (let i = 0; i < a.score.length; i += 1) { if (a.score[i] === b.score[i]) continue; if (typeof a.score[i] === 'string') return String(a.score[i]).localeCompare(String(b.score[i])); return Number(a.score[i]) - Number(b.score[i]) } return 0 }
function permutations<T>(items: T[]): T[][] { if (items.length === 1) return [items]; return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])) }

