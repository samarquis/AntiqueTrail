export type RoutingFailureStatus =
  | 'timeout'
  | 'quota'
  | 'revoked'
  | 'outage'
  | 'temporary_market'
  | 'no_route'

export interface RoutingCoordinate {
  latitude: number
  longitude: number
}

export interface RoutingMatrixInput {
  operation: 'matrix'
  idempotencyKey: string
  explicitAction: boolean
  coordinates: RoutingCoordinate[]
  returnIndex?: number
}

export interface RoutingGeocodeInput {
  operation: 'geocode'
  idempotencyKey: string
  explicitAction: boolean
  text: string
  purpose: 'start' | 'return' | 'rest'
}

export type RoutingOperationInput = RoutingMatrixInput | RoutingGeocodeInput

export interface RoutingOperationalEvidence {
  providerOperationId?: string
  providerVersion?: string
  attribution?: string
  requestCount: number
  costUnits: number
}

export interface RoutingMatrixSuccess extends RoutingOperationalEvidence {
  status: 'ok'
  providerOperationId: string
  providerVersion: string
  attribution: string
  generatedAt: string
  legs: Array<{
    fromIndex: number
    toIndex: number
    miles: number
    minutes: number
  }>
}

export interface RoutingGeocodeCandidate extends RoutingCoordinate {
  label: string
  address: string
}

export interface RoutingGeocodeSuccess extends RoutingOperationalEvidence {
  status: 'ok'
  providerOperationId: string
  providerVersion: string
  attribution: string
  generatedAt: string
  candidates: RoutingGeocodeCandidate[]
}

export type RoutingProviderResult =
  | RoutingMatrixSuccess
  | RoutingGeocodeSuccess
  | (RoutingOperationalEvidence & { status: RoutingFailureStatus })

export interface RoutingOperationDependencies {
  reserve(input: {
    operation: RoutingOperationInput['operation']
    idempotencyKey: string
    explicitAction: true
    pointCount: number
    coordinates?: RoutingCoordinate[]
    returnIndex?: number
  }): Promise<
    | { state: 'blocked'; reason: 'r01_blocked' | 'quota' | 'revoked' }
    | { state: 'reserved' | 'reconciliation_required'; operationId: string }
  >
  begin(
    operationId: string,
    idempotencyKey: string,
  ): Promise<
    | { state: 'blocked'; reason: 'r01_blocked' | 'quota' | 'revoked' }
    | { state: 'calling' | 'reconciliation_required' }
  >
  callMatrix(input: RoutingMatrixInput, signal: AbortSignal): Promise<RoutingProviderResult>
  callGeocode(input: RoutingGeocodeInput, signal: AbortSignal): Promise<RoutingProviderResult>
  reconcile(input: {
    operationId: string
    operation: RoutingOperationInput['operation']
    idempotencyKey: string
    signal: AbortSignal
  }): Promise<RoutingProviderResult>
  settle(input: {
    operationId: string
    idempotencyKey: string
    outcome: RoutingProviderResult['status'] | 'unknown'
    providerOperationId?: string
    providerVersion?: string
    attribution?: string
    requestCount: number
    costUnits: number
  }): Promise<void>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function coordinate(value: RoutingCoordinate): RoutingCoordinate | undefined {
  if (
    !Number.isFinite(value.latitude) ||
    !Number.isFinite(value.longitude) ||
    value.latitude < -90 ||
    value.latitude > 90 ||
    value.longitude < -180 ||
    value.longitude > 180
  )
    return
  return {
    latitude: Number(value.latitude.toFixed(6)),
    longitude: Number(value.longitude.toFixed(6)),
  }
}

function normalizedInput(input: RoutingOperationInput): RoutingOperationInput | undefined {
  if (!input.explicitAction || !UUID.test(input.idempotencyKey)) return
  if (input.operation === 'matrix') {
    if (
      input.coordinates.length < 2 ||
      input.coordinates.length > 10 ||
      (input.returnIndex != null &&
        (!Number.isInteger(input.returnIndex) ||
          input.returnIndex < 1 ||
          input.returnIndex !== input.coordinates.length - 1))
    )
      return
    const coordinates = input.coordinates.map(coordinate)
    if (coordinates.some((value) => !value)) return
    return { ...input, explicitAction: true, coordinates: coordinates as RoutingCoordinate[] }
  }
  const text = input.text.normalize('NFKC').trim()
  if (
    text.length < 1 ||
    text.length > 160 ||
    /[\p{Cc}\p{Cf}]/u.test(text) ||
    !['start', 'return', 'rest'].includes(input.purpose)
  )
    return
  return { ...input, explicitAction: true, text }
}

function validEvidence(value: RoutingProviderResult): boolean {
  return (
    Number.isInteger(value.requestCount) &&
    value.requestCount >= 0 &&
    value.requestCount <= 8 &&
    Number.isFinite(value.costUnits) &&
    value.costUnits >= 0 &&
    value.costUnits <= 1_000_000 &&
    (value.providerOperationId == null ||
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value.providerOperationId)) &&
    (value.providerVersion == null ||
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.providerVersion)) &&
    (value.attribution == null ||
      (value.attribution === value.attribution.trim() && value.attribution.length <= 240))
  )
}

function validResult(
  operation: RoutingOperationInput['operation'],
  result: RoutingProviderResult,
): boolean {
  if (!validEvidence(result)) return false
  if (result.status !== 'ok') return true
  if (
    !result.providerOperationId ||
    !result.providerVersion ||
    !result.attribution ||
    !Number.isFinite(Date.parse(result.generatedAt))
  )
    return false
  if (operation === 'matrix') {
    if (!('legs' in result) || result.legs.length > 100) return false
    return result.legs.every(
      (leg) =>
        Number.isInteger(leg.fromIndex) &&
        Number.isInteger(leg.toIndex) &&
        leg.fromIndex >= 0 &&
        leg.toIndex >= 0 &&
        Number.isFinite(leg.miles) &&
        Number.isFinite(leg.minutes) &&
        leg.miles >= 0 &&
        leg.minutes >= 0,
    )
  }
  if (!('candidates' in result) || result.candidates.length > 5) return false
  return result.candidates.every(
    (candidate) =>
      coordinate(candidate) != null &&
      candidate.label === candidate.label.trim() &&
      candidate.label.length >= 1 &&
      candidate.label.length <= 160 &&
      candidate.address === candidate.address.trim() &&
      candidate.address.length >= 1 &&
      candidate.address.length <= 240,
  )
}

const blocked = (status: 'quota' | 'revoked'): RoutingProviderResult => ({
  status,
  requestCount: 0,
  costUnits: 0,
})

export async function executeRoutingOperation(
  rawInput: RoutingOperationInput,
  dependencies: RoutingOperationDependencies,
  signal: AbortSignal,
): Promise<RoutingProviderResult> {
  const input = normalizedInput(rawInput)
  if (!input) return blocked('revoked')
  const reservation = await dependencies.reserve({
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    explicitAction: true,
    pointCount: input.operation === 'matrix' ? input.coordinates.length : 0,
    coordinates: input.operation === 'matrix' ? input.coordinates : undefined,
    returnIndex: input.operation === 'matrix' ? input.returnIndex : undefined,
  })
  if (reservation.state === 'blocked')
    return blocked(reservation.reason === 'quota' ? 'quota' : 'revoked')

  let result: RoutingProviderResult
  try {
    if (reservation.state === 'reconciliation_required') {
      result = await dependencies.reconcile({
        operationId: reservation.operationId,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        signal,
      })
    } else {
      const begun = await dependencies.begin(reservation.operationId, input.idempotencyKey)
      if (begun.state === 'blocked') {
        result = blocked(begun.reason === 'quota' ? 'quota' : 'revoked')
      } else if (begun.state === 'reconciliation_required') {
        result = await dependencies.reconcile({
          operationId: reservation.operationId,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
          signal,
        })
      } else {
        result =
          input.operation === 'matrix'
            ? await dependencies.callMatrix(input, signal)
            : await dependencies.callGeocode(input, signal)
      }
    }
  } catch {
    result = {
      status: signal.aborted ? 'timeout' : 'outage',
      requestCount: 1,
      costUnits: 0,
    }
  }
  if (!validResult(input.operation, result)) {
    result = { status: 'outage', requestCount: 1, costUnits: 0 }
  }
  await dependencies.settle({
    operationId: reservation.operationId,
    idempotencyKey: input.idempotencyKey,
    outcome: result.status,
    providerOperationId: result.providerOperationId,
    providerVersion: result.providerVersion,
    attribution: result.attribution,
    requestCount: result.requestCount,
    costUnits: result.costUnits,
  })
  return result
}
