import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_MFA_ERROR, GENERIC_SIGN_IN_ERROR, toAuthSession } from './authClient'
import { useAuth, useOptionalAuth } from './AuthContext'
import { GENERIC_LIFECYCLE_ERROR, unavailableLifecycleClient } from './lifecycleClient'
import type { AccountLifecycleClient, AccountLifecycleSnapshot, ExportJob } from './lifecycle'
import type { AuthProviderAdapter } from './types'

function LifecycleCard({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="lifecycle-heading">
        <p className="eyebrow">Account privacy</p>
        <h1 id="lifecycle-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function ErrorMessage({ message = GENERIC_LIFECYCLE_ERROR }: { message?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [message])
  return (
    <div className="error-summary" ref={ref} role="alert" tabIndex={-1}>
      <h2>There is a problem</h2>
      <p>{message}</p>
    </div>
  )
}

function focusAndReveal(element: HTMLElement | null) {
  if (!element) return
  element.focus({ preventScroll: false })
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

function useTransitionFocus(active: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (active) focusAndReveal(ref.current)
  }, [active, ref])
}

function PrivacyReauthentication({
  provider,
  onComplete,
}: {
  provider: AuthProviderAdapter
  onComplete(): void
}) {
  const { session: currentSession, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mfaInputRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLButtonElement>(null)
  const restorePasswordFocus = useRef(false)
  useEffect(() => {
    if (challengeId) focusAndReveal(mfaInputRef.current)
    else if (restorePasswordFocus.current) {
      restorePasswordFocus.current = false
      focusAndReveal(confirmPasswordRef.current)
    }
  }, [challengeId])

  async function verifyPassword(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await provider.signIn(email.trim(), password)
      if (result.kind === 'error') setError(GENERIC_SIGN_IN_ERROR)
      else if (result.kind === 'mfa_required') setChallengeId(result.challengeId)
      else {
        if (!currentSession || result.session.userId !== currentSession.userId) {
          await provider.signOut(toAuthSession(result.session)).catch(() => undefined)
          setError(GENERIC_SIGN_IN_ERROR)
          return
        }
        await signIn(toAuthSession(result.session))
        onComplete()
      }
    } catch {
      setError(GENERIC_SIGN_IN_ERROR)
    } finally {
      setPending(false)
    }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault()
    if (!challengeId) return
    setPending(true)
    setError(null)
    try {
      const session = await provider.verifyMfa(challengeId, code)
      if (!session) setError(GENERIC_MFA_ERROR)
      else {
        if (!currentSession || session.userId !== currentSession.userId) {
          await provider
            .signOut(toAuthSession(session, { mfaVerified: true }))
            .catch(() => undefined)
          setError(GENERIC_MFA_ERROR)
          return
        }
        await signIn(toAuthSession(session, { mfaVerified: true }))
        onComplete()
      }
    } catch {
      setError(GENERIC_MFA_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (challengeId)
    return (
      <form onSubmit={verifyMfa}>
        <p>Because this account already has MFA, verify an enrolled factor to continue.</p>
        <label htmlFor="privacy-mfa-code">Authentication or recovery code</label>
        <input
          ref={mfaInputRef}
          id="privacy-mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={pending}>
          {pending ? 'Verifying…' : 'Verify and continue'}
        </button>
        <button
          type="button"
          onClick={() => {
            restorePasswordFocus.current = true
            setChallengeId(null)
            setCode('')
            setError(null)
          }}
        >
          Back to password
        </button>
        <p>
          If your enrolled factor is unavailable, use a recovery code or{' '}
          <Link to="/auth/recovery">recover your account</Link>. You will never be asked to enroll a
          new factor to exercise a privacy right.
        </p>
      </form>
    )

  return (
    <form onSubmit={verifyPassword}>
      <p>For your privacy, confirm your password within ten minutes of this action.</p>
      <label htmlFor="privacy-email">Email</label>
      <input
        id="privacy-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <label htmlFor="privacy-password">Password</label>
      <input
        id="privacy-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error && <ErrorMessage message={error} />}
      <button ref={confirmPasswordRef} type="submit" disabled={pending}>
        {pending ? 'Confirming…' : 'Confirm password'}
      </button>
      <p>
        <Link to="/auth/recovery">Forgot your password?</Link>
      </p>
    </form>
  )
}

export function PrivacyPage({
  client = unavailableLifecycleClient,
}: {
  client?: AccountLifecycleClient
}) {
  const auth = useOptionalAuth()
  const [snapshot, setSnapshot] = useState<AccountLifecycleSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getStatus()
      .then((result) => {
        if (!cancelled) {
          setSnapshot(result)
          if (
            result.state === 'deletion_scheduled' &&
            auth?.session?.accountState !== 'deletion_scheduled'
          )
            auth?.enterCancellationOnly(result.deletionDueAt)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [auth, client, reloadKey])
  if (error)
    return (
      <LifecycleCard
        title="Privacy controls unavailable"
        description="Your account privacy controls are temporarily unavailable."
      >
        <ErrorMessage />
        <button
          className="button"
          type="button"
          onClick={() => {
            setError(false)
            setSnapshot(null)
            setReloadKey((value) => value + 1)
          }}
        >
          Retry
        </button>
        <p>
          <Link to="/account">Back to account</Link>
        </p>
      </LifecycleCard>
    )
  if (!snapshot)
    return (
      <LifecycleCard title="Privacy controls" description="Loading your account privacy status…">
        <p role="status">Loading…</p>
      </LifecycleCard>
    )
  return (
    <LifecycleCard
      title="Privacy controls"
      description="Review export and deletion choices for your account."
    >
      {snapshot.inactivityWarning && (
        <aside role="status">
          <strong>Account inactivity reminder</strong>
          <p>
            Your account may be scheduled for deletion in {snapshot.inactivityWarning.daysRemaining}{' '}
            days if you do not sign in.
          </p>
        </aside>
      )}
      {snapshot.state === 'deletion_scheduled' ? (
        <>
          <p>
            Your account deletion is scheduled
            {snapshot.deletionDueAt
              ? ` for ${new Date(snapshot.deletionDueAt).toLocaleDateString()}`
              : ''}
            .
          </p>
          <p>Only cancellation and sign-out remain available until cancellation succeeds.</p>
          <Link className="button" to="/account/delete/cancel">
            Review cancellation
          </Link>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void (auth?.signOut() ?? Promise.resolve()).finally(() => setSigningOut(false))
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      ) : snapshot.state === 'deleted' ? (
        <p>This account has been deleted. Sign out and return to the store list.</p>
      ) : (
        <>
          <p>Your account is active.</p>
          <p>
            <Link to="/account/export">Request an export</Link>
          </p>
          <p>
            <Link to="/account/delete">Schedule account deletion</Link>
          </p>
        </>
      )}
    </LifecycleCard>
  )
}

export function ExportPage({
  client = unavailableLifecycleClient,
  provider,
}: {
  client?: AccountLifecycleClient
  provider?: AuthProviderAdapter
}) {
  const [reauthenticated, setReauthenticated] = useState(!provider)
  const [job, setJob] = useState<ExportJob | null>(null)
  const [pending, setPending] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState(false)
  const requestButtonRef = useRef<HTMLButtonElement>(null)
  useTransitionFocus(Boolean(provider) && reauthenticated && !job, requestButtonRef)
  async function request(event?: Pick<FormEvent, 'preventDefault'>) {
    event?.preventDefault()
    setPending(true)
    setError(false)
    try {
      setJob(await client.requestExport())
    } catch {
      setError(true)
      if (provider) setReauthenticated(false)
    } finally {
      setPending(false)
    }
  }
  async function download() {
    if (!job || job.state !== 'ready') return
    setDownloading(true)
    setError(false)
    try {
      const archive = await client.downloadExport(job.id)
      const objectUrl = URL.createObjectURL(archive)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `antique-trail-export-${job.id}.zip`
      link.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      setError(true)
      if (provider) setReauthenticated(false)
    } finally {
      setDownloading(false)
    }
  }
  async function refresh() {
    if (!job) return
    setPending(true)
    setError(false)
    try {
      setJob(await client.getExportStatus(job.id))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Export your account data"
      description="Create a ZIP with canonical UTF-8 JSON, convenience CSV tables, and your eligible media. Private secrets, provider credentials, moderation evidence, purged location data, and other people’s private data are never included."
    >
      {error && (
        <>
          <ErrorMessage />
          <p>Your export request and any completed status remain unchanged.</p>
        </>
      )}
      {!reauthenticated && provider ? (
        <PrivacyReauthentication provider={provider} onComplete={() => setReauthenticated(true)} />
      ) : (
        <>
          {!job ? (
            <form onSubmit={request}>
              <button ref={requestButtonRef} className="button" type="submit" disabled={pending}>
                {pending ? 'Requesting…' : 'Request export'}
              </button>
            </form>
          ) : (
            <div role="status">
              <p>
                Export status: <strong>{job.state}</strong>.
              </p>
              {(job.state === 'queued' || job.state === 'building') && (
                <button type="button" disabled={pending} onClick={() => void refresh()}>
                  {pending ? 'Refreshing…' : 'Refresh status'}
                </button>
              )}
              {job.state === 'ready' && (
                <>
                  <p>
                    Your export is ready through the secure account download flow. No access token
                    is shown here.
                  </p>
                  <dl>
                    <dt>Generated</dt>
                    <dd>
                      {job.generatedAt ? new Date(job.generatedAt).toLocaleString() : 'Unavailable'}
                    </dd>
                    <dt>File size</dt>
                    <dd>
                      {job.fileSizeBytes !== undefined
                        ? `${job.fileSizeBytes.toLocaleString()} bytes`
                        : 'Unavailable'}
                    </dd>
                    <dt>SHA-256 checksum</dt>
                    <dd>
                      <code>{job.checksumSha256 ?? 'Unavailable'}</code>
                    </dd>
                    <dt>Expires</dt>
                    <dd>
                      {job.expiresAt ? new Date(job.expiresAt).toLocaleString() : 'Unavailable'}
                    </dd>
                  </dl>
                  <button type="button" disabled={downloading} onClick={() => void download()}>
                    {downloading ? 'Preparing download…' : 'Download ZIP'}
                  </button>
                </>
              )}
              {job.state === 'failed' && (
                <>
                  <p role="alert">
                    We could not prepare that export. No internal failure details are shown.
                  </p>
                  <button type="button" disabled={pending} onClick={(event) => void request(event)}>
                    Try Again
                  </button>
                  <p>
                    <Link to="/account/privacy?help=export">Contact support</Link>
                  </p>
                </>
              )}
              {job.state === 'expired' && (
                <button type="button" disabled={pending} onClick={(event) => void request(event)}>
                  Create New Export
                </button>
              )}
            </div>
          )}
          <p>
            <Link to="/account/privacy">Back to privacy controls</Link>
          </p>
        </>
      )}
    </LifecycleCard>
  )
}

export function DeleteAccountPage({
  client = unavailableLifecycleClient,
  provider,
}: {
  client?: AccountLifecycleClient
  provider?: AuthProviderAdapter
}) {
  const auth = useOptionalAuth()
  const [reauthenticated, setReauthenticated] = useState(!provider)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [scheduled, setScheduled] = useState<AccountLifecycleSnapshot | null>(null)
  const [error, setError] = useState(false)
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null)
  const scheduledHeadingRef = useRef<HTMLHeadingElement>(null)
  const [signingOut, setSigningOut] = useState(false)
  useTransitionFocus(Boolean(provider) && reauthenticated && !scheduled, confirmationHeadingRef)
  useTransitionFocus(Boolean(scheduled), scheduledHeadingRef)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed) return
    setPending(true)
    setError(false)
    try {
      const result = await client.requestDeletion()
      setScheduled(result)
      auth?.enterCancellationOnly(result.deletionDueAt)
    } catch {
      setError(true)
      if (provider) setReauthenticated(false)
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Schedule account deletion"
      description="Deletion revokes active sessions first and permanently removes your account after the approved waiting period. This cannot be undone after the deadline."
    >
      {error && (
        <div>
          <ErrorMessage />
          <button type="button" onClick={() => setError(false)}>
            Retry
          </button>{' '}
          <Link to="/account/privacy">Back</Link>
        </div>
      )}
      {!reauthenticated && provider ? (
        <PrivacyReauthentication provider={provider} onComplete={() => setReauthenticated(true)} />
      ) : (
        <>
          {scheduled ? (
            <>
              <h2 ref={scheduledHeadingRef} tabIndex={-1}>
                Account deletion is scheduled
              </h2>
              <p role="status">Your account deletion request was received.</p>
              {scheduled.deletionDueAt && (
                <p>
                  Permanent primary-data deletion is scheduled for exactly{' '}
                  <strong>{new Date(scheduled.deletionDueAt).toLocaleString()}</strong>.
                </p>
              )}
              <p>Only cancellation and sign-out remain available while deletion is scheduled.</p>
              <Link className="button" to="/account/delete/cancel">
                Review cancellation
              </Link>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => {
                  setSigningOut(true)
                  void (auth?.signOut() ?? Promise.resolve()).finally(() => setSigningOut(false))
                }}
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <form onSubmit={submit}>
              <h2 ref={confirmationHeadingRef} tabIndex={-1}>
                What deletion affects
              </h2>
              <ul>
                <li>
                  Your profile, private memories, corrections, trip plans, and candidate leads.
                </li>
                <li>All sessions and account/device grants are revoked immediately.</li>
                <li>Your reviews are hidden immediately and removed from public aggregates.</li>
                <li>You may cancel for seven days; primary deletion runs on day 8.</li>
                <li>Encrypted backups age out on their documented retention schedule.</li>
                <li>
                  Only records required by law or security policy remain for their stated retention.
                </li>
              </ul>
              <p>
                Cancellation restores ordinary account access only. Administrator and Representative
                grants remain revoked and require normal re-verification.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />{' '}
                I understand this schedules deletion and revokes my sessions.
              </label>
              <button className="button" type="submit" disabled={!confirmed || pending}>
                {pending ? 'Scheduling…' : 'Schedule deletion'}
              </button>
            </form>
          )}
        </>
      )}
    </LifecycleCard>
  )
}

export function CancelDeletionPage({
  client = unavailableLifecycleClient,
}: {
  client?: AccountLifecycleClient
}) {
  const auth = useOptionalAuth()
  const [pending, setPending] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState(false)
  const cancelledStatusRef = useRef<HTMLParagraphElement>(null)
  useTransitionFocus(cancelled, cancelledStatusRef)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      await client.cancelDeletion()
      auth?.restoreActiveAccount()
      setCancelled(true)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Cancel account deletion"
      description="Cancellation restores ordinary account access only before the deletion deadline. Privileged grants remain revoked and require normal re-verification."
    >
      {error && (
        <>
          <ErrorMessage />
          <p>Your deletion schedule remains unchanged.</p>
          <button type="button" onClick={() => setError(false)}>
            Retry
          </button>
          <p>
            <Link to="/account/privacy">Back to privacy controls</Link>
          </p>
        </>
      )}
      {cancelled ? (
        <p ref={cancelledStatusRef} role="status" tabIndex={-1}>
          Account deletion was cancelled.
        </p>
      ) : (
        <form onSubmit={submit}>
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Cancelling…' : 'Cancel deletion'}
          </button>
        </form>
      )}
    </LifecycleCard>
  )
}
