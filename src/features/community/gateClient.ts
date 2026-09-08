export type CommunityGateOperation = 'packet' | 'request' | 'decide'

export interface CommunityGatePacket {
  runId: string
  areaId: string
  areaName: string
  version: number
  frozenEvidenceDigest: string
  predicateOutcomes: Record<string, boolean | number>
  failureCodes: string[]
  priorDecision: string | null
}

export interface CommunityGateClient {
  packet(runId: string): Promise<CommunityGatePacket>
  request(
    runId: string,
    decision: 'pass' | 'reject',
  ): Promise<{ challengeId: string; payloadDigest: string; expiresAt: string; decision: string }>
  decide(input: {
    runId: string
    challengeId: string
    payloadDigest: string
    decision: 'pass' | 'reject'
    expectedRunVersion: number
    idempotencyKey: string
  }): Promise<unknown>
}

export class CommunityGateError extends Error {
  constructor() {
    super('The current-area evidence gate is unavailable. No visibility or run state changed.')
    this.name = 'CommunityGateError'
  }
}

export function createCommunityGateClient(transport: {
  execute(operation: CommunityGateOperation, payload: Record<string, unknown>): Promise<unknown>
}): CommunityGateClient {
  async function call<T>(
    operation: CommunityGateOperation,
    payload: Record<string, unknown>,
  ): Promise<T> {
    try {
      const result = await transport.execute(operation, payload)
      if (result === null || result === undefined) throw new CommunityGateError()
      return result as T
    } catch (error) {
      if (error instanceof CommunityGateError) throw error
      throw new CommunityGateError()
    }
  }
  return {
    packet: (runId) => call('packet', { runId }),
    request: (runId, decision) => call('request', { runId, decision }),
    decide: (input) => call('decide', input),
  }
}

const unavailable = async (): Promise<never> => {
  throw new CommunityGateError()
}
export const unavailableCommunityGateClient: CommunityGateClient = {
  packet: unavailable,
  request: unavailable,
  decide: unavailable,
}
