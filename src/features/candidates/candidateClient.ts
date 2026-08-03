import {
  GENERIC_CANDIDATE_FAILURE,
  normalizeCandidateUrl,
  normalizeRecipientEmail,
} from './boundary'
import type { CandidateClient } from './types'

export const GENERIC_CANDIDATE_ERROR = 'We could not update this private item. Please try again.'

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error(GENERIC_CANDIDATE_ERROR))
}

export const unavailableCandidateClient: CandidateClient = {
  saveCandidate: unavailable,
  listShares: unavailable,
  getShare: unavailable,
  sendShare: unavailable,
  acceptShare: unavailable,
  dismissShare: unavailable,
  blockShare: unavailable,
  reportShare: unavailable,
  listTripIdeas: unavailable,
  deleteTripIdea: unavailable,
}

export function validateCandidateInput(input: {
  url: string
  title: string
  note: string
}): string[] {
  const errors: string[] = []
  if (!normalizeCandidateUrl(input.url)) errors.push('Enter an eligible HTTP or HTTPS link.')
  if (!input.title.trim()) errors.push('Add a title so you can recognize this candidate.')
  if (input.title.length > 160) errors.push('Title is too long.')
  if (input.note.length > 2000) errors.push('Note is too long.')
  return errors
}

export function normalizeCandidateRecipient(email: string): string {
  return normalizeRecipientEmail(email)
}

export function genericShareFailure(): string {
  return GENERIC_CANDIDATE_FAILURE
}
