export type CommunityUserOperation =
  | 'list'
  | 'detail'
  | 'prepare'
  | 'freeze'
  | 'sign_request'
  | 'sign'
  | 'cancel'
export type CommunityGateOperation = 'packet' | 'request' | 'decide'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DIGEST = /^[0-9a-f]{64}$/
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function parseCommunityUserCommand(value: unknown): {
  operation: CommunityUserOperation
  payload: Record<string, unknown>
} {
  if (!record(value) || typeof value.operation !== 'string' || !record(value.payload)) invalid()
  const operation = value.operation
  const payload = value.payload
  const keys: Record<CommunityUserOperation, string[]> = {
    list: [],
    detail: ['runId'],
    prepare: [
      'runId',
      'areaSlug',
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
    sign_request: ['runId', 'readinessReceiptId', 'expectedRootVersion', 'expectedRunVersion'],
    sign: [
      'runId',
      'readinessReceiptId',
      'capabilityId',
      'payloadDigest',
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
  if (!isCommunityUserOperation(operation)) invalid()
  exactKeys(payload, keys[operation])
  if (operation === 'list') return { operation, payload }
  if (operation === 'detail') requireUuid(payload.runId)
  else {
    requireUuid(payload.runId)
    requirePositiveInteger(payload.expectedRootVersion)
    if (operation !== 'sign_request') requireKey(payload.idempotencyKey)
    if (operation !== 'prepare') requirePositiveInteger(payload.expectedRunVersion)
    const receiptKey =
      operation === 'freeze'
        ? 'freezeReceiptId'
        : operation === 'sign' || operation === 'sign_request'
          ? 'readinessReceiptId'
          : operation === 'cancel'
            ? 'cancellationReceiptId'
            : ''
    if (operation === 'prepare') {
      if (
        typeof payload.areaSlug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.areaSlug) ||
        payload.areaSlug.length > 80
      )
        invalid()
      requireUuid(payload.selectionReceiptId)
      requireUuid(payload.prerequisiteReceiptId)
    } else requireUuid(payload[receiptKey])
    if (operation === 'sign') {
      requireUuid(payload.capabilityId)
      if (typeof payload.payloadDigest !== 'string' || !DIGEST.test(payload.payloadDigest))
        invalid()
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
        invalid()
    }
    if (
      operation === 'cancel' &&
      (typeof payload.reason !== 'string' ||
        payload.reason.trim() !== payload.reason ||
        payload.reason.length < 1 ||
        payload.reason.length > 500 ||
        [...payload.reason].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ))
    )
      invalid()
  }
  return { operation, payload }
}

export function parseCommunityGateCommand(value: unknown): {
  operation: CommunityGateOperation
  payload: Record<string, unknown>
} {
  if (!record(value) || typeof value.operation !== 'string' || !record(value.payload)) invalid()
  const operation = value.operation
  const payload = value.payload
  const expected = {
    packet: ['runId'],
    request: ['runId', 'decision'],
    decide: [
      'runId',
      'challengeId',
      'payloadDigest',
      'decision',
      'expectedRunVersion',
      'idempotencyKey',
    ],
  } as Record<CommunityGateOperation, string[]>
  if (!isCommunityGateOperation(operation)) invalid()
  exactKeys(payload, expected[operation])
  requireUuid(payload.runId)
  if (operation !== 'packet') {
    if (payload.decision !== 'pass' && payload.decision !== 'reject') invalid()
  }
  if (operation === 'decide') {
    requireUuid(payload.challengeId)
    if (typeof payload.payloadDigest !== 'string' || !DIGEST.test(payload.payloadDigest)) invalid()
    requirePositiveInteger(payload.expectedRunVersion)
    requireKey(payload.idempotencyKey)
  }
  return { operation, payload }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isCommunityUserOperation(value: string): value is CommunityUserOperation {
  return ['list', 'detail', 'prepare', 'freeze', 'sign_request', 'sign', 'cancel'].includes(
    value as CommunityUserOperation,
  )
}
function isCommunityGateOperation(value: string): value is CommunityGateOperation {
  return ['packet', 'request', 'decide'].includes(value as CommunityGateOperation)
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    invalid()
}
function requireUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid()
}
function requirePositiveInteger(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid()
}
function requireKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !KEY.test(value)) invalid()
}
function invalid(): never {
  throw new Error('community_command_unavailable')
}
