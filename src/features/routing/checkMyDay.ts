import type { RoutingCapability, StopPriority } from './types'

export interface ApprovedCoordinate {
  latitude: number
  longitude: number
}

export interface CoordinateMatrixRequest {
  /** Ordered coordinates only: origin, stops, then optional return. */
  coordinates: ApprovedCoordinate[]
  returnIndex?: number
}

export interface CoordinateMatrixLeg {
  fromIndex: number
  toIndex: number
  miles: number
  minutes: number
}

export type ProviderFailureStatus = 'quota' | 'revoked' | 'outage' | 'no_route' | 'temporary_market'

export type CheckMyDayProviderResponse =
  | {
      status: 'ok'
      providerVersion: string
      attribution: string
      generatedAt: string
      requestCount: number
      costUnits: number
      legs: CoordinateMatrixLeg[]
    }
  | { status: ProviderFailureStatus; requestCount: number; costUnits: number }

export interface CheckMyDayProvider {
  getCoordinateMatrix(
    request: CoordinateMatrixRequest,
    options: { signal: AbortSignal },
  ): Promise<CheckMyDayProviderResponse>
}

export interface CheckMyDayHours {
  state: 'verified' | 'unknown' | 'stale'
  opensAt?: number
  closesAt?: number
}

export interface CheckMyDayRequestStop {
  id: string
  name: string
  coordinate: ApprovedCoordinate
  kind: 'store' | 'rest'
  priority: StopPriority
  dwellMinutes: number
  originalIndex: number
  hours?: CheckMyDayHours
}

export interface CheckMyDayRequest {
  capability: RoutingCapability
  providerContract: {
    version: string
    maxRequests: number
    maxCostUnits: number
    timeoutMs: number
  }
  origin: ApprovedCoordinate
  returnCoordinate?: ApprovedCoordinate
  departureMinute: number
  transitionMinutes: number
  maxDriveMiles?: number
  maxTotalMinutes?: number
  stops: CheckMyDayRequestStop[]
}

export interface CheckMyDayItineraryStop extends CheckMyDayRequestStop {
  arrivalMinute: number
  departureMinute: number
  waitMinutes: number
  warning?: string
}

export type CheckMyDayFallbackReason =
  | 'r01_blocked'
  | 'provider_outage'
  | 'quota'
  | 'revoked'
  | 'no_route'
  | 'temporary_market'
  | 'timeout'
  | 'contract_mismatch'
  | 'cost_control'
  | 'invalid_input'

export interface CheckMyDayEvidenceSummary {
  providerVersion?: string
  expectedProviderVersion: string
  requestCount: number
  maxRequests: number
  costUnits: number
  maxCostUnits: number
  timeoutMs: number
  attribution?: string
  coordinateCount: number
  includedIdentifiers: false
  loggedCoordinates: false
  persistedCoordinates: false
  outcome: 'suggestion' | CheckMyDayFallbackReason
}

export type CheckMyDayOutcome =
  | {
      kind: 'suggestion'
      itinerary: CheckMyDayItineraryStop[]
      choices: { useSuggestedOrder: string[]; keepMyOrder: string[] }
      totalMiles: number
      totalTravelMinutes: number
      estimatedFinishMinute: number
      feasible: boolean
      explanation: string[]
      optimalityClaim: false
      matrixGeneratedAt: string
      evidence: CheckMyDayEvidenceSummary
    }
  | {
      kind: 'fallback'
      reason: CheckMyDayFallbackReason
      message: string
      originalOrder: string[]
      optimalityClaim: false
      evidence: CheckMyDayEvidenceSummary
    }

interface EvaluatedOrder {
  itinerary: CheckMyDayItineraryStop[]
  totalMiles: number
  totalTravelMinutes: number
  estimatedFinishMinute: number
  feasible: boolean
  warnings: string[]
  score: [number, number, number, number, number, number, number, number, string]
}

const FALLBACK_MESSAGES: Record<CheckMyDayFallbackReason, string> = {
  r01_blocked: 'Check My Day remains unavailable until the routing contract is approved.',
  provider_outage: 'Routing is unavailable. Your manual order is unchanged.',
  quota: 'The routing quota is unavailable. Your manual order is unchanged.',
  revoked: 'Routing access is revoked. Your manual order is unchanged.',
  no_route: 'No complete route was returned. Your manual order is unchanged.',
  temporary_market:
    'Routing is temporarily unavailable in this market. Your manual order is unchanged.',
  timeout: 'Routing took too long. Your manual order is unchanged.',
  contract_mismatch: 'The routing contract version did not match. Your manual order is unchanged.',
  cost_control: 'The routing request or cost limit was exceeded. Your manual order is unchanged.',
  invalid_input: 'The trip cannot be checked until its planning details are corrected.',
}

function evidence(
  request: CheckMyDayRequest,
  outcome: CheckMyDayEvidenceSummary['outcome'],
  coordinateCount: number,
  response?: Partial<Extract<CheckMyDayProviderResponse, { status: 'ok' }>> & {
    requestCount?: number
    costUnits?: number
  },
): CheckMyDayEvidenceSummary {
  return {
    providerVersion: response?.providerVersion,
    expectedProviderVersion: request.providerContract.version,
    requestCount: response?.requestCount ?? 0,
    maxRequests: request.providerContract.maxRequests,
    costUnits: response?.costUnits ?? 0,
    maxCostUnits: request.providerContract.maxCostUnits,
    timeoutMs: request.providerContract.timeoutMs,
    attribution: response?.attribution,
    coordinateCount,
    includedIdentifiers: false,
    loggedCoordinates: false,
    persistedCoordinates: false,
    outcome,
  }
}

function fallback(
  request: CheckMyDayRequest,
  reason: CheckMyDayFallbackReason,
  coordinateCount: number,
  response?: {
    providerVersion?: string
    attribution?: string
    requestCount?: number
    costUnits?: number
  },
): CheckMyDayOutcome {
  return {
    kind: 'fallback',
    reason,
    message: FALLBACK_MESSAGES[reason],
    originalOrder: request.stops.map((stop) => stop.id),
    optimalityClaim: false,
    evidence: evidence(request, reason, coordinateCount, response),
  }
}

function validCoordinate(point: ApprovedCoordinate): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  )
}

function validRequest(request: CheckMyDayRequest): boolean {
  if (request.stops.length < 1 || request.stops.length > 8) return false
  if (!validCoordinate(request.origin)) return false
  if (request.returnCoordinate && !validCoordinate(request.returnCoordinate)) return false
  if (!Number.isInteger(request.departureMinute) || request.departureMinute < 0) return false
  if (!Number.isInteger(request.transitionMinutes) || request.transitionMinutes < 0) return false
  if (
    (request.maxDriveMiles != null &&
      (!Number.isFinite(request.maxDriveMiles) ||
        request.maxDriveMiles < 1 ||
        request.maxDriveMiles > 500)) ||
    (request.maxTotalMinutes != null &&
      (!Number.isInteger(request.maxTotalMinutes) ||
        request.maxTotalMinutes < 30 ||
        request.maxTotalMinutes > 1_440))
  )
    return false
  if (
    request.providerContract.maxRequests < 1 ||
    request.providerContract.maxCostUnits < 0 ||
    request.providerContract.timeoutMs < 1
  )
    return false
  const ids = new Set<string>()
  return request.stops.every((stop) => {
    if (ids.has(stop.id)) return false
    ids.add(stop.id)
    return (
      stop.id.length > 0 &&
      validCoordinate(stop.coordinate) &&
      Number.isInteger(stop.dwellMinutes) &&
      stop.dwellMinutes >= 5 &&
      stop.dwellMinutes <= 720 &&
      (stop.hours?.opensAt == null || Number.isInteger(stop.hours.opensAt)) &&
      (stop.hours?.closesAt == null || Number.isInteger(stop.hours.closesAt))
    )
  })
}

function permutations<T>(items: T[]): T[][] {
  if (items.length === 1) return [items]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  )
}

function compare(left: EvaluatedOrder, right: EvaluatedOrder): number {
  for (let index = 0; index < left.score.length; index += 1) {
    const leftPart = left.score[index]
    const rightPart = right.score[index]
    if (leftPart === rightPart) continue
    return typeof leftPart === 'string'
      ? leftPart.localeCompare(String(rightPart))
      : Number(leftPart) - Number(rightPart)
  }
  return 0
}

function evaluateOrder(
  order: CheckMyDayRequestStop[],
  request: CheckMyDayRequest,
  indexes: Map<string, number>,
  legs: Map<string, CoordinateMatrixLeg>,
  returnIndex?: number,
): EvaluatedOrder | null {
  let previousIndex = 0
  let clock = request.departureMinute
  let totalMiles = 0
  let totalTravelMinutes = 0
  let lateMinutes = 0
  let completedStores = 0
  let completedMust = 0
  let priorityPoints = 0
  const itinerary: CheckMyDayItineraryStop[] = []
  const warnings: string[] = []

  for (const [orderIndex, stop] of order.entries()) {
    const stopIndex = indexes.get(stop.id)
    if (stopIndex == null) return null
    const leg = legs.get(`${previousIndex}->${stopIndex}`)
    if (!leg) return null
    if (orderIndex > 0) clock += request.transitionMinutes
    clock += leg.minutes
    totalMiles += leg.miles
    totalTravelMinutes += leg.minutes

    let waitMinutes = 0
    let warning: string | undefined
    if (stop.kind === 'store') {
      if (!stop.hours || stop.hours.state === 'unknown') warning = 'Hours unavailable'
      else if (stop.hours.state === 'stale') warning = 'Hours need review'
      else if (stop.hours.opensAt != null && clock < stop.hours.opensAt) {
        waitMinutes = stop.hours.opensAt - clock
        clock = stop.hours.opensAt
      }
    }
    const arrivalMinute = clock
    const departureMinute = arrivalMinute + stop.dwellMinutes
    if (
      stop.kind === 'store' &&
      stop.hours?.state === 'verified' &&
      stop.hours.closesAt != null &&
      departureMinute > stop.hours.closesAt
    ) {
      lateMinutes += departureMinute - stop.hours.closesAt
      warning =
        arrivalMinute > stop.hours.closesAt ? 'Arrives after closing' : 'Dwell extends past closing'
    }
    const completedByClosing = stop.kind === 'rest' || !warning
    if (completedByClosing) {
      if (stop.kind === 'store') completedStores += 1
      if (stop.kind === 'store' && stop.priority === 'must') completedMust += 1
      priorityPoints += stop.priority === 'must' ? 3 : stop.priority === 'prefer' ? 2 : 1
    }
    if (warning) warnings.push(`${stop.name}: ${warning}.`)
    itinerary.push({ ...stop, arrivalMinute, departureMinute, waitMinutes, warning })
    clock = departureMinute
    previousIndex = stopIndex
  }

  if (returnIndex != null) {
    const returnLeg = legs.get(`${previousIndex}->${returnIndex}`)
    if (!returnLeg) return null
    clock += request.transitionMinutes + returnLeg.minutes
    totalMiles += returnLeg.miles
    totalTravelMinutes += returnLeg.minutes
  }

  const duration = clock - request.departureMinute
  const driveExcess =
    request.maxDriveMiles == null
      ? 0
      : Math.max(0, totalMiles - request.maxDriveMiles) / request.maxDriveMiles
  const timeExcess =
    request.maxTotalMinutes == null
      ? 0
      : Math.max(0, duration - request.maxTotalMinutes) / request.maxTotalMinutes
  const limitExcess = driveExcess + timeExcess
  const storeCount = order.filter((stop) => stop.kind === 'store').length
  const feasible = limitExcess === 0 && lateMinutes === 0 && completedStores === storeCount
  const originalPairs = itinerary
    .slice(1)
    .filter((stop, index) => stop.originalIndex === itinerary[index].originalIndex + 1).length

  return {
    itinerary,
    totalMiles,
    totalTravelMinutes,
    estimatedFinishMinute: clock,
    feasible,
    warnings,
    score: [
      limitExcess === 0 ? 0 : 1,
      -completedMust,
      -priorityPoints,
      -completedStores,
      limitExcess,
      lateMinutes,
      totalTravelMinutes,
      -originalPairs,
      itinerary.map((stop) => stop.id).join('\u0000'),
    ],
  }
}

function failureReason(status: ProviderFailureStatus): CheckMyDayFallbackReason {
  return status === 'outage' ? 'provider_outage' : status
}

export async function checkMyDay(
  request: CheckMyDayRequest,
  provider: CheckMyDayProvider,
): Promise<CheckMyDayOutcome> {
  if (!validRequest(request)) return fallback(request, 'invalid_input', 0)
  if (request.capability === 'blocked') return fallback(request, 'r01_blocked', 0)
  if (request.capability !== 'available') return fallback(request, 'provider_outage', 0)

  const coordinates = [
    request.origin,
    ...request.stops.map((stop) => stop.coordinate),
    ...(request.returnCoordinate ? [request.returnCoordinate] : []),
  ]
  const returnIndex = request.returnCoordinate ? coordinates.length - 1 : undefined
  const matrixRequest: CoordinateMatrixRequest = { coordinates, returnIndex }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve('timeout')
    }, request.providerContract.timeoutMs)
  })

  let response: CheckMyDayProviderResponse | 'timeout'
  try {
    response = await Promise.race([
      provider.getCoordinateMatrix(matrixRequest, { signal: controller.signal }),
      timeout,
    ])
  } catch {
    response = { status: 'outage', requestCount: 1, costUnits: 0 }
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (response === 'timeout')
    return fallback(request, 'timeout', coordinates.length, { requestCount: 1, costUnits: 0 })
  if (
    !Number.isInteger(response.requestCount) ||
    response.requestCount < 0 ||
    !Number.isFinite(response.costUnits) ||
    response.costUnits < 0
  )
    return fallback(request, 'contract_mismatch', coordinates.length, response)
  if (response.status !== 'ok')
    return fallback(request, failureReason(response.status), coordinates.length, response)
  if (response.requestCount < 1 || !Number.isFinite(Date.parse(response.generatedAt)))
    return fallback(request, 'contract_mismatch', coordinates.length, response)
  if (response.providerVersion !== request.providerContract.version || !response.attribution.trim())
    return fallback(request, 'contract_mismatch', coordinates.length, response)
  if (
    response.requestCount > request.providerContract.maxRequests ||
    response.costUnits > request.providerContract.maxCostUnits
  )
    return fallback(request, 'cost_control', coordinates.length, response)

  const indexes = new Map(request.stops.map((stop, index) => [stop.id, index + 1]))
  const matrix = new Map<string, CoordinateMatrixLeg>()
  for (const leg of response.legs) {
    if (
      !Number.isInteger(leg.fromIndex) ||
      !Number.isInteger(leg.toIndex) ||
      leg.fromIndex < 0 ||
      leg.toIndex < 0 ||
      leg.fromIndex >= coordinates.length ||
      leg.toIndex >= coordinates.length ||
      !Number.isFinite(leg.miles) ||
      !Number.isFinite(leg.minutes) ||
      leg.miles < 0 ||
      leg.minutes < 0
    )
      return fallback(request, 'contract_mismatch', coordinates.length, response)
    matrix.set(`${leg.fromIndex}->${leg.toIndex}`, leg)
  }

  const evaluated = permutations(request.stops)
    .map((order) => evaluateOrder(order, request, indexes, matrix, returnIndex))
    .filter((candidate): candidate is EvaluatedOrder => candidate !== null)
    .sort(compare)
  const best = evaluated[0]
  if (!best) return fallback(request, 'no_route', coordinates.length, response)

  const explanation = [
    `Suggestion considers verified hours, dwell time, a ${request.transitionMinutes}-minute transition, and supplied travel inputs.`,
    best.feasible
      ? 'The suggested order fits the selected limits and known closing times.'
      : 'The suggested order has the fewest higher-priority conflicts found within the supplied inputs.',
    ...best.warnings,
    'This is an explained feasible-order suggestion, not a claim of real-world optimality.',
  ]
  return {
    kind: 'suggestion',
    itinerary: best.itinerary,
    choices: {
      useSuggestedOrder: best.itinerary.map((stop) => stop.id),
      keepMyOrder: request.stops.map((stop) => stop.id),
    },
    totalMiles: best.totalMiles,
    totalTravelMinutes: best.totalTravelMinutes,
    estimatedFinishMinute: best.estimatedFinishMinute,
    feasible: best.feasible,
    explanation,
    optimalityClaim: false,
    matrixGeneratedAt: response.generatedAt,
    evidence: evidence(request, 'suggestion', coordinates.length, response),
  }
}
