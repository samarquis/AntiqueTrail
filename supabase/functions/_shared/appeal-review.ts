export type AppealReviewCommand =
  | { operation: 'request_assertion'; payload: { capabilityToken: string; idempotencyKey: string } }
  | {
      operation: 'complete_assertion'
      payload: { challengeId: string; idempotencyKey: string; ceremony: Record<string, string> }
    }
  | { operation: 'packet'; payload: { capabilityToken: string; assertionReceiptId: string } }
  | {
      operation: 'submit'
      payload: {
        capabilityToken: string
        assertionReceiptId: string
        packetHash: string
        outcome: 'restore' | 'uphold'
        reason: string
        idempotencyKey: string
      }
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const TOKEN = /^[A-Za-z0-9_-]{32,512}$/u
const B64 = /^[A-Za-z0-9_-]{1,8192}$/u
const HEX = /^[0-9a-f]{64}$/u

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid shape')
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value)))
    throw new Error('invalid shape')
}

function requiredText(value: unknown, expression: RegExp): value is string {
  return typeof value === 'string' && expression.test(value)
}

export function parseAppealReviewCommand(value: unknown): AppealReviewCommand {
  const command = object(value)
  exact(command, ['operation', 'payload'])
  const payload = object(command.payload)
  if (command.operation === 'request_assertion') {
    exact(payload, ['capabilityToken', 'idempotencyKey'])
    if (
      !requiredText(payload.capabilityToken, TOKEN) ||
      !requiredText(payload.idempotencyKey, UUID)
    )
      throw new Error('invalid capability')
  } else if (command.operation === 'complete_assertion') {
    exact(payload, ['challengeId', 'idempotencyKey', 'ceremony'])
    if (!requiredText(payload.challengeId, UUID) || !requiredText(payload.idempotencyKey, UUID))
      throw new Error('invalid id')
    const ceremony = object(payload.ceremony)
    const keys = ['credentialId', 'clientDataJSON', 'authenticatorData', 'signature']
    if (Object.keys(ceremony).some((key) => !keys.includes(key) && key !== 'userHandle'))
      throw new Error('invalid shape')
    for (const key of keys)
      if (!requiredText(ceremony[key], B64)) throw new Error('invalid ceremony')
    if (ceremony.userHandle != null && !requiredText(ceremony.userHandle, B64))
      throw new Error('invalid ceremony')
  } else if (command.operation === 'packet') {
    exact(payload, ['capabilityToken', 'assertionReceiptId'])
    if (
      !requiredText(payload.capabilityToken, TOKEN) ||
      !requiredText(payload.assertionReceiptId, UUID)
    )
      throw new Error('invalid capability')
  } else if (command.operation === 'submit') {
    exact(payload, [
      'capabilityToken',
      'assertionReceiptId',
      'packetHash',
      'outcome',
      'reason',
      'idempotencyKey',
    ])
    if (
      !requiredText(payload.capabilityToken, TOKEN) ||
      !requiredText(payload.assertionReceiptId, UUID) ||
      !requiredText(payload.packetHash, HEX) ||
      (payload.outcome !== 'restore' && payload.outcome !== 'uphold') ||
      typeof payload.reason !== 'string' ||
      payload.reason.trim().length < 1 ||
      payload.reason.length > 2000 ||
      !requiredText(payload.idempotencyKey, UUID)
    )
      throw new Error('invalid submission')
  } else throw new Error('invalid operation')
  return command as AppealReviewCommand
}

export interface AppealReviewVerifierOptions {
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: string[] }>
}

export function parseAppealReviewVerifierOptions(value: unknown): AppealReviewVerifierOptions {
  const input = object(value)
  if (!Array.isArray(input.allowCredentials) || input.allowCredentials.length < 1)
    throw new Error('invalid options')
  const allowCredentials = input.allowCredentials.map((candidate) => {
    const item = object(candidate)
    if (Object.keys(item).some((key) => !['id', 'type', 'transports'].includes(key)))
      throw new Error('invalid options')
    if (item.type !== 'public-key' || !requiredText(item.id, B64))
      throw new Error('invalid options')
    if (
      item.transports != null &&
      (!Array.isArray(item.transports) ||
        item.transports.some((t) => !requiredText(t, /^[a-z-]{1,16}$/u)))
    )
      throw new Error('invalid options')
    return {
      id: item.id,
      type: 'public-key' as const,
      ...(item.transports ? { transports: item.transports as string[] } : {}),
    }
  })
  return { allowCredentials }
}

export function parseAppealReviewVerifierProof(expectedChallengeId: string, value: unknown) {
  const proof = object(value)
  exact(proof, [
    'challengeId',
    'credentialIdDigest',
    'assertionDigest',
    'providerVerificationId',
    'providerKeyId',
    'signCount',
  ])
  if (
    proof.challengeId !== expectedChallengeId ||
    !requiredText(proof.credentialIdDigest, HEX) ||
    !requiredText(proof.assertionDigest, HEX) ||
    !requiredText(proof.providerVerificationId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u) ||
    !requiredText(proof.providerKeyId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u) ||
    typeof proof.signCount !== 'number' ||
    !Number.isSafeInteger(proof.signCount) ||
    proof.signCount < 0
  )
    throw new Error('invalid verification')
  return proof as {
    challengeId: string
    credentialIdDigest: string
    assertionDigest: string
    providerVerificationId: string
    providerKeyId: string
    signCount: number
  }
}
