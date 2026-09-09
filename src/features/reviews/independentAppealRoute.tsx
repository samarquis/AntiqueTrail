import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type {
  IndependentAppealAssertionOptions,
  IndependentAppealBrowserCeremony,
  IndependentAppealPacket,
} from './independentAppealClient'

const GENERIC_ERROR =
  "We couldn't complete this appeal review. The case remains protected; try again or contact operations."

export interface IndependentAppealReviewClient {
  requestAssertion(
    token: string,
    idempotencyKey: string,
  ): Promise<IndependentAppealAssertionOptions>
  completeAssertion(
    challengeId: string,
    idempotencyKey: string,
    ceremony: IndependentAppealBrowserCeremony,
  ): Promise<{ assertionReceiptId: string; expiresAt: string }>
  getPacket(token: string, assertionReceiptId: string): Promise<IndependentAppealPacket>
  submit(input: {
    capabilityToken: string
    assertionReceiptId: string
    packetHash: string
    outcome: 'restore' | 'uphold'
    reason: string
    idempotencyKey: string
  }): Promise<IndependentAppealPacket>
}

export const unavailableIndependentAppealReviewClient: IndependentAppealReviewClient = {
  requestAssertion: async () => Promise.reject(new Error(GENERIC_ERROR)),
  completeAssertion: async () => Promise.reject(new Error(GENERIC_ERROR)),
  getPacket: async () => Promise.reject(new Error(GENERIC_ERROR)),
  submit: async () => Promise.reject(new Error(GENERIC_ERROR)),
}

function bytesFromHex(value: string): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(value)) throw new Error(GENERIC_ERROR)
  return Uint8Array.from(value.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)))
}

function encode(value: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}

async function browserAssertion(options: IndependentAppealAssertionOptions) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: bytesFromHex(options.challenge),
      rpId: options.rpId,
      userVerification: 'required',
      allowCredentials: options.allowCredentials.map((item) => ({
        id: bytesFromBase64Url(item.id),
        type: item.type,
        ...(item.transports ? { transports: item.transports as AuthenticatorTransport[] } : {}),
      })),
    },
  })
  if (!(credential instanceof PublicKeyCredential)) throw new Error(GENERIC_ERROR)
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    credentialId: encode(credential.rawId),
    clientDataJSON: encode(response.clientDataJSON),
    authenticatorData: encode(response.authenticatorData),
    signature: encode(response.signature),
    ...(response.userHandle ? { userHandle: encode(response.userHandle) } : {}),
  }
}

function bytesFromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    (char) => char.charCodeAt(0),
  )
}

export function IndependentAppealRoute({
  token,
  client,
}: {
  token?: string | null
  client?: IndependentAppealReviewClient
}) {
  const [options, setOptions] = useState<IndependentAppealAssertionOptions | null>(null)
  const [assertionReceiptId, setAssertionReceiptId] = useState<string | null>(null)
  const [packet, setPacket] = useState<IndependentAppealPacket | null>(null)
  const [outcome, setOutcome] = useState<'restore' | 'uphold'>('restore')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function verify() {
    if (!token || !client) return
    setBusy(true)
    setError(null)
    try {
      const nextOptions = await client.requestAssertion(token, crypto.randomUUID())
      const ceremony = await browserAssertion(nextOptions)
      const receipt = await client.completeAssertion(
        nextOptions.challengeId,
        crypto.randomUUID(),
        ceremony,
      )
      const nextPacket = await client.getPacket(token, receipt.assertionReceiptId)
      setOptions(nextOptions)
      setAssertionReceiptId(receipt.assertionReceiptId)
      setPacket(nextPacket)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !client || !packet || !assertionReceiptId || !reason.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await client.submit({
        capabilityToken: token,
        assertionReceiptId,
        packetHash: packet.packetHash,
        outcome,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      setPacket(result)
      setStatus(`${outcome === 'restore' ? 'Restore' : 'Uphold'} decision saved for this case.`)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  const terminal = packet && packet.state !== 'ready'
  return (
    <main>
      <section className="page-card" aria-labelledby="appeal-review-heading">
        <p className="eyebrow">Independent appeal reviewer</p>
        <h1 id="appeal-review-heading">Review one assigned appeal</h1>
        <p className="lede">
          This private link contains one case only. It is not a normal account session.
        </p>
        {!token || !client ? (
          <p role="alert" tabIndex={-1}>
            This review link is invalid, expired, revoked, or unavailable.
          </p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : status ? (
          <p role="status">{status}</p>
        ) : terminal ? (
          <p role="status">This case is already complete: {packet.outcome ?? packet.state}.</p>
        ) : !options || !assertionReceiptId || !packet ? (
          <>
            <p>Verify your assigned reviewer security key before the redacted packet is opened.</p>
            <button className="button" type="button" onClick={() => void verify()} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify identity'}
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <section aria-labelledby="appeal-packet-heading">
              <h2 id="appeal-packet-heading">Assigned case packet</h2>
              <p>Case {packet.caseId}</p>
              <dl>
                <div>
                  <dt>Store</dt>
                  <dd>
                    {packet.store.name}, {packet.store.town}, {packet.store.stateCode}
                  </dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{packet.store.areaLabel}</dd>
                </div>
                <div>
                  <dt>Review</dt>
                  <dd>{packet.reviewText}</dd>
                </div>
                <div>
                  <dt>Rule and reason</dt>
                  <dd>{packet.rule}</dd>
                </div>
                <div>
                  <dt>Prior decision</dt>
                  <dd>{packet.priorDecision}</dd>
                </div>
                <div>
                  <dt>Appeal</dt>
                  <dd>{packet.appealText}</dd>
                </div>
              </dl>
              {packet.evidence.length > 0 && (
                <ul aria-label="Additional case evidence">
                  {packet.evidence.map((item) => (
                    <li key={`${item.kind}:${item.value}`}>{item.value}</li>
                  ))}
                </ul>
              )}
            </section>
            <label htmlFor="appeal-review-outcome">Decision</label>
            <select
              id="appeal-review-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as 'restore' | 'uphold')}
            >
              <option value="restore">Restore</option>
              <option value="uphold">Uphold</option>
            </select>
            <label htmlFor="appeal-review-reason">Decision reason</label>
            <textarea
              id="appeal-review-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={2000}
              aria-describedby="appeal-review-reason-help"
            />
            <p id="appeal-review-reason-help">Give a plain reason for this decision.</p>
            <button className="button" type="submit" disabled={busy || !reason.trim()}>
              {busy ? 'Saving…' : `Submit ${outcome === 'restore' ? 'Restore' : 'Uphold'}`}
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
