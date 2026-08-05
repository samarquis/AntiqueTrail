import type { RoutingProviderResult } from '../../../supabase/functions/_shared/routing-provider'
import type { RoutingEdgeTransport } from './providerAdapter'

interface RoutingHttpTransportOptions {
  endpoint: string
  getAccessToken: () => Promise<string>
  fetcher?: typeof fetch
}

const failure = (): RoutingProviderResult => ({
  status: 'outage',
  requestCount: 0,
  costUnits: 0,
})

function isResult(value: unknown): value is RoutingProviderResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return (
    typeof result.status === 'string' &&
    Number.isInteger(result.requestCount) &&
    typeof result.costUnits === 'number'
  )
}

export function createRoutingProviderHttpTransport({
  endpoint,
  getAccessToken,
  fetcher = fetch,
}: RoutingHttpTransportOptions): RoutingEdgeTransport {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
    throw new Error('Routing provider endpoint must use HTTPS')
  return {
    async execute(input, { signal }) {
      try {
        const token = await getAccessToken()
        if (!token) return failure()
        const response = await fetcher(url.toString(), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(input),
          signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
          return failure()
        const result: unknown = await response.json()
        return isResult(result) ? result : failure()
      } catch {
        return signal.aborted ? { status: 'timeout', requestCount: 0, costUnits: 0 } : failure()
      }
    },
  }
}
