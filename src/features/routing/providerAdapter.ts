import type {
  CheckMyDayProvider,
  CheckMyDayProviderResponse,
  CoordinateMatrixRequest,
} from './checkMyDay'
import type {
  RoutingFailureStatus,
  RoutingGeocodeCandidate,
  RoutingGeocodeInput,
  RoutingGeocodeSuccess,
  RoutingMatrixInput,
  RoutingMatrixSuccess,
  RoutingProviderResult,
} from '../../../supabase/functions/_shared/routing-provider'

export interface RoutingEdgeTransport {
  execute(
    input: RoutingMatrixInput | RoutingGeocodeInput,
    options: { signal: AbortSignal },
  ): Promise<RoutingProviderResult>
}

function aborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException('Routing timed out', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}

function matrixResponse(result: RoutingProviderResult): CheckMyDayProviderResponse | undefined {
  if (result.status !== 'ok') {
    if (result.status === 'timeout') return
    return {
      status: result.status,
      requestCount: result.requestCount,
      costUnits: result.costUnits,
    }
  }
  if (!('legs' in result))
    return { status: 'outage', requestCount: result.requestCount, costUnits: result.costUnits }
  const matrix = result as RoutingMatrixSuccess
  return {
    status: 'ok',
    providerVersion: matrix.providerVersion,
    attribution: matrix.attribution,
    generatedAt: matrix.generatedAt,
    requestCount: matrix.requestCount,
    costUnits: matrix.costUnits,
    legs: matrix.legs,
  }
}

export function createProviderBackedCheckMyDay(
  transport: RoutingEdgeTransport,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): CheckMyDayProvider {
  return {
    async getCoordinateMatrix(request: CoordinateMatrixRequest, options: { signal: AbortSignal }) {
      const result = await transport.execute(
        {
          operation: 'matrix',
          idempotencyKey: createIdempotencyKey(),
          explicitAction: true,
          coordinates: request.coordinates,
          ...(request.returnIndex == null ? {} : { returnIndex: request.returnIndex }),
        },
        options,
      )
      const response = matrixResponse(result)
      return response ?? aborted(options.signal)
    },
  }
}

export type GeocodeResult =
  | {
      status: 'ok'
      candidates: RoutingGeocodeCandidate[]
      selectedCandidate?: undefined
      providerVersion: string
      attribution: string
      requestCount: number
      costUnits: number
    }
  | { status: RoutingFailureStatus; requestCount: number; costUnits: number }

export interface ProviderBackedGeocoder {
  search(
    text: string,
    purpose: RoutingGeocodeInput['purpose'],
    options: { signal: AbortSignal },
  ): Promise<GeocodeResult>
}

export function createProviderBackedGeocoder(
  transport: RoutingEdgeTransport,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): ProviderBackedGeocoder {
  return {
    async search(text, purpose, options) {
      const result = await transport.execute(
        {
          operation: 'geocode',
          idempotencyKey: createIdempotencyKey(),
          explicitAction: true,
          text: text.normalize('NFKC').trim(),
          purpose,
        },
        options,
      )
      if (result.status !== 'ok')
        return {
          status: result.status,
          requestCount: result.requestCount,
          costUnits: result.costUnits,
        }
      if (!('candidates' in result))
        return { status: 'outage', requestCount: result.requestCount, costUnits: result.costUnits }
      const geocode = result as RoutingGeocodeSuccess
      return {
        status: 'ok',
        candidates: geocode.candidates,
        selectedCandidate: undefined,
        providerVersion: geocode.providerVersion,
        attribution: geocode.attribution,
        requestCount: geocode.requestCount,
        costUnits: geocode.costUnits,
      }
    },
  }
}
