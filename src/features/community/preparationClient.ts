export type PreparationOperation =
  | 'list'
  | 'detail'
  | 'prepare'
  | 'freeze'
  | 'sign_request'
  | 'sign'
  | 'cancel'

export interface CommunityPreparationRun {
  runId: string
  areaId: string
  areaName: string
  targetOrdinal: number
  attemptSequence: number
  state: 'prepared' | 'readiness_signed' | 'live' | 'withdrawn' | 'cancelled'
  version: number
  expectedRootVersion: number
  artifactDigest: string | null
  storeSetDigest: string | null
  readinessStatus: 'unsigned' | 'signed'
  receipts: Record<string, string | null>
}

export interface CommunityPreparationProjection {
  status: 'available' | 'blocked'
  root: {
    expectedVersion: number
    lastActivationOrdinal: number
    lastAttemptSequence: number
    activeRunId: string | null
  }
  runs: CommunityPreparationRun[]
}

export interface CommunityPreparationTransport {
  execute(operation: PreparationOperation, payload: Record<string, unknown>): Promise<unknown>
}

export interface CommunityPreparationClient {
  list(): Promise<CommunityPreparationProjection>
  detail(runId: string): Promise<CommunityPreparationProjection>
  prepare(input: Record<string, unknown>): Promise<unknown>
  freeze(input: Record<string, unknown>): Promise<unknown>
  requestSign(
    input: Record<string, unknown>,
  ): Promise<{ capabilityId: string; payloadDigest: string; expiresAt: string }>
  sign(input: Record<string, unknown>): Promise<unknown>
  cancel(input: Record<string, unknown>): Promise<unknown>
}

export class CommunityPreparationError extends Error {
  constructor() {
    super('Community preparation is unavailable. No public visibility or activation changed.')
    this.name = 'CommunityPreparationError'
  }
}

export function createCommunityPreparationClient(
  transport: CommunityPreparationTransport,
): CommunityPreparationClient {
  async function call<T>(
    operation: PreparationOperation,
    payload: Record<string, unknown>,
  ): Promise<T> {
    try {
      const result = await transport.execute(operation, payload)
      if (result === null || result === undefined) throw new CommunityPreparationError()
      return result as T
    } catch (error) {
      if (error instanceof CommunityPreparationError) throw error
      throw new CommunityPreparationError()
    }
  }
  return {
    list: () => call('list', {}),
    detail: (runId) => call('detail', { runId }),
    prepare: (input) => call('prepare', input),
    freeze: (input) => call('freeze', input),
    requestSign: (input) => call('sign_request', input),
    sign: (input) => call('sign', input),
    cancel: (input) => call('cancel', input),
  }
}

const unavailable = async (): Promise<never> => {
  throw new CommunityPreparationError()
}
export const unavailableCommunityPreparationClient: CommunityPreparationClient = {
  list: unavailable,
  detail: unavailable,
  prepare: unavailable,
  freeze: unavailable,
  requestSign: unavailable,
  sign: unavailable,
  cancel: unavailable,
}
