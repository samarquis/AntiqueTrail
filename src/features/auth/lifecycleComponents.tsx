import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_MFA_ERROR, GENERIC_SIGN_IN_ERROR, toAuthSession } from './authClient'
import { useAuth } from './AuthContext'
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

function ErrorMessage() {
  return <p role="alert">{GENERIC_LIFECYCLE_ERROR}</p>
}

function PrivacyReauthentication({
  provider,
  onComplete,
}: {
  provider: AuthProviderAdapter
  onComplete(): void
}) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verifyPassword(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await provider.signIn(email.trim(), password)
      if (result.kind === 'error') setError(GENERIC_SIGN_IN_ERROR)
      else if (result.kind === 'mfa_required') setChallengeId(result.challengeId)
      else {
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
          id="privacy-mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? 'Verifying…' : 'Verify and continue'}
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
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
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
  const [snapshot, setSnapshot] = useState<AccountLifecycleSnapshot | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getStatus()
      .then((result) => {
        if (!cancelled) setSnapshot(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  if (error)
    return (
      <LifecycleCard
        title="Privacy controls unavailable"
        description="Your account privacy controls are temporarily unavailable."
      >
        <ErrorMessage />
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
      {!reauthenticated && provider ? (
        <PrivacyReauthentication provider={provider} onComplete={() => setReauthenticated(true)} />
      ) : (
        <>
          {error && <ErrorMessage />}
          {!job ? (
            <form onSubmit={request}>
              <button className="button" type="submit" disabled={pending}>
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
  const [reauthenticated, setReauthenticated] = useState(!provider)
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [scheduled, setScheduled] = useState<AccountLifecycleSnapshot | null>(null)
  const [error, setError] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed) return
    setPending(true)
    setError(false)
    try {
      setScheduled(await client.requestDeletion())
    } catch {
      setError(true)
      if (provider) setReauthenticated(false)
      queueMicrotask(() => errorRef.current?.focus())
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Schedule account deletion"
      description="Deletion revokes active sessions first and permanently removes your account after the approved waiting period. This cannot be undone after the deadline."
    >
      {!reauthenticated && provider ? (
        <PrivacyReauthentication provider={provider} onComplete={() => setReauthenticated(true)} />
      ) : (
        <>
          {error && (
            <div ref={errorRef} tabIndex={-1}>
              <ErrorMessage />
              <button type="button" onClick={() => setError(false)}>
                Retry
              </button>{' '}
              <Link to="/account/privacy">Back</Link>
            </div>
          )}
          {scheduled ? (
            <>
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
            </>
          ) : (
            <form onSubmit={submit}>
              <h2>What deletion affects</h2>
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
                Administrator and Representative grants are revoked and will not be restored
                automatically if you cancel.
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
  const [pending, setPending] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      await client.cancelDeletion()
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
      {error && <ErrorMessage />}
      {cancelled ? (
        <p role="status">Account deletion was cancelled.</p>
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
