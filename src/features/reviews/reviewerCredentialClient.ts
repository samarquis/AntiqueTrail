import type {
  ReviewerBrowserCeremony,
  ReviewerCredentialCommand,
} from '../../../supabase/functions/_shared/reviewer-credentials'

export interface ReviewerCredentialTransport {
  execute(command: ReviewerCredentialCommand): Promise<unknown>
}

export function createReviewerCredentialClient(transport: ReviewerCredentialTransport) {
  return {
    requestRegistration: (reviewerIdentityId: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_registration',
        payload: { reviewerIdentityId, idempotencyKey },
      }),
    completeRegistration: (
      challengeId: string,
      idempotencyKey: string,
      ceremony: ReviewerBrowserCeremony,
    ) =>
      transport.execute({
        operation: 'complete_registration',
        payload: { challengeId, idempotencyKey, ceremony },
      }),
    requestAssertion: (reviewerIdentityId: string, caseId: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_assertion',
        payload: { reviewerIdentityId, caseId, idempotencyKey },
      }),
    completeAssertion: (
      challengeId: string,
      idempotencyKey: string,
      ceremony: ReviewerBrowserCeremony,
    ) =>
      transport.execute({
        operation: 'complete_assertion',
        payload: { challengeId, idempotencyKey, ceremony },
      }),
    revoke: (credentialRecordId: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'revoke',
        payload: { credentialRecordId, idempotencyKey },
      }),
  }
}
