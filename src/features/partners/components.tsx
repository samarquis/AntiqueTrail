import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  EMAIL_GATE_MESSAGE,
  GENERIC_PARTNER_ERROR,
  clearPartnerResume,
  loadPartnerResume,
  normalizePartnerEmail,
  readInvitationToken,
  savePartnerResume,
  scrubInvitationUrl,
  unavailablePartnerClient,
} from './partnerClient'
import type {
  PartnerClient,
  PartnerClaimDraft,
  PartnerClaimSignalInput,
  PartnerClaimStatus,
  PartnerConsentAcknowledgements,
  PartnerConsentStatus,
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
  const [resume, setResume] = useState<{
    resumeHandle: string
    consentAttemptId: string
  } | null>(null)
  const [invitation, setInvitation] = useState<{ state: string } | null>(null)
  const [identity, setIdentity] = useState<PartnerTypedIdentity>({
    name: '',
    title: '',
    store: '',
    email: '',
  })
  const [acknowledgements, setAcknowledgements] = useState<PartnerConsentAcknowledgements>({
    authority: false,
    voluntary: false,
    permittedData: false,
    noPayment: false,
    withdrawal: false,
  })
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const parsed = typeof window === 'undefined' ? null : readInvitationToken(window.location.hash)
    const saved = typeof window === 'undefined' ? null : loadPartnerResume(window.sessionStorage)
    const request = parsed
      ? client.exchangeInvitation(parsed).then((result) => {
          if (!result.resumeHandle) throw new Error(GENERIC_PARTNER_ERROR)
          const next = {
            resumeHandle: result.resumeHandle,
            consentAttemptId: `partner-consent-${crypto.randomUUID()}`,
          }
          savePartnerResume(window.sessionStorage, next)
          scrubInvitationUrl(window.history, `${window.location.pathname}${window.location.search}`)
          setResume(next)
          return result
        })
      : saved
        ? client.resumeInvitation(saved.resumeHandle).then((result) => {
            setResume(saved)
            return result
          })
        : Promise.reject(new Error(GENERIC_PARTNER_ERROR))
    request.then(setInvitation).catch(() => setError(true))
  }, [client])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (
      !resume ||
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
        resumeHandle: resume.resumeHandle,
        idempotencyKey: resume.consentAttemptId,
        identity: {
          ...identity,
          name: identity.name.trim(),
          title: identity.title.trim(),
          store: identity.store.trim(),
          email: normalizePartnerEmail(identity.email),
        },
        acknowledgements,
      })
      clearPartnerResume(window.sessionStorage)
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
                checked={acknowledgements.authority}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, authority: event.target.checked })
                }
              />{' '}
              I understand this does not grant store authority or access.
            </label>
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
                checked={acknowledgements.permittedData}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, permittedData: event.target.checked })
                }
              />{' '}
              I consent to sharing only the requested store draft data.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.noPayment}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, noPayment: event.target.checked })
                }
              />{' '}
              I understand this is unpaid and does not promise payment.
            </label>
            <label>
              <input
                type="checkbox"
                checked={acknowledgements.withdrawal}
                onChange={(event) =>
                  setAcknowledgements({ ...acknowledgements, withdrawal: event.target.checked })
                }
              />{' '}
              I understand I can withdraw this onboarding request before approval.
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
  const [accessState, setAccessState] = useState<'loading' | 'granted' | 'denied'>('loading')
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  const [submitPending, setSubmitPending] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getStatus()
      .then((result) => {
        if (cancelled) return
        setStatus(result)
        setAccessState(result.pendingIdentity === 'bound' ? 'granted' : 'denied')
      })
      .catch(() => {
        if (!cancelled) setAccessState('denied')
      })
    return () => {
      cancelled = true
    }
  }, [client])
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
      {accessState === 'loading' ? (
        <p role="status">Loading…</p>
      ) : accessState === 'denied' ? (
        <GenericPartnerError />
      ) : (
        <form onSubmit={save}>
          {error && <GenericPartnerError />}
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
      )}
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

export function MaterialTermsGate({
  client,
  status,
  onAccepted,
  children,
}: {
  client: PartnerClient
  status: PartnerConsentStatus
  onAccepted: (status: PartnerConsentStatus) => void
  children: ReactNode
}) {
  const [reviewed, setReviewed] = useState(false)
  const [voluntary, setVoluntary] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [idempotencyKey] = useState(() => `partner-reconsent-${crypto.randomUUID()}`)
  if (!status.reconsentRequired) return <>{children}</>
  async function accept() {
    if (!reviewed || !voluntary) return
    setPending(true)
    setError(false)
    try {
      onAccepted(
        await client.acceptMaterialTerms({
          policyVersion: status.requiredVersion,
          acknowledgements: { reviewed, voluntary },
          idempotencyKey,
        }),
      )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <section aria-labelledby="material-terms-heading">
      <h2 id="material-terms-heading">Material terms changed</h2>
      <p>Review and accept version {status.requiredVersion} before continuing.</p>
      <ul>
        {status.materialTerms.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>
      <label>
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />{' '}
        I have read the updated material terms.
      </label>
      <label>
        <input
          type="checkbox"
          checked={voluntary}
          onChange={(event) => setVoluntary(event.target.checked)}
        />{' '}
        I choose to continue voluntarily.
      </label>
      {error && <GenericPartnerError />}
      <button
        type="button"
        disabled={pending || !reviewed || !voluntary}
        onClick={() => void accept()}
      >
        {pending ? 'Saving…' : 'Accept updated terms'}
      </button>
    </section>
  )
}

export function PartnerActivatePage({
  client = unavailablePartnerClient,
}: {
  client?: PartnerClient
}) {
  const [consent, setConsent] = useState<PartnerConsentStatus | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    client
      .getConsentStatus()
      .then(setConsent)
      .catch(() => setError(true))
  }, [client])
  return (
    <PartnerCard
      title="Activation unavailable"
      description="Activation requires a verified email, MFA, and an exact approved store grant. No grant is available in this stage."
    >
      {error ? (
        <GenericPartnerError />
      ) : !consent ? (
        <p role="status">Checking consent…</p>
      ) : (
        <MaterialTermsGate client={client} status={consent} onAccepted={setConsent}>
          <p role="status">Material terms are current. Store access is not enabled.</p>
          <Link className="button" to="/stores">
            Back to store list
          </Link>
        </MaterialTermsGate>
      )}
    </PartnerCard>
  )
}

export function PartnerClaimPage({
  client = unavailablePartnerClient,
  selectedStoreId,
}: {
  client?: PartnerClient
  /** Future Package 10B catalog/CTA wiring supplies this after exact selection. */
  selectedStoreId?: string
}) {
  const location = useLocation()
  const storeId = selectedStoreId ?? new URLSearchParams(location.search).get('claimStore') ?? ''
  const [draft, setDraft] = useState<PartnerClaimDraft>({
    storeId,
    relationship: '',
    authorityStatement: '',
    idempotencyKey: `public-claim-${crypto.randomUUID()}`,
  })
  const [status, setStatus] = useState<PartnerClaimStatus | null>(null)
  const [signalChannel, setSignalChannel] = useState<PartnerClaimSignalInput['channelClass']>(
    'published_business_contact',
  )
  const [evidenceReference, setEvidenceReference] = useState('')
  const [signalIdempotencyKey, setSignalIdempotencyKey] = useState(
    () => `public-signal-${crypto.randomUUID()}`,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [consent, setConsent] = useState<PartnerConsentStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    client
      .getClaimStatus()
      .then((result) => {
        if (!cancelled && result) setStatus(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [client])

  useEffect(() => {
    client
      .getConsentStatus()
      .then(setConsent)
      .catch(() => setError(true))
  }, [client])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      setStatus(
        await client.submitClaim({
          storeId: draft.storeId,
          relationship: draft.relationship.trim(),
          authorityStatement: draft.authorityStatement.trim(),
          idempotencyKey: draft.idempotencyKey,
        }),
      )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function submitSignal(event: FormEvent) {
    event.preventDefault()
    if (!status) return
    setPending(true)
    setError(false)
    try {
      setStatus(
        await client.submitAuthoritySignal({
          claimId: status.claimId,
          idempotencyKey: signalIdempotencyKey,
          channelClass: signalChannel,
          evidenceReference: evidenceReference.trim(),
        }),
      )
      setEvidenceReference('')
      setSignalIdempotencyKey(`public-signal-${crypto.randomUUID()}`)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function requestRecheck() {
    if (!status) return
    setPending(true)
    setError(false)
    try {
      setStatus(await client.requestAuthorityRecheck(status.claimId))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function withdrawClaim() {
    if (!status) return
    setPending(true)
    setError(false)
    try {
      setStatus(await client.withdrawClaim(status.claimId))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <PartnerCard
      title="Request exact store scope"
      description="A claim starts an authority review. It does not grant access or imply endorsement."
    >
      {error && <GenericPartnerError />}
      {status && (
        <>
          <p role="status">Claim status: {status.state}.</p>
          {status.state === 'conflict' && (
            <p role="alert">This claim needs administrator review before it can continue.</p>
          )}
          {status.exactStoreScope && (
            <p>Approved scope: this store only ({status.exactStoreScope}).</p>
          )}
          {status.recheckDueAt && (
            <p>Authority recheck due {new Date(status.recheckDueAt).toLocaleDateString()}.</p>
          )}
          {!['approved', 'rejected', 'withdrawn', 'revoked'].includes(status.state) && (
            <button type="button" onClick={() => void withdrawClaim()} disabled={pending}>
              Withdraw claim
            </button>
          )}
        </>
      )}
      {!consent ? (
        <p role="status">Checking material terms…</p>
      ) : (
        <MaterialTermsGate client={client} status={consent} onAccepted={setConsent}>
          {status && (
            <>
              {!['approved', 'rejected', 'withdrawn', 'revoked'].includes(status.state) && (
                <button type="button" onClick={() => void requestRecheck()} disabled={pending}>
                  Request authority recheck
                </button>
              )}
              {status.state !== 'conflict' &&
                !['approved', 'rejected', 'withdrawn', 'revoked'].includes(status.state) && (
                  <form onSubmit={submitSignal}>
                    <label htmlFor="claim-signal-channel">Authority signal channel</label>
                    <select
                      id="claim-signal-channel"
                      value={signalChannel}
                      onChange={(event) =>
                        setSignalChannel(
                          event.target.value as PartnerClaimSignalInput['channelClass'],
                        )
                      }
                    >
                      <option value="published_business_contact">Published business contact</option>
                      <option value="callback">Callback</option>
                      <option value="mailed_code">Mailed code</option>
                      <option value="filing_lookup">Filing lookup</option>
                      <option value="in_person">In person</option>
                    </select>
                    <label htmlFor="claim-evidence-reference">Evidence reference</label>
                    <input
                      id="claim-evidence-reference"
                      maxLength={240}
                      value={evidenceReference}
                      onChange={(event) => setEvidenceReference(event.target.value)}
                      required
                    />
                    <p>
                      Only a minimized reference is sent; evidence content is not displayed here.
                    </p>
                    <button type="submit" disabled={pending}>
                      Submit authority signal
                    </button>
                  </form>
                )}
            </>
          )}
          <form onSubmit={submit}>
            {storeId ? (
              <p role="status">Selected listing is ready for a server-authoritative claim check.</p>
            ) : (
              <p role="status">Select an exact listing before starting a claim.</p>
            )}
            <label htmlFor="claim-relationship">Relationship to the store</label>
            <input
              id="claim-relationship"
              maxLength={120}
              value={draft.relationship}
              onChange={(event) => setDraft({ ...draft, relationship: event.target.value })}
              required
            />
            <label htmlFor="claim-authority">Authority statement</label>
            <textarea
              id="claim-authority"
              maxLength={1000}
              value={draft.authorityStatement}
              onChange={(event) => setDraft({ ...draft, authorityStatement: event.target.value })}
              required
            />
            <button className="button" type="submit" disabled={pending || !storeId}>
              {pending ? 'Submitting…' : 'Submit claim'}
            </button>
          </form>
        </MaterialTermsGate>
      )}
    </PartnerCard>
  )
}
