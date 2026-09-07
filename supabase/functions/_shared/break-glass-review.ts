type BreakGlassReviewCommand =
  | { operation: 'packet'; payload: { capabilityToken: string } }
  | { operation: 'request_assertion'; payload: { capabilityToken: string; idempotencyKey: string } }
  | {
      operation: 'complete_assertion'
      payload: { challengeId: string; idempotencyKey: string; ceremony: Record<string, string> }
    }
  | {
      operation: 'submit'
      payload: {
        capabilityToken: string
        assertionReceiptId: string
        packetHash: string
        decision: 'Compliant' | 'Exception'
        reason: string
        followUpReference: string
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

export function parseBreakGlassReviewCommand(value: unknown): BreakGlassReviewCommand {
  const command = object(value)
  const operation = command.operation
  const payload = object(command.payload)
  if (operation === 'packet') {
    exact(payload, ['capabilityToken'])
    if (typeof payload.capabilityToken !== 'string' || !TOKEN.test(payload.capabilityToken))
      throw new Error('invalid capability')
  } else if (operation === 'request_assertion') {
    exact(payload, ['capabilityToken', 'idempotencyKey'])
    if (
      typeof payload.capabilityToken !== 'string' ||
      !TOKEN.test(payload.capabilityToken) ||
      typeof payload.idempotencyKey !== 'string' ||
      !UUID.test(payload.idempotencyKey)
    )
      throw new Error('invalid capability')
  } else if (operation === 'complete_assertion') {
    exact(payload, ['challengeId', 'idempotencyKey', 'ceremony'])
    if (
      typeof payload.challengeId !== 'string' ||
      !UUID.test(payload.challengeId) ||
      typeof payload.idempotencyKey !== 'string' ||
      !UUID.test(payload.idempotencyKey)
    )
      throw new Error('invalid id')
    const ceremony = object(payload.ceremony)
    exact(ceremony, [
      'credentialId',
      'clientDataJSON',
      'authenticatorData',
      'signature',
      ...(Object.hasOwn(ceremony, 'userHandle') ? ['userHandle'] : []),
    ])
    for (const key of ['credentialId', 'clientDataJSON', 'authenticatorData', 'signature'])
      if (typeof ceremony[key] !== 'string' || !B64.test(ceremony[key] as string))
        throw new Error('invalid ceremony')
    if (
      ceremony.userHandle != null &&
      (typeof ceremony.userHandle !== 'string' || !B64.test(ceremony.userHandle))
    )
      throw new Error('invalid ceremony')
  } else if (operation === 'submit') {
    exact(payload, [
      'capabilityToken',
      'assertionReceiptId',
      'packetHash',
      'decision',
      'reason',
      'followUpReference',
      'idempotencyKey',
    ])
    if (
      typeof payload.capabilityToken !== 'string' ||
      !TOKEN.test(payload.capabilityToken) ||
      typeof payload.assertionReceiptId !== 'string' ||
      !UUID.test(payload.assertionReceiptId) ||
      typeof payload.packetHash !== 'string' ||
      !HEX.test(payload.packetHash) ||
      (payload.decision !== 'Compliant' && payload.decision !== 'Exception') ||
      typeof payload.reason !== 'string' ||
      payload.reason.trim().length < 1 ||
      payload.reason.length > 2000 ||
      typeof payload.followUpReference !== 'string' ||
      payload.followUpReference.trim().length < 1 ||
      payload.followUpReference.length > 200 ||
      typeof payload.idempotencyKey !== 'string' ||
      !UUID.test(payload.idempotencyKey)
    )
      throw new Error('invalid submission')
  } else throw new Error('invalid operation')
  return command as BreakGlassReviewCommand
}

export interface BreakGlassVerification {
  challengeId: string
  credentialIdDigest: string
  assertionDigest: string
  providerVerificationId: string
  providerKeyId: string
  signCount: number
}

export function parseBreakGlassVerification(
  expectedChallengeId: string,
  value: unknown,
): BreakGlassVerification {
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
    typeof proof.credentialIdDigest !== 'string' ||
    !HEX.test(proof.credentialIdDigest) ||
    typeof proof.assertionDigest !== 'string' ||
    !HEX.test(proof.assertionDigest) ||
    typeof proof.providerVerificationId !== 'string' ||
    typeof proof.providerKeyId !== 'string' ||
    typeof proof.signCount !== 'number' ||
    !Number.isSafeInteger(proof.signCount)
  )
    throw new Error('invalid verification')
  return proof as BreakGlassVerification
}
