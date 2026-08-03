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

export interface GenericShareEnvelope {
  accepted: boolean
  state: 'accepted' | 'pending' | 'closed'
  message: string
}

