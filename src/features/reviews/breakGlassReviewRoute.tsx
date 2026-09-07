import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { BreakGlassBrowserCeremony, BreakGlassPacket } from './breakGlassReviewClient'

export interface BreakGlassReviewClient {
  getPacket(token: string): Promise<unknown>
  requestAssertion(token: string, idempotencyKey: string): Promise<unknown>
  completeAssertion(
    challengeId: string,
    idempotencyKey: string,
    ceremony: BreakGlassBrowserCeremony,
  ): Promise<unknown>
  submit(payload: {
    capabilityToken: string
    assertionReceiptId: string
    packetHash: string
    decision: 'Compliant' | 'Exception'
    reason: string
    followUpReference: string
    idempotencyKey: string
  }): Promise<unknown>
}

export const unavailableBreakGlassReviewClient: BreakGlassReviewClient = {
  getPacket: async () => {
    throw new Error(GENERIC_ERROR)
  },
  requestAssertion: async () => {
    throw new Error(GENERIC_ERROR)
  },
  completeAssertion: async () => {
    throw new Error(GENERIC_ERROR)
  },
  submit: async () => {
    throw new Error(GENERIC_ERROR)
  },
}

const GENERIC_ERROR =
  "We couldn't complete this review. The case remains protected; try again or contact operations."

function packet(value: unknown): BreakGlassPacket {
  if (!value || typeof value !== 'object') throw new Error(GENERIC_ERROR)
  const candidate = value as BreakGlassPacket
  if (!candidate.packetHash || !candidate.incidentId || !candidate.reviewDueAt)
    throw new Error(GENERIC_ERROR)
  return candidate
}

export function BreakGlassReviewRoute({
  token,
  client,
}: {
  token?: string | null
  client?: BreakGlassReviewClient
}) {
  const [reviewPacket, setPacket] = useState<BreakGlassPacket | null>(null)
  const [assertion, setAssertion] = useState<{ id: string; challenge: unknown } | null>(null)
  const [decision, setDecision] = useState<'Compliant' | 'Exception'>('Compliant')
  const [reason, setReason] = useState('')
  const [followUpReference, setFollowUpReference] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!token || !client) return
    client
      .getPacket(token)
      .then((value) => setPacket(packet(value)))
      .catch(() => setError(true))
  }, [client, token])

  async function requestAssertion() {
    if (!token || !client) return
    setError(false)
    try {
      const idempotencyKey = crypto.randomUUID()
      const challenge = await client.requestAssertion(token, idempotencyKey)
      const value = challenge as { challengeId?: string }
      if (!value.challengeId) throw new Error(GENERIC_ERROR)
      const challengeValue = challenge as { challenge?: string; rpId?: string; origin?: string }
      if (!challengeValue.challenge) throw new Error(GENERIC_ERROR)
      const rawChallenge = Uint8Array.from(
        challengeValue.challenge.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
      )
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: rawChallenge,
          rpId: challengeValue.rpId,
          userVerification: 'required',
        },
      })
      if (!(credential instanceof PublicKeyCredential)) throw new Error(GENERIC_ERROR)
      const response = credential.response as AuthenticatorAssertionResponse
      const encode = (value: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(value)))
          .replaceAll('+', '-')
          .replaceAll('/', '_')
          .replace(/=+$/u, '')
      const completed = (await client.completeAssertion(value.challengeId, idempotencyKey, {
        credentialId: encode(credential.rawId),
        clientDataJSON: encode(response.clientDataJSON),
        authenticatorData: encode(response.authenticatorData),
        signature: encode(response.signature),
        ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}),
      })) as { assertionReceiptId?: string }
      if (!completed.assertionReceiptId) throw new Error(GENERIC_ERROR)
      setAssertion({ id: completed.assertionReceiptId, challenge })
    } catch {
      setError(true)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (
      !token ||
      !client ||
      !reviewPacket ||
      !assertion ||
      !reason.trim() ||
      !followUpReference.trim()
    )
      return
    client
      .submit({
        capabilityToken: token,
        assertionReceiptId: assertion.id,
        packetHash: reviewPacket.packetHash,
        decision,
        reason: reason.trim(),
        followUpReference: followUpReference.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      .then(() =>
        setStatus(
          `${decision} receipt submitted. Break-glass access remains disabled until a new authorized case.`,
        ),
      )
      .catch(() => setError(true))
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="break-glass-heading">
        <p className="eyebrow">Independent break-glass review</p>
        <h1 id="break-glass-heading">Review one closed access packet</h1>
        <p className="lede">This one-case link is not normal navigation or an account session.</p>
        {!token || !client ? (
          <p role="alert">This review link is invalid, expired, or unavailable.</p>
        ) : error ? (
          <p role="alert">{GENERIC_ERROR}</p>
        ) : !reviewPacket ? (
          <p role="status">Loading the redacted packet…</p>
        ) : status ? (
          <p role="status">{status}</p>
        ) : !assertion ? (
          <>
            <p>
              Packet {reviewPacket.incidentId} is frozen through {reviewPacket.reviewDueAt}.
            </p>
            <p>
              Only the incident scope, counts, access outcomes, notice status, and audit hash are
              shown.
            </p>
            <button className="button" type="button" onClick={() => void requestAssertion()}>
              Verify identity
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p role="status">Fresh identity assertion accepted for this one case.</p>
            <label htmlFor="break-glass-decision">Decision</label>
            <select
              id="break-glass-decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value as 'Compliant' | 'Exception')}
            >
              <option>Compliant</option>
              <option>Exception</option>
            </select>
            <label htmlFor="break-glass-reason">Reason</label>
            <textarea
              id="break-glass-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={2000}
            />
            <label htmlFor="break-glass-follow-up">Follow-up reference</label>
            <input
              id="break-glass-follow-up"
              value={followUpReference}
              onChange={(event) => setFollowUpReference(event.target.value)}
              required
              maxLength={200}
            />
            <button className="button" type="submit">
              Submit {decision} receipt
            </button>
          </form>
        )}
        {!status && (
          <Link className="button--secondary" to="/stores">
            Back
          </Link>
        )}
      </section>
    </main>
  )
}
