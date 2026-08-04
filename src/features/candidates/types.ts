import type { CandidateExtractionOutcome } from './candidateExtraction'

export type CandidateExtractionState = 'manual_draft' | 'extracting' | 'needs_review' | 'saved'
export type CandidateShareState = 'pending' | 'accepted' | 'closed'

export interface CandidateLink {
  id: string
  ownerUserId: string
  normalizedUrl: string | null
  destinationHost: string | null
  title: string
  note: string
  provenance: 'manual' | 'url'
  extractionState: CandidateExtractionState
  version: number
}

export interface CandidateShare {
  id: string
  senderId: string
  recipientId?: string | null
  recipientEmailHmac: string
  state: CandidateShareState
  expiresAt: number
  version: number
}

export interface TripIdea {
  id: string
  ownerUserId: string
  sourceShareId?: string | null
  title: string
  urlNote: string
  version: number
}

export interface BlockedCandidateSender {
  blockedUserId: string
  label: string
  blockedAt: number
}

export interface GenericShareEnvelope {
  accepted: boolean
  state: 'accepted' | 'pending' | 'closed'
  message: string
}

export type CandidateShareDirection = 'sent' | 'received'

export interface CandidateShareView {
  id: string
  direction: CandidateShareDirection
  state: CandidateShareState
  title: string
  expiresAt: number
}

export interface CandidateClient {
  extractCandidate(input: { url: string; note: string }): Promise<CandidateExtractionOutcome>
  saveCandidate(input: {
    url: string
    title: string
    note: string
    extraction: CandidateExtractionOutcome
  }): Promise<CandidateLink>
  listShares(): Promise<CandidateShareView[]>
  getShare(shareId: string): Promise<CandidateShareView | null>
  sendShare(input: { candidateId: string; recipientEmail: string }): Promise<GenericShareEnvelope>
  acceptShare(shareId: string): Promise<GenericShareEnvelope>
  dismissShare(shareId: string): Promise<GenericShareEnvelope>
  blockShare(shareId: string): Promise<GenericShareEnvelope>
  reportShare(shareId: string): Promise<GenericShareEnvelope>
  revokeCandidateShare(shareId: string): Promise<GenericShareEnvelope>
  listTripIdeas(): Promise<TripIdea[]>
  updateTripIdea(
    ideaId: string,
    input: { title: string; urlNote: string; expectedVersion: number },
  ): Promise<TripIdea>
  deleteTripIdea(ideaId: string, confirmation: { confirmed: true }): Promise<void>
  listBlockedCandidateSenders(): Promise<BlockedCandidateSender[]>
  unblockCandidateSender(blockedUserId: string, confirmation: { confirmed: true }): Promise<void>
}
