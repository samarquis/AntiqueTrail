export type CommunityOperation =
  | 'prepare'
  | 'freeze'
  | 'sign'
  | 'activate'
  | 'rollback'
  | 'reactivate'
  | 'cancel'

interface VersionedPayload {
  runId: string
  expectedRootVersion: number
  idempotencyKey: string
}

interface RunVersionedPayload extends VersionedPayload {
  expectedRunVersion: number
}

export type CommunityDeploymentCommand =
  | {
      operation: 'prepare'
      payload: VersionedPayload & {
        areaSlug: string
        targetOrdinal: 1 | 2 | 3
        selectionReceiptId: string
        prerequisiteReceiptId: string
      }
    }
  | {
      operation: 'freeze'
      payload: RunVersionedPayload & {
        freezeReceiptId: string
        artifactDigest: string
        storeSetDigest: string
        storeIds: string[]
      }
    }
  | {
      operation: 'sign'
      payload: RunVersionedPayload & { readinessReceiptId: string }
    }
  | {
      operation: 'activate'
      payload: RunVersionedPayload & { activationReceiptId: string }
    }
  | {
      operation: 'rollback'
      payload: RunVersionedPayload & { rollbackReceiptId: string }
    }
  | {
      operation: 'reactivate'
      payload: RunVersionedPayload & { reactivationReceiptId: string }
    }
  | {
      operation: 'cancel'
      payload: RunVersionedPayload & { cancellationReceiptId: string; reason: string }
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab0-9a-f][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIGEST = /^[0-9a-f]{64}$/
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const AREA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const operationKeys: Record<CommunityOperation, readonly string[]> = {
  prepare: [
    'runId',
    'areaSlug',
    'targetOrdinal',
    'selectionReceiptId',
    'prerequisiteReceiptId',
    'expectedRootVersion',
    'idempotencyKey',
  ],
  freeze: [
    'runId',
    'freezeReceiptId',
    'expectedRootVersion',
    'expectedRunVersion',
    'artifactDigest',
    'storeSetDigest',
    'storeIds',
    'idempotencyKey',
  ],
  sign: [
    'runId',
    'readinessReceiptId',
    'expectedRootVersion',
    'expectedRunVersion',
    'idempotencyKey',
  ],
  activate: [
    'runId',
    'activationReceiptId',
    'expectedRootVersion',
    'expectedRunVersion',
    'idempotencyKey',
  ],
  rollback: [
    'runId',
    'rollbackReceiptId',
    'expectedRootVersion',
    'expectedRunVersion',
    'idempotencyKey',
  ],
  reactivate: [
    'runId',
    'reactivationReceiptId',
    'expectedRootVersion',
    'expectedRunVersion',
    'idempotencyKey',
  ],
  cancel: [
    'runId',
    'cancellationReceiptId',
    'reason',
    'expectedRootVersion',
    'expectedRunVersion',
    'idempotencyKey',
  ],
}

export function parseCommunityDeploymentCommand(value: unknown): CommunityDeploymentCommand {
  if (!isRecord(value) || !exactKeys(value, ['operation', 'payload'])) unavailable()
  const operation = value.operation
  const payload = value.payload
  if (
    !isOperation(operation) ||
    !isRecord(payload) ||
    !exactKeys(payload, operationKeys[operation])
  )
    unavailable()

  requireUuid(payload.runId)
  requirePositiveInteger(payload.expectedRootVersion)
  if (typeof payload.idempotencyKey !== 'string' || !IDEMPOTENCY.test(payload.idempotencyKey))
    unavailable()

  if (operation === 'prepare') {
    if (
      typeof payload.areaSlug !== 'string' ||
      payload.areaSlug.length > 80 ||
      !AREA.test(payload.areaSlug) ||
      ![1, 2, 3].includes(payload.targetOrdinal as number)
    )
      unavailable()
    requireUuid(payload.selectionReceiptId)
    requireUuid(payload.prerequisiteReceiptId)
  } else {
    requirePositiveInteger(payload.expectedRunVersion)
    const receiptKey = `${operation === 'sign' ? 'readiness' : operation}ReceiptId`
    requireUuid(payload[receiptKey])
  }

  if (operation === 'freeze') {
    if (
      typeof payload.artifactDigest !== 'string' ||
      !DIGEST.test(payload.artifactDigest) ||
      typeof payload.storeSetDigest !== 'string' ||
      !DIGEST.test(payload.storeSetDigest) ||
      !Array.isArray(payload.storeIds) ||
      payload.storeIds.length < 2 ||
      payload.storeIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(payload.storeIds).size !== payload.storeIds.length
    )
      unavailable()
  }
  if (
    operation === 'cancel' &&
    (typeof payload.reason !== 'string' ||
      payload.reason !== payload.reason.trim() ||
      payload.reason.length < 1 ||
      payload.reason.length > 500 ||
      [...payload.reason].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      }))
  )
    unavailable()

  return value as CommunityDeploymentCommand
}

export function constrainedDeploymentJwt(jwt: string, nowSeconds = Date.now() / 1_000): boolean {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3 || !parts[2]) return false
    const payload = JSON.parse(decodeBase64Url(parts[1])) as unknown
    return (
      isRecord(payload) &&
      payload.role === 'community_deployment_service' &&
      typeof payload.exp === 'number' &&
      payload.exp > nowSeconds
    )
  } catch {
    return false
  }
}

export async function communityRequestAuthorized(
  request: Request,
  secret: string,
): Promise<boolean> {
  if (secret.length < 32) return false
  const candidate = request.headers.get('x-antique-trail-community-command')
  if (!candidate) return false
  const [expectedDigest, candidateDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate)),
  ])
  const expected = new Uint8Array(expectedDigest)
  const actual = new Uint8Array(candidateDigest)
  let mismatch = expected.length ^ actual.length
  for (let index = 0; index < expected.length; index += 1)
    mismatch |= expected[index] ^ (actual[index] ?? 0)
  return mismatch === 0
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOperation(value: unknown): value is CommunityOperation {
  return typeof value === 'string' && Object.hasOwn(operationKeys, value)
}

function requireUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) unavailable()
}

function requirePositiveInteger(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) unavailable()
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
}

function unavailable(): never {
  throw new Error('community_command_unavailable')
}
