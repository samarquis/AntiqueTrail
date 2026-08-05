import type {
  RG01BeginPayload,
  RG01Command,
  RG01Decision,
} from '../../../supabase/functions/_shared/rg01-command'

export interface RG01Transport {
  execute(command: RG01Command): Promise<unknown>
}

export const GENERIC_RG01_ERROR =
  'RG-01 evidence is unavailable. No receipt or geographic expansion has changed.'

export class RG01CommandError extends Error {
  constructor() {
    super(GENERIC_RG01_ERROR)
    this.name = 'RG01CommandError'
  }
}

export interface RG01Client {
  status(runId?: string): Promise<unknown>
  begin(payload: RG01BeginPayload): Promise<unknown>
  freeze(runId: string, idempotencyKey: string): Promise<unknown>
  requestDecision(runId: string, decision: RG01Decision, idempotencyKey: string): Promise<unknown>
  consumeDecision(
    challengeId: string,
    payloadDigest: string,
    idempotencyKey: string,
  ): Promise<unknown>
}

export function createRG01Client(transport: RG01Transport): RG01Client {
  const execute = async (command: RG01Command) => {
    try {
      return await transport.execute(command)
    } catch {
      throw new RG01CommandError()
    }
  }
  return {
    status: (runId) => execute({ operation: 'status', payload: runId ? { runId } : {} }),
    begin: (payload) => execute({ operation: 'begin', payload }),
    freeze: (runId, idempotencyKey) =>
      execute({ operation: 'freeze', payload: { runId, idempotencyKey } }),
    requestDecision: (runId, decision, idempotencyKey) =>
      execute({ operation: 'request_decision', payload: { runId, decision, idempotencyKey } }),
    consumeDecision: (challengeId, payloadDigest, idempotencyKey) =>
      execute({
        operation: 'consume_decision',
        payload: { challengeId, payloadDigest, idempotencyKey },
      }),
  }
}
