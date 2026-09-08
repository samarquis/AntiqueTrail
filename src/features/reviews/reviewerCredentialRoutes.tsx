import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  createReviewerBrowserCeremony,
  type ReviewerCredentialBrowserApi,
  type ReviewerCredentialChallenge,
} from './reviewerCredentialBrowser'
import { type ReviewerCredentialClient } from './reviewerCredentialClient'

const GENERIC_ERROR = "We couldn't complete this security-key action. Try again or cancel."
const INVALID_LINK = 'This reviewer link is invalid, expired, or unavailable.'

function challenge(value: unknown): ReviewerCredentialChallenge {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(GENERIC_ERROR)
  const candidate = value as Partial<ReviewerCredentialChallenge>
  if (
    typeof candidate.challengeId !== 'string' ||
    typeof candidate.challenge !== 'string' ||
    typeof candidate.rpId !== 'string' ||
    typeof candidate.origin !== 'string' ||
    typeof candidate.expiresAt !== 'string' ||
    candidate.state !== 'pending' ||
    !Array.isArray(candidate.allowCredentials)
  )
    throw new Error(GENERIC_ERROR)
  return candidate as ReviewerCredentialChallenge
}

function uuid() {
  return crypto.randomUUID()
}

function EnrollmentRoute({
  token,
  client,
  browser,
  recovery,
}: {
  token?: string | null
  client?: ReviewerCredentialClient
  browser?: ReviewerCredentialBrowserApi
  recovery: boolean
}) {
  const [completed, setCompleted] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const pendingIdempotencyKey = useRef<string | null>(null)

  async function addCredential() {
    if (!token || !client || busy || completed === 2) return
    setBusy(true)
    setError(null)
    try {
      const idempotencyKey = (pendingIdempotencyKey.current ??= uuid())
      const rawChallenge = await client.requestRegistration(token, idempotencyKey)
      if ((rawChallenge as { state?: string }).state === 'consumed') {
        pendingIdempotencyKey.current = null
        throw new Error(GENERIC_ERROR)
      }
      const current = Number(
        (rawChallenge as { registrationCompletedCount?: number }).registrationCompletedCount ??
          completed ??
          0,
      )
      if (!Number.isInteger(current) || current < 0 || current > 1) throw new Error(GENERIC_ERROR)
      setCompleted(current)
      const value = challenge(rawChallenge)
      const ceremony = await createReviewerBrowserCeremony(value, 'registration', browser)
      const result = (await client.completeRegistration(
        value.challengeId,
        idempotencyKey,
        ceremony,
      )) as {
        credentialRecordId?: string
        state?: string
      }
      if (!result.credentialRecordId) throw new Error(GENERIC_ERROR)
      pendingIdempotencyKey.current = null
      const next = current + 1
      setCompleted(next)
      if (result.state === 'active' || next === 2) setFinished(true)
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  if (!token || !client) return <ReviewerLinkError />
  if (finished)
    return (
      <ReviewerFrame title={recovery ? 'Recovery complete' : 'Reviewer security keys ready'}>
        <p role="status">Two distinct, non-discoverable security keys are active.</p>
        <p>
          {recovery
            ? 'Previous reviewer keys and live capabilities were revoked before this replacement.'
            : 'Reviewer case access remains disabled until the separate reviewer gate is enabled.'}
        </p>
        <Link className="button" to="/stores">
          Finish
        </Link>
      </ReviewerFrame>
    )
  const label = completed === 1 ? 'Add backup security key' : 'Add first security key'
  return (
    <ReviewerFrame
      title={recovery ? 'Replace reviewer security keys' : 'Set up reviewer security keys'}
    >
      <p>
        {recovery
          ? 'All previous reviewer credentials have been revoked. Add two new, distinct security keys.'
          : 'Add two distinct, non-discoverable security keys. This link is not a normal account sign-in.'}
      </p>
      <p role="status">
        {completed === null ? 'Ready to begin.' : `Security keys added: ${completed} of 2.`}
      </p>
      {error && <p role="alert">{error}</p>}
      <button className="button" type="button" onClick={() => void addCredential()} disabled={busy}>
        {busy ? 'Waiting for security key…' : error ? 'Try again' : label}
      </button>
      <Link className="button--secondary" to="/stores">
        Cancel
      </Link>
    </ReviewerFrame>
  )
}

export function ReviewerCredentialSetupRoute(
  props: Omit<Parameters<typeof EnrollmentRoute>[0], 'recovery'>,
) {
  return <EnrollmentRoute {...props} recovery={false} />
}

export function ReviewerCredentialRecoveryRoute(
  props: Omit<Parameters<typeof EnrollmentRoute>[0], 'recovery'>,
) {
  return <EnrollmentRoute {...props} recovery />
}

function ReviewerFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main>
      <section className="page-card" aria-labelledby="reviewer-credential-heading">
        <p className="eyebrow">Independent reviewer security</p>
        <h1 id="reviewer-credential-heading">{title}</h1>
        {children}
      </section>
    </main>
  )
}

function ReviewerLinkError() {
  return (
    <ReviewerFrame title="Reviewer security link unavailable">
      <p role="alert">{INVALID_LINK}</p>
      <Link className="button--secondary" to="/stores">
        Back
      </Link>
    </ReviewerFrame>
  )
}

type SafeCredential = { credentialRecordId: string; state: string; verifiedAt: string }

function safeCredentials(value: unknown): SafeCredential[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { credentials?: unknown }).credentials)
  )
    throw new Error(GENERIC_ERROR)
  return (value as { credentials: unknown[] }).credentials.map((item) => {
    if (!item || typeof item !== 'object') throw new Error(GENERIC_ERROR)
    const credential = item as Partial<SafeCredential>
    if (
      typeof credential.credentialRecordId !== 'string' ||
      typeof credential.state !== 'string' ||
      typeof credential.verifiedAt !== 'string'
    )
      throw new Error(GENERIC_ERROR)
    return credential as SafeCredential
  })
}

export function ReviewerCredentialManagementRoute({
  token,
  client,
  browser,
}: {
  token?: string | null
  client?: ReviewerCredentialClient
  browser?: ReviewerCredentialBrowserApi
}) {
  const [credentials, setCredentials] = useState<SafeCredential[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function freshAssertion() {
    if (!token || !client) throw new Error(GENERIC_ERROR)
    const idempotencyKey = uuid()
    const value = challenge(await client.requestAssertion(token, idempotencyKey))
    const ceremony = await createReviewerBrowserCeremony(value, 'assertion', browser)
    const result = (await client.completeAssertion(
      value.challengeId,
      idempotencyKey,
      ceremony,
    )) as {
      assertionReceiptId?: string
    }
    if (!result.assertionReceiptId) throw new Error(GENERIC_ERROR)
  }

  async function verifyIdentity(event?: FormEvent) {
    event?.preventDefault()
    if (!token || !client || busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await freshAssertion()
      const listed = safeCredentials(await client.list(token, uuid()))
      setCredentials(listed)
      setStatus('Identity verified. These are the reviewer keys for this capability.')
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(credentialRecordId: string) {
    if (!token || !client || busy) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await freshAssertion()
      const result = (await client.revoke(token, credentialRecordId, uuid())) as { state?: string }
      if (result.state !== 'revoked') throw new Error(GENERIC_ERROR)
      setCredentials(
        (current) =>
          current?.filter((item) => item.credentialRecordId !== credentialRecordId) ?? [],
      )
      setStatus(
        'Security key revoked. A fresh identity verification is required for another change.',
      )
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setBusy(false)
    }
  }

  if (!token || !client) return <ReviewerLinkError />
  return (
    <ReviewerFrame title="Manage reviewer security keys">
      <p>Verify identity with a current reviewer security key before viewing or revoking keys.</p>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!credentials ? (
        <button
          className="button"
          type="button"
          onClick={() => void verifyIdentity()}
          disabled={busy}
        >
          {busy ? 'Verifying identity…' : 'Verify identity'}
        </button>
      ) : credentials.length === 0 ? (
        <p role="status">No active security keys are available.</p>
      ) : (
        <ul aria-label="Reviewer security keys">
          {credentials.map((credential) => (
            <li key={credential.credentialRecordId}>
              <span>Security key added {new Date(credential.verifiedAt).toLocaleDateString()}</span>
              <button
                type="button"
                className="button--secondary"
                onClick={() => void revoke(credential.credentialRecordId)}
                disabled={busy}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link className="button--secondary" to="/stores">
        Cancel
      </Link>
    </ReviewerFrame>
  )
}
