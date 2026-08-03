import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  EMAIL_GATE_MESSAGE,
  GENERIC_PARTNER_ERROR,
  normalizePartnerEmail,
  readInvitationToken,
  scrubInvitationUrl,
  unavailablePartnerClient,
} from './partnerClient'
import type {
  PartnerClient,
  PartnerConsentAcknowledgements,
  PartnerDraft,
  PartnerStatus,
  PartnerTypedIdentity,
} from './types'

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
  const [identity, setIdentity] = useState<PartnerTypedIdentity>({
    name: '',
    title: '',
    store: '',
    email: '',
  })
  const [acknowledgements, setAcknowledgements] = useState<PartnerConsentAcknowledgements>({
    voluntary: false,
    unpaid: false,
    invitationOnly: false,
    grantsNothing: false,
  })
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
    if (
      !token ||
      Object.values(acknowledgements).some((value) => !value) ||
      !identity.name.trim() ||
      !identity.title.trim() ||
      !identity.store.trim() ||
      !identity.email.trim()
    )
      return
    setPending(true)
    setError(false)
    try {
      await client.acceptConsent({
        token,
        identity: {
          ...identity,
          name: identity.name.trim(),
          title: identity.title.trim(),
          store: identity.store.trim(),
          email: normalizePartnerEmail(identity.email),
        },
        acknowledgements,
      })
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
          <label htmlFor="partner-name">Your name</label>
          <input
            id="partner-name"
            value={identity.name}
            onChange={(event) => setIdentity({ ...identity, name: event.target.value })}
            required
          />
          <label htmlFor="partner-title">Your title or role</label>
          <input
            id="partner-title"
            value={identity.title}
            onChange={(event) => setIdentity({ ...identity, title: event.target.value })}
            required
          />
          <label htmlFor="partner-store">Store name</label>
          <input
            id="partner-store"
            value={identity.store}
            onChange={(event) => setIdentity({ ...identity, store: event.target.value })}
            required
          />
          <label htmlFor="partner-email">Owner-controlled email</label>
          <input
            id="partner-email"
            type="email"
            autoComplete="email"
            value={identity.email}
            onChange={(event) => setIdentity({ ...identity, email: event.target.value })}
            required
          />
          <fieldset>
            <legend>Consent acknowledgements</legend>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.voluntary}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, voluntary: event.target.checked })
                }
              />{' '}
              I am participating voluntarily.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.unpaid}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, unpaid: event.target.checked })
                }
              />{' '}
              I understand this is unpaid.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.invitationOnly}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, invitationOnly: event.target.checked })
                }
              />{' '}
              I understand this is invitation-only.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.grantsNothing}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, grantsNothing: event.target.checked })
                }
              />{' '}
              I understand this grants no access by itself.
            </label>
          </fieldset>
          {error && <GenericPartnerError />}
          <button
            className="button"
            type="submit"
            disabled={pending || Object.values(acknowledgements).some((value) => !value)}
          >
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
  const [submitPending, setSubmitPending] = useState(false)
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
        <button
          type="button"
          disabled={pending || submitPending}
          onClick={() => {
            setSubmitPending(true)
            setError(false)
            client
              .submitDraft()
              .then(setStatus)
              .catch(() => setError(true))
              .finally(() => setSubmitPending(false))
          }}
        >
          {submitPending ? 'Submitting…' : 'Submit draft for review'}
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
