import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  EMAIL_GATE_MESSAGE,
  GENERIC_PARTNER_ERROR,
  readInvitationToken,
  scrubInvitationUrl,
  unavailablePartnerClient,
} from './partnerClient'
import type { PartnerClient, PartnerDraft, PartnerStatus } from './types'

function PartnerCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="partner-heading">
        <p className="eyebrow">Partner onboarding</p>
        <h1 id="partner-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}
function GenericPartnerError() {
  return <p role="alert">{GENERIC_PARTNER_ERROR}</p>
}

export function PartnerJoinPage({ client = unavailablePartnerClient }: { client?: PartnerClient }) {
  const [token, setToken] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<{ state: string } | null>(null)
  const [email, setEmail] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const parsed = typeof window === 'undefined' ? null : readInvitationToken(window.location.hash)
    if (typeof window !== 'undefined') scrubInvitationUrl(window.history)
    setToken(parsed)
    if (parsed)
      client
        .exchangeInvitation(parsed)
        .then(setInvitation)
        .catch(() => setError(true))
    else setError(true)
  }, [client])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !acknowledged || !email.trim()) return
    setPending(true)
    setError(false)
    try {
      await client.acceptConsent({ token, email: email.trim(), acknowledged })
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <PartnerCard
      title="Review invitation & consent"
      description="This invitation is for one prospective store representative. It does not grant access or install anything."
    >
      {error ? (
        <GenericPartnerError />
      ) : !invitation ? (
        <p role="status">Checking invitation…</p>
      ) : invitation.state !== 'active' ? (
        <p role="status">This invitation is no longer available.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="partner-email">Your verified email</label>
          <input
            id="partner-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />{' '}
            I understand this is a private onboarding invitation and does not grant store access.
          </label>
          {error && <GenericPartnerError />}
          <button className="button" type="submit" disabled={pending || !acknowledged}>
            {pending ? 'Saving…' : 'Continue'}
          </button>
        </form>
      )}
    </PartnerCard>
  )
}

export function PartnerVerifyPage({
  client = unavailablePartnerClient,
}: {
  client?: PartnerClient
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function bind() {
    setPending(true)
    setError(null)
    try {
      await client.bindIdentity()
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === EMAIL_GATE_MESSAGE
          ? EMAIL_GATE_MESSAGE
          : GENERIC_PARTNER_ERROR,
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <PartnerCard
      title="Create and verify account"
      description="A verified email and MFA are required before any owner draft or store scope is available."
    >
      {error && <p role="alert">{error}</p>}
      <p>Provider email verification is intentionally disabled until the E-01 gate is approved.</p>
      <button className="button" type="button" onClick={() => void bind()} disabled={pending}>
        {pending ? 'Checking…' : 'Check verification'}
      </button>
    </PartnerCard>
  )
}

export function PartnerDraftPage({
  client = unavailablePartnerClient,
}: {
  client?: PartnerClient
}) {
  const [draft, setDraft] = useState<PartnerDraft>({
    storeName: '',
    address: '',
    hours: '',
    website: '',
    description: '',
  })
  const [status, setStatus] = useState<PartnerStatus | null>(null)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      setStatus(await client.saveDraft(draft))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <PartnerCard
      title="Submit store draft"
      description="Text-only fields are available after a bound partner identity. Media and screenshots remain disabled until M-01 passes."
    >
      {error && <GenericPartnerError />}
      <form onSubmit={save}>
        <label htmlFor="partner-store">Store name</label>
        <input
          id="partner-store"
          maxLength={120}
          value={draft.storeName}
          onChange={(event) => setDraft({ ...draft, storeName: event.target.value })}
          required
        />
        <label htmlFor="partner-address">Address</label>
        <input
          id="partner-address"
          maxLength={240}
          value={draft.address}
          onChange={(event) => setDraft({ ...draft, address: event.target.value })}
          required
        />
        <label htmlFor="partner-hours">Hours</label>
        <textarea
          id="partner-hours"
          maxLength={2000}
          value={draft.hours}
          onChange={(event) => setDraft({ ...draft, hours: event.target.value })}
        />
        <label htmlFor="partner-website">Website</label>
        <input
          id="partner-website"
          type="url"
          maxLength={500}
          value={draft.website}
          onChange={(event) => setDraft({ ...draft, website: event.target.value })}
        />
        <label htmlFor="partner-description">Description</label>
        <textarea
          id="partner-description"
          maxLength={2000}
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
        {status && <p role="status">Draft status: {status.onboarding}.</p>}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save draft'}
        </button>
      </form>
    </PartnerCard>
  )
}

export function PartnerStatusPage({
  client = unavailablePartnerClient,
}: {
  client?: PartnerClient
}) {
  const [status, setStatus] = useState<PartnerStatus | null>(null)
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getStatus()
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  async function withdraw() {
    setPending(true)
    setError(false)
    try {
      setStatus(await client.withdraw())
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <PartnerCard
      title="Onboarding status"
      description="Your own reason-neutral status is shown while authority review is pending."
    >
      {error ? (
        <GenericPartnerError />
      ) : !status ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <p role="status">
            Invitation: {status.invitation}. Onboarding: {status.onboarding}.
          </p>
          {status.onboarding !== 'withdrawn' && (
            <button
              className="button"
              type="button"
              onClick={() => void withdraw()}
              disabled={pending}
            >
              {pending ? 'Withdrawing…' : 'Withdraw onboarding'}
            </button>
          )}
          <p>
            <Link to="/stores">Back to store list</Link>
          </p>
        </>
      )}
    </PartnerCard>
  )
}

export function PartnerActivatePage() {
  return (
    <PartnerCard
      title="Activation unavailable"
      description="Activation requires a verified email, MFA, and an exact approved store grant. No grant is available in this stage."
    >
      <p role="status">Store access is not enabled.</p>
      <Link className="button" to="/stores">
        Back to store list
      </Link>
    </PartnerCard>
  )
}
