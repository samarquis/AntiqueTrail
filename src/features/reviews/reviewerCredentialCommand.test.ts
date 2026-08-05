import { describe, expect, it } from 'vitest'
import {
  parseReviewerCredentialCommand,
  parseReviewerVerification,
} from '../../../supabase/functions/_shared/reviewer-credentials'

const id = '11111111-1111-4111-8111-111111111111'
const key = '22222222-2222-4222-8222-222222222222'
const capabilityToken = 'A'.repeat(43)

describe('reviewer credential command allowlist', () => {
  it.each(['activeCredentialCount', 'verified', 'providerVerificationId', 'assertionDigest'])(
    'rejects browser-supplied %s',
    (field) => {
      expect(() =>
        parseReviewerCredentialCommand({
          operation: 'request_registration',
          payload: { capabilityToken, idempotencyKey: key, [field]: true },
        }),
      ).toThrow(/shape/iu)
    },
  )

  it('accepts exact revocation and bounded ceremony shapes', () => {
    expect(
      parseReviewerCredentialCommand({
        operation: 'revoke',
        payload: { capabilityToken, credentialRecordId: id, idempotencyKey: key },
      }),
    ).toEqual(expect.objectContaining({ operation: 'revoke' }))
    expect(() =>
      parseReviewerCredentialCommand({
        operation: 'complete_registration',
        payload: {
          challengeId: id,
          idempotencyKey: key,
          ceremony: { credentialId: 'a', clientDataJSON: 'b', attestationObject: 'c', extra: 'x' },
        },
      }),
    ).toThrow(/shape/iu)
  })

  it('rejects weak capabilities and normal-session identity fields', () => {
    expect(() =>
      parseReviewerCredentialCommand({
        operation: 'request_registration',
        payload: { capabilityToken: 'weak', idempotencyKey: key },
      }),
    ).toThrow(/capability/iu)
    expect(() =>
      parseReviewerCredentialCommand({
        operation: 'list',
        payload: { capabilityToken, idempotencyKey: key, username: 'reviewer' },
      }),
    ).toThrow(/shape/iu)
  })

  it('rejects discoverable credentials, challenge mismatch, and verifier extras', () => {
    const proof = {
      challengeId: id,
      credentialIdDigest: 'a'.repeat(64),
      publicKeyDigest: 'b'.repeat(64),
      providerCredentialId: 'provider-credential',
      providerVerificationId: 'verification-1',
      providerKeyId: 'key-1',
      discoverable: false,
      signCount: 0,
    }
    expect(parseReviewerVerification('registration', id, proof)).toEqual(
      expect.objectContaining({ ceremony: 'registration', discoverable: false }),
    )
    expect(() =>
      parseReviewerVerification('registration', id, { ...proof, discoverable: true }),
    ).toThrow()
    expect(() =>
      parseReviewerVerification('registration', key, { ...proof, extra: 'claim' }),
    ).toThrow()
  })
})
