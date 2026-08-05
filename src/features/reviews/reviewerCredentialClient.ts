import type {
  ReviewerBrowserCeremony,
  ReviewerCredentialCommand,
} from '../../../supabase/functions/_shared/reviewer-credentials'

export interface ReviewerCredentialTransport {
  execute(command: ReviewerCredentialCommand): Promise<unknown>
}

export function createReviewerCredentialClient(transport: ReviewerCredentialTransport) {
  return {
    requestRegistration: (capabilityToken: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_registration',
        payload: { capabilityToken, idempotencyKey },
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
    requestAssertion: (capabilityToken: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'request_assertion',
        payload: { capabilityToken, idempotencyKey },
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
    list: (capabilityToken: string, idempotencyKey: string) =>
      transport.execute({ operation: 'list', payload: { capabilityToken, idempotencyKey } }),
    revoke: (capabilityToken: string, credentialRecordId: string, idempotencyKey: string) =>
      transport.execute({
        operation: 'revoke',
        payload: { capabilityToken, credentialRecordId, idempotencyKey },
      }),
  }
}
