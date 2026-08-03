import type { DurableReadinessClient } from './types'

type ReadinessRpcName = 'readiness_get_status' | 'readiness_request_signing_challenge'

export const GENERIC_READINESS_ERROR =
  'Readiness evidence is unavailable. No readiness decision has been changed.'

export interface ReadinessRpcTransport {
  rpc(
    name: ReadinessRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export class ReadinessApiError extends Error {
  constructor() {
    super(GENERIC_READINESS_ERROR)
    this.name = 'ReadinessApiError'
  }
}

export function createReadinessClient(transport: ReadinessRpcTransport): DurableReadinessClient {
  async function call<T>(name: ReadinessRpcName, runId: string): Promise<T> {
    try {
      const result = await transport.rpc(name, { p_run_id: runId })
      if (result.error || !result.data) throw new ReadinessApiError()
      return result.data as T
    } catch (error) {
      if (error instanceof ReadinessApiError) throw error
      throw new ReadinessApiError()
    }
  }

  return {
    getStatus: (runId) => call('readiness_get_status', runId),
    requestSigningChallenge: (runId) => call('readiness_request_signing_challenge', runId),
  }
}

export const unavailableReadinessClient: DurableReadinessClient = {
  async getStatus() {
    throw new ReadinessApiError()
  },
  async requestSigningChallenge() {
    throw new ReadinessApiError()
  },
}
