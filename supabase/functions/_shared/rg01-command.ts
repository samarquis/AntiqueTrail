export type RG01Decision = 'pass' | 'reject'

export interface RG01BeginPayload {
  runId: string
  idempotencyKey: string
  windowStart: string
  windowEnd: string
  supersedesReceiptId?: string
}

export type RG01Command =
  | { operation: 'status'; payload: { runId?: string } }
  | { operation: 'begin'; payload: RG01BeginPayload }
  | { operation: 'freeze'; payload: { runId: string; idempotencyKey: string } }
  | {
      operation: 'request_decision'
      payload: { runId: string; decision: RG01Decision; idempotencyKey: string }
    }
  | {
      operation: 'consume_decision'
      payload: { challengeId: string; payloadDigest: string; idempotencyKey: string }
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DIGEST = /^[0-9a-f]{64}$/u

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid shape')
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const keys = Object.keys(value).sort()
  const allowed = [...required, ...optional]
  if (required.some((key) => !(key in value)) || keys.some((key) => !allowed.includes(key)))
    throw new Error('invalid shape')
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function parseRG01Command(value: unknown): RG01Command {
  const command = record(value)
  exact(command, ['operation', 'payload'])
  const payload = record(command.payload)
  if (command.operation === 'status') {
    exact(payload, [], ['runId'])
    if (payload.runId != null && !uuid(payload.runId)) throw new Error('invalid run')
  } else if (command.operation === 'begin') {
    exact(payload, ['runId', 'idempotencyKey', 'windowStart', 'windowEnd'], ['supersedesReceiptId'])
    if (!uuid(payload.runId) || !uuid(payload.idempotencyKey)) throw new Error('invalid id')
    if (payload.supersedesReceiptId != null && !uuid(payload.supersedesReceiptId))
      throw new Error('invalid supersession')
    const start = Date.parse(String(payload.windowStart))
    const end = Date.parse(String(payload.windowEnd))
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 180 * 86_400_000
    )
      throw new Error('invalid window')
  } else if (command.operation === 'freeze') {
    exact(payload, ['runId', 'idempotencyKey'])
    if (!uuid(payload.runId) || !uuid(payload.idempotencyKey)) throw new Error('invalid id')
  } else if (command.operation === 'request_decision') {
    exact(payload, ['runId', 'decision', 'idempotencyKey'])
    if (
      !uuid(payload.runId) ||
      !uuid(payload.idempotencyKey) ||
      !['pass', 'reject'].includes(String(payload.decision))
    )
      throw new Error('invalid decision')
  } else if (command.operation === 'consume_decision') {
    exact(payload, ['challengeId', 'payloadDigest', 'idempotencyKey'])
    if (!uuid(payload.challengeId) || !uuid(payload.idempotencyKey)) throw new Error('invalid id')
    if (typeof payload.payloadDigest !== 'string' || !DIGEST.test(payload.payloadDigest))
      throw new Error('invalid digest')
  } else throw new Error('invalid operation')
  return command as unknown as RG01Command
}
