import type { ReadinessAdminClient, ReadinessAdminWorkspace } from './adminTypes'

type ReadinessAdminRpcName =
  | 'readiness_admin_workspace'
  | 'readiness_admin_create_invitation'
  | 'readiness_admin_revoke_invitation'
  | 'readiness_admin_mark_started'
  | 'readiness_admin_exclude_subject'
  | 'readiness_admin_begin_run'
  | 'readiness_admin_calculate_gate'
  | 'readiness_admin_freeze_receipt'
  | 'readiness_admin_request_signing_capability'
  | 'readiness_admin_decide_receipt'

export const GENERIC_READINESS_ADMIN_ERROR =
  'This readiness workspace is not available. No cohort or evidence decision was changed.'

export interface ReadinessAdminRpcTransport {
  rpc(
    name: ReadinessAdminRpcName,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export class ReadinessAdminApiError extends Error {
  constructor() {
    super(GENERIC_READINESS_ADMIN_ERROR)
    this.name = 'ReadinessAdminApiError'
  }
}

export function createReadinessAdminClient(
  transport: ReadinessAdminRpcTransport,
): ReadinessAdminClient {
  async function call<T>(
    name: ReadinessAdminRpcName,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error || result.data === null || result.data === undefined)
        throw new ReadinessAdminApiError()
      return result.data as T
    } catch (error) {
      if (error instanceof ReadinessAdminApiError) throw error
      throw new ReadinessAdminApiError()
    }
  }

  return {
    getWorkspace: (cohortId, runId) =>
      call<ReadinessAdminWorkspace>('readiness_admin_workspace', {
        p_cohort_id: cohortId ?? null,
        p_run_id: runId ?? null,
      }),
    createInvitation: (cohortId, recipientEmailHmac, idempotencyKey) =>
      call('readiness_admin_create_invitation', {
        p_cohort_id: cohortId,
        p_recipient_email_hmac: recipientEmailHmac,
        p_idempotency_key: idempotencyKey,
      }),
    revokeInvitation: (invitationId, expectedVersion) =>
      call('readiness_admin_revoke_invitation', {
        p_invitation_id: invitationId,
        p_expected_version: expectedVersion,
      }),
    markStarted: (subjectId, expectedVersion) =>
      call('readiness_admin_mark_started', {
        p_subject_id: subjectId,
        p_expected_version: expectedVersion,
      }),
    excludeSubject: (subjectId, reason, expectedVersion) =>
      call('readiness_admin_exclude_subject', {
        p_subject_id: subjectId,
        p_reason: reason,
        p_expected_version: expectedVersion,
      }),
    beginRun: (cohortId, runId, idempotencyKey) =>
      call('readiness_admin_begin_run', {
        p_cohort_id: cohortId,
        p_run_id: runId,
        p_idempotency_key: idempotencyKey,
      }),
    calculateGate: (runId) => call('readiness_admin_calculate_gate', { p_run_id: runId }),
    freezeReceipt: (runId) => call('readiness_admin_freeze_receipt', { p_run_id: runId }),
    requestSigningCapability: (runId, expectedDigest) =>
      call('readiness_admin_request_signing_capability', {
        p_run_id: runId,
        p_expected_digest: expectedDigest,
      }),
    decideReceipt: (input) =>
      call('readiness_admin_decide_receipt', {
        p_capability_token: input.capabilityToken,
        p_decision: input.decision,
        p_signed_payload_digest: input.signedPayloadDigest,
        p_signature_digest: input.signatureDigest,
        p_provider_key_id: input.providerKeyId,
        p_provider_verification_id: input.providerVerificationId,
        p_reason: input.reason ?? null,
      }),
  }
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new ReadinessAdminApiError())
}

export const unavailableReadinessAdminClient: ReadinessAdminClient = {
  getWorkspace: unavailable,
  createInvitation: unavailable,
  revokeInvitation: unavailable,
  markStarted: unavailable,
  excludeSubject: unavailable,
  beginRun: unavailable,
  calculateGate: unavailable,
  freezeReceipt: unavailable,
  requestSigningCapability: unavailable,
  decideReceipt: unavailable,
}
