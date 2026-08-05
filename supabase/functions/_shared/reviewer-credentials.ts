export interface ReviewerBrowserCeremony {
  credentialId: string
  clientDataJSON: string
  attestationObject?: string
  authenticatorData?: string
  signature?: string
  userHandle?: string
}

export type ReviewerCredentialCommand =
  | {
      operation: 'request_registration'
      payload: { reviewerIdentityId: string; idempotencyKey: string }
    }
  | {
      operation: 'complete_registration' | 'complete_assertion'
      payload: { challengeId: string; idempotencyKey: string; ceremony: ReviewerBrowserCeremony }
    }
  | {
      operation: 'request_assertion'
      payload: { reviewerIdentityId: string; caseId: string; idempotencyKey: string }
    }
  | {
      operation: 'revoke'
      payload: { credentialRecordId: string; idempotencyKey: string }
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const B64 = /^[A-Za-z0-9_-]{1,8192}$/u
const HEX = /^[0-9a-f]{64}$/u

export type ReviewerVerification =
  | {
      ceremony: 'registration'
      challengeId: string
      credentialIdDigest: string
      publicKeyDigest: string
      providerCredentialId: string
      providerVerificationId: string
      providerKeyId: string
      discoverable: false
      signCount: number
    }
  | {
      ceremony: 'assertion'
      challengeId: string
      credentialIdDigest: string
      assertionDigest: string
      providerVerificationId: string
      providerKeyId: string
      signCount: number
    }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid shape')
  return value as Record<string, unknown>
}

function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value)))
    throw new Error('invalid shape')
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function parseReviewerCredentialCommand(value: unknown): ReviewerCredentialCommand {
  const command = object(value)
  exact(command, ['operation', 'payload'])
  const payload = object(command.payload)
  if (command.operation === 'request_registration') {
    exact(payload, ['reviewerIdentityId', 'idempotencyKey'])
    if (!uuid(payload.reviewerIdentityId) || !uuid(payload.idempotencyKey))
      throw new Error('invalid id')
  } else if (command.operation === 'request_assertion') {
    exact(payload, ['reviewerIdentityId', 'caseId', 'idempotencyKey'])
    if (!uuid(payload.reviewerIdentityId) || !uuid(payload.caseId) || !uuid(payload.idempotencyKey))
      throw new Error('invalid id')
  } else if (command.operation === 'revoke') {
    exact(payload, ['credentialRecordId', 'idempotencyKey'])
    if (!uuid(payload.credentialRecordId) || !uuid(payload.idempotencyKey))
      throw new Error('invalid id')
  } else if (['complete_registration', 'complete_assertion'].includes(String(command.operation))) {
    exact(payload, ['challengeId', 'idempotencyKey', 'ceremony'])
    if (!uuid(payload.challengeId) || !uuid(payload.idempotencyKey)) throw new Error('invalid id')
    const ceremony = object(payload.ceremony)
    const assertion = command.operation === 'complete_assertion'
    const required = assertion
      ? ['credentialId', 'clientDataJSON', 'authenticatorData', 'signature', 'userHandle']
      : ['credentialId', 'clientDataJSON', 'attestationObject']
    const allowed = assertion ? required : required
    if (Object.keys(ceremony).some((key) => !allowed.includes(key)))
      throw new Error('invalid shape')
    for (const key of required.filter((key) => key !== 'userHandle'))
      if (typeof ceremony[key] !== 'string' || !B64.test(ceremony[key] as string))
        throw new Error('invalid ceremony')
    if (
      ceremony.userHandle != null &&
      (typeof ceremony.userHandle !== 'string' || !B64.test(ceremony.userHandle))
    )
      throw new Error('invalid ceremony')
  } else throw new Error('invalid operation')
  return command as unknown as ReviewerCredentialCommand
}

export function parseReviewerVerification(
  ceremony: 'registration' | 'assertion',
  expectedChallengeId: string,
  value: unknown,
): ReviewerVerification {
  const proof = object(value)
  const required =
    ceremony === 'registration'
      ? [
          'challengeId',
          'credentialIdDigest',
          'publicKeyDigest',
          'providerCredentialId',
          'providerVerificationId',
          'providerKeyId',
          'discoverable',
          'signCount',
        ]
      : [
          'challengeId',
          'credentialIdDigest',
          'assertionDigest',
          'providerVerificationId',
          'providerKeyId',
          'signCount',
        ]
  exact(proof, required)
  if (
    proof.challengeId !== expectedChallengeId ||
    typeof proof.credentialIdDigest !== 'string' ||
    !HEX.test(proof.credentialIdDigest) ||
    typeof proof.providerVerificationId !== 'string' ||
    typeof proof.providerKeyId !== 'string' ||
    typeof proof.signCount !== 'number' ||
    !Number.isSafeInteger(proof.signCount)
  )
    throw new Error('invalid verification')
  if (
    ceremony === 'registration' &&
    (typeof proof.publicKeyDigest !== 'string' ||
      !HEX.test(proof.publicKeyDigest) ||
      typeof proof.providerCredentialId !== 'string' ||
      proof.discoverable !== false)
  )
    throw new Error('invalid verification')
  if (
    ceremony === 'assertion' &&
    (typeof proof.assertionDigest !== 'string' || !HEX.test(proof.assertionDigest))
  )
    throw new Error('invalid verification')
  return { ceremony, ...proof } as unknown as ReviewerVerification
}
