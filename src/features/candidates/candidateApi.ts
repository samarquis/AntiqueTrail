import { GENERIC_CANDIDATE_ERROR } from './candidateClient'
import type {
  CandidateClient,
  CandidateLink,
  CandidateShareView,
  GenericShareEnvelope,
  TripIdea,
} from './types'
import type { CandidateExtractionOutcome } from './candidateExtraction'

export interface CandidateProductionTransport {
  rpc<T>(command: string, payload: Readonly<Record<string, unknown>>): Promise<T>
  edge<T>(command: string, payload: Readonly<Record<string, unknown>>): Promise<T>
}

export function createCandidateProductionClient(
  transport: CandidateProductionTransport,
): CandidateClient {
  async function bounded<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch {
      throw new Error(GENERIC_CANDIDATE_ERROR)
    }
  }

  return {
    extractCandidate: (input) =>
      bounded(() => transport.edge<CandidateExtractionOutcome>('candidate-extract', input)),
    saveCandidate: (input) =>
      bounded(() => transport.rpc<CandidateLink>('candidate_save_candidate', { p_input: input })),
    listShares: () =>
      bounded(() => transport.rpc<CandidateShareView[]>('candidate_list_shares', {})),
    getShare: (shareId) =>
      bounded(() =>
        transport.rpc<CandidateShareView | null>('candidate_get_share', { p_share_id: shareId }),
      ),
    sendShare: (input) =>
      bounded(() =>
        transport.edge<GenericShareEnvelope>('candidate-send-share', {
          ...input,
          idempotencyKey: `send-${input.candidateId}`,
        }),
      ),
    acceptShare: (shareId) =>
      bounded(() =>
        transport.edge<GenericShareEnvelope>('candidate-accept-share', {
          shareId,
          idempotencyKey: `accept-${shareId}`,
        }),
      ),
    dismissShare: (shareId) =>
      bounded(() =>
        transport.rpc<GenericShareEnvelope>('candidate_dismiss_share', { p_share_id: shareId }),
      ),
    blockShare: (shareId) =>
      bounded(() =>
        transport.edge<GenericShareEnvelope>('candidate-block-share', {
          shareId,
          idempotencyKey: `block-${shareId}`,
        }),
      ),
    reportShare: (shareId) =>
      bounded(() =>
        transport.edge<GenericShareEnvelope>('candidate-report-share', {
          shareId,
          idempotencyKey: `report-${shareId}`,
        }),
      ),
    revokeCandidateShare: (shareId) =>
      bounded(() =>
        transport.rpc<GenericShareEnvelope>('revoke_candidate_share', {
          p_share_id: shareId,
          p_idempotency_key: `revoke-${shareId}`,
        }),
      ),
    listTripIdeas: () => bounded(() => transport.rpc<TripIdea[]>('candidate_list_trip_ideas', {})),
    updateTripIdea: (ideaId, input) =>
      bounded(() =>
        transport.rpc<TripIdea>('candidate_update_trip_idea', {
          p_idea_id: ideaId,
          p_title: input.title,
          p_url_note: input.urlNote,
          p_expected_version: input.expectedVersion,
        }),
      ),
    deleteTripIdea: (ideaId, confirmation) =>
      bounded(() =>
        transport.rpc<void>('candidate_delete_trip_idea', {
          p_idea_id: ideaId,
          p_confirmed: confirmation.confirmed,
        }),
      ),
    unblockCandidateSender: (blockedUserId, confirmation) =>
      bounded(() =>
        transport.rpc<void>('unblock_candidate_sender', {
          p_blocked_user_id: blockedUserId,
          p_confirmed: confirmation.confirmed,
        }),
      ),
  }
}
