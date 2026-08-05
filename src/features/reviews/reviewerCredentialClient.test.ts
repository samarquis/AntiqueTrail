import { describe, expect, it, vi } from 'vitest'
import {
  createReviewerCredentialClient,
  type ReviewerCredentialTransport,
} from './reviewerCredentialClient'

const identityId = '11111111-1111-4111-8111-111111111111'
const caseId = '22222222-2222-4222-8222-222222222222'
const key = '33333333-3333-4333-8333-333333333333'

describe('reviewer credential client', () => {
  it('requests server-bound challenges without counts or verification claims', async () => {
    const transport: ReviewerCredentialTransport = { execute: vi.fn(async () => ({})) }
    const client = createReviewerCredentialClient(transport)
    await client.requestRegistration(identityId, key)
    await client.requestAssertion(identityId, caseId, key)
    expect(JSON.stringify(vi.mocked(transport.execute).mock.calls)).not.toMatch(
      /credentialCount|verified|providerVerification|challengeDigest|assertionDigest/iu,
    )
  })

  it('submits only browser ceremony output, never verification results', async () => {
    const transport: ReviewerCredentialTransport = { execute: vi.fn(async () => ({})) }
    const client = createReviewerCredentialClient(transport)
    await client.completeAssertion(caseId, key, {
      credentialId: 'base64url-credential',
      clientDataJSON: 'base64url-client',
      authenticatorData: 'base64url-authenticator',
      signature: 'base64url-signature',
    })
    expect(transport.execute).toHaveBeenCalledWith({
      operation: 'complete_assertion',
      payload: expect.objectContaining({ challengeId: caseId, idempotencyKey: key }),
    })
  })
})
