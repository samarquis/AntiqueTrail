import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_LIFECYCLE_ERROR, unavailableLifecycleClient } from './lifecycleClient'
import type { AccountLifecycleClient, AccountLifecycleSnapshot, ExportJob } from './lifecycle'

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
}: {
  client?: AccountLifecycleClient
}) {
  const [job, setJob] = useState<ExportJob | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  async function request(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    try {
      setJob(await client.requestExport())
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Export your account data"
      description="Request a copy of the account data you can access. Private secrets, provider credentials, and other people’s data are never included."
    >
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
          {job.state === 'ready' && (
            <p>
              Your export is ready through the secure account download flow. No access token is
              shown here.
            </p>
          )}
          {job.state === 'failed' && (
            <p>We could not prepare that export. You can try again later.</p>
          )}
        </div>
      )}
      <p>
        <Link to="/account/privacy">Back to privacy controls</Link>
      </p>
    </LifecycleCard>
  )
}

export function DeleteAccountPage({
  client = unavailableLifecycleClient,
}: {
  client?: AccountLifecycleClient
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [scheduled, setScheduled] = useState(false)
  const [error, setError] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed) return
    setPending(true)
    setError(false)
    try {
      await client.requestDeletion()
      setScheduled(true)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <LifecycleCard
      title="Schedule account deletion"
      description="Deletion revokes active sessions first and permanently removes your account after the approved waiting period. This cannot be undone after the deadline."
    >
      {error && <ErrorMessage />}
      {scheduled ? (
        <>
          <p role="status">Your account deletion request was received.</p>
          <p>Only cancellation and sign-out remain available while deletion is scheduled.</p>
          <Link className="button" to="/account/delete/cancel">
            Review cancellation
          </Link>
        </>
      ) : (
        <form onSubmit={submit}>
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
