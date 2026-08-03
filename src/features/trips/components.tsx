import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { RequireSession } from '../auth'
import {
  GENERIC_TRIP_ERROR,
  MAX_ACTIVE_STOPS,
  normalizeTripName,
  normalizeTripPartnerEmail,
  unavailableTripClient,
  validDwellMinutes,
} from './tripClient'
import type {
  OfflineQueueSnapshot,
  StopPriority,
  Trip,
  TripClient,
  TripCollaboration,
} from './types'
import type { TripOfflineGrantSource, TripOfflineRuntime } from './tripRuntime'

function TripCard({
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
      <section className="page-card" aria-labelledby="trip-heading">
        <p className="eyebrow">My Trip</p>
        <h1 id="trip-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}
function TripError() {
  return <p role="alert">{GENERIC_TRIP_ERROR}</p>
}

function mapHandoffUrl(provider: 'google' | 'waze', destination: string): string {
  const query = encodeURIComponent(destination.trim())
  return provider === 'google'
    ? `https://www.google.com/maps/search/?api=1&query=${query}`
    : `https://www.waze.com/ul?q=${query}&navigate=yes`
}

export function TripsPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .list()
      .then((result) => {
        if (!cancelled) setTrips(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  return (
    <TripCard
      title="My trips"
      description="Plan a manual order and review hours without travel-time or feasibility claims."
    >
      {error ? (
        <TripError />
      ) : trips === null ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <Link className="button" to="/trips/new">
            New trip
          </Link>
          {trips.length ? (
            <ul aria-label="My trips">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <Link to={`/trips/${trip.id}/plan`}>{trip.name}</Link> — {trip.localDate}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">No trips yet.</p>
          )}
        </>
      )}
    </TripCard>
  )
}

export function NewTripPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeTripName(name)
    if (!normalized || !date) return
    setPending(true)
    setError(false)
    try {
      const trip = await client.create({ name: normalized, localDate: date })
      navigate(`/trips/${trip.id}/plan`)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  return (
    <TripCard
      title="New trip"
      description="Give your trip a name and date. Start and return details can stay blank during planning."
    >
      <form onSubmit={submit}>
        <label htmlFor="trip-name">Trip name</label>
        <input
          id="trip-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
        <label htmlFor="trip-date">Date</label>
        <input
          id="trip-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        {error && <TripError />}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create trip'}
        </button>
      </form>
    </TripCard>
  )
}

export function PlanPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState(false)
  const [label, setLabel] = useState('')
  const [priority, setPriority] = useState<StopPriority>('prefer')
  const [dwell, setDwell] = useState(60)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueSnapshot>({
    state: 'empty',
    pendingCount: 0,
  })
  useEffect(() => {
    let cancelled = false
    client
      .get(tripId)
      .then((result) => {
        if (!cancelled) setTrip(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, tripId])
  useEffect(() => {
    client
      .getOfflineQueue(tripId)
      .then(setOfflineQueue)
      .catch(() => undefined)
  }, [client, tripId])
  async function addStop(event: FormEvent) {
    event.preventDefault()
    if (
      !trip ||
      trip.stops.length >= MAX_ACTIVE_STOPS ||
      !label.trim() ||
      !validDwellMinutes(dwell)
    )
      return
    try {
      setTrip(
        await client.addStop(trip.id, {
          kind: 'store',
          label: label.trim(),
          priority,
          plannedDwellMinutes: dwell,
        }),
      )
      setLabel('')
    } catch {
      setError(true)
    }
  }
  async function reviewHours() {
    if (!trip) return
    try {
      setTrip(await client.reviewHours(trip.id))
    } catch {
      setError(true)
    }
  }
  async function replay() {
    if (!trip) return
    setOfflineQueue((current) => ({ ...current, state: 'replaying' }))
    try {
      setTrip(await client.replayOffline(trip.id))
      setOfflineQueue({ state: 'empty', pendingCount: 0, lastUpdatedAt: new Date().toISOString() })
    } catch {
      setOfflineQueue((current) => ({
        ...current,
        state: 'conflict',
        conflict: { id: 'replay', summary: 'Saved changes could not be replayed automatically.' },
      }))
    }
  }
  async function queueOffline() {
    if (!trip) return
    try {
      setOfflineQueue(await client.queueOfflineAction(trip.id, { kind: 'plan_edit' }))
    } catch {
      setError(true)
    }
  }
  async function resolveConflict(choice: 'phone' | 'saved') {
    if (!trip) return
    try {
      setOfflineQueue(await client.resolveOfflineConflict(trip.id, choice))
    } catch {
      setError(true)
    }
  }
  if (error)
    return (
      <TripCard title="Trip unavailable" description="This private trip could not be loaded.">
        <TripError />
      </TripCard>
    )
  if (!trip)
    return (
      <TripCard title="Trip plan" description="Loading your private trip…">
        <p role="status">Loading…</p>
      </TripCard>
    )
  return (
    <TripCard
      title={trip.name}
      description="Review Hours shows store hours only. Travel time is not included, and no feasible-order or arrival claim is made."
    >
      <p>Trip date: {trip.localDate}</p>
      {offlineQueue.state === 'queued' && (
        <p role="status">
          {offlineQueue.pendingCount} change{offlineQueue.pendingCount === 1 ? '' : 's'} queued
          offline. Reconnect to replay them.
        </p>
      )}
      {offlineQueue.state === 'replaying' && <p role="status">Replaying offline changes…</p>}
      {offlineQueue.state === 'conflict' && (
        <>
          <p role="alert">
            {offlineQueue.conflict?.summary ?? 'An offline change needs your choice.'}
          </p>
          <button type="button" onClick={() => void resolveConflict('phone')}>
            Keep This Phone&apos;s Version
          </button>
          <button type="button" onClick={() => void resolveConflict('saved')}>
            Keep Saved Version
          </button>
        </>
      )}
      {offlineQueue.state === 'purged' && (
        <p role="status">Offline data was purged. Reconnect before making another change.</p>
      )}
      {offlineQueue.state !== 'empty' && (
        <button
          type="button"
          onClick={() =>
            client
              .purgeOffline(trip.id, 'owner_requested')
              .then(setOfflineQueue)
              .catch(() => setError(true))
          }
        >
          Purge offline copy
        </button>
      )}
      <ol aria-label="Ordered trip stops">
        {trip.stops.map((stop, index) => (
          <li key={stop.id}>
            {stop.label} — {stop.priority}, {stop.plannedDwellMinutes} minutes, {stop.state}
            <button
              type="button"
              disabled={index === 0}
              aria-label={`Move ${stop.label} up`}
              onClick={() =>
                client
                  .reorderStop(trip.id, stop.id, index - 1)
                  .then(setTrip)
                  .catch(() => setError(true))
              }
            >
              Move Up
            </button>
            <button
              type="button"
              disabled={index === trip.stops.length - 1}
              aria-label={`Move ${stop.label} down`}
              onClick={() =>
                client
                  .reorderStop(trip.id, stop.id, index + 1)
                  .then(setTrip)
                  .catch(() => setError(true))
              }
            >
              Move Down
            </button>
          </li>
        ))}
      </ol>
      <form onSubmit={addStop}>
        <label htmlFor="stop-label">Add stop</label>
        <input
          id="stop-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={trip.stops.length >= MAX_ACTIVE_STOPS}
        />
        <label htmlFor="stop-priority">Priority</label>
        <select
          id="stop-priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as StopPriority)}
        >
          <option value="must">Must</option>
          <option value="prefer">Prefer</option>
          <option value="flexible">Flexible</option>
        </select>
        <label htmlFor="stop-dwell">Dwell minutes</label>
        <input
          id="stop-dwell"
          type="number"
          min={5}
          max={720}
          step={1}
          value={dwell}
          onChange={(event) => setDwell(Number(event.target.value))}
        />
        <button className="button" type="submit" disabled={trip.stops.length >= MAX_ACTIVE_STOPS}>
          Add stop
        </button>
      </form>
      {error && <TripError />}
      <button type="button" onClick={() => void reviewHours()}>
        Review Hours
      </button>
      {offlineQueue.state === 'queued' || offlineQueue.state === 'conflict' ? (
        <button type="button" onClick={() => void replay()}>
          Replay queued changes
        </button>
      ) : (
        <button type="button" onClick={() => void queueOffline()}>
          Save a change offline
        </button>
      )}
      <p>
        <Link to={`/trips/${trip.id}/invite`}>Trip Partner and Navigator</Link> ·{' '}
        <Link to={`/trips/${trip.id}/check-my-day`}>Check My Day</Link> ·{' '}
        <Link to={`/trips/${trip.id}/go`}>Go</Link> · <Link to="/trips">My trips</Link>
      </p>
    </TripCard>
  )
}

export function GoPage({
  client = unavailableTripClient,
  offlineRuntime,
  offlineGrantSource,
  accountId,
}: {
  client?: TripClient
  offlineRuntime?: TripOfflineRuntime
  offlineGrantSource?: TripOfflineGrantSource
  accountId?: string
}) {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueSnapshot>({
    state: 'empty',
    pendingCount: 0,
  })
  const [collaboration, setCollaboration] = useState<TripCollaboration | null>(null)
  useEffect(() => {
    let cancelled = false
    client
      .get(tripId)
      .then((result) => {
        if (!cancelled) setTrip(result)
      })
      .catch(async () => {
        if (cancelled) return
        if (offlineRuntime && accountId) {
          try {
            const recovered = await offlineRuntime.recover(accountId, tripId)
            if (recovered.state === 'available') {
              setTrip(recovered.trip)
              setOfflineQueue({
                state: recovered.pendingCount > 0 ? 'queued' : 'empty',
                pendingCount: recovered.pendingCount,
              })
              return
            }
          } catch {
            // The generic unavailable state below remains reason-neutral.
          }
        }
        setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [accountId, client, offlineRuntime, tripId])
  useEffect(() => {
    client
      .getOfflineQueue(tripId)
      .then(setOfflineQueue)
      .catch(() => undefined)
  }, [client, tripId])
  useEffect(() => {
    client
      .getCollaboration(tripId)
      .then(setCollaboration)
      .catch(() => setError(true))
  }, [client, tripId])
  async function mutate(action: (tripId: string, stopId: string) => Promise<Trip>, stopId: string) {
    if (!trip) return
    try {
      setTrip(await action(trip.id, stopId))
    } catch {
      setError(true)
    }
  }
  if (error)
    return (
      <TripCard title="Go unavailable" description="This private trip could not be loaded.">
        <TripError />
      </TripCard>
    )
  if (!trip)
    return (
      <TripCard title="Go" description="Loading your private trip…">
        <p role="status">Loading…</p>
      </TripCard>
    )
  const currentStop = trip.stops.find(
    (stop) => stop.state === 'planned' || stop.state === 'arrived',
  )
  const isNavigator =
    collaboration !== null && collaboration.currentUserId === collaboration.navigatorUserId
  return (
    <TripCard
      title="Go"
      description="Manual arrival tracking only. Antique Trail does not claim route feasibility or travel time."
    >
      {collaboration && !isNavigator && (
        <p role="status">Read-only progress. Only the assigned Navigator can control Go.</p>
      )}
      {isNavigator && (
        <button
          className="button"
          type="button"
          onClick={async () => {
            try {
              setTrip(
                offlineRuntime && offlineGrantSource && accountId
                  ? await offlineRuntime.start(accountId, trip.id, offlineGrantSource)
                  : await client.start(trip.id),
              )
            } catch {
              setError(true)
            }
          }}
        >
          Start trip
        </button>
      )}
      {offlineQueue.state === 'queued' && (
        <p role="status">
          Offline: {offlineQueue.pendingCount} action{offlineQueue.pendingCount === 1 ? '' : 's'}{' '}
          will replay in order when you reconnect.
        </p>
      )}
      {offlineQueue.state === 'conflict' && (
        <p role="alert">{offlineQueue.conflict?.summary ?? 'An offline action needs review.'}</p>
      )}
      {currentStop && isNavigator && (
        <section aria-labelledby="current-stop-navigation">
          <h2 id="current-stop-navigation">Navigate to current stop</h2>
          <p>{currentStop.address ?? currentStop.label}</p>
          <a
            href={mapHandoffUrl('google', currentStop.address ?? currentStop.label)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Maps
          </a>{' '}
          <a
            href={mapHandoffUrl('waze', currentStop.address ?? currentStop.label)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Waze
          </a>
        </section>
      )}
      <ol aria-label="Trip stops">
        {trip.stops.map((stop) => (
          <li key={stop.id}>
            {stop.label} — {stop.state}
            {stop.state === 'planned' && isNavigator && (
              <>
                <button type="button" onClick={() => void mutate(client.markArrived, stop.id)}>
                  Arrived
                </button>
                <button type="button" onClick={() => void mutate(client.skipStop, stop.id)}>
                  Skip
                </button>
              </>
            )}
            {stop.state === 'arrived' && isNavigator && (
              <button type="button" onClick={() => void mutate(client.completeStop, stop.id)}>
                Done
              </button>
            )}
          </li>
        ))}
      </ol>
      {isNavigator && (
        <button
          type="button"
          onClick={() => {
            if (offlineQueue.state === 'queued')
              client
                .replayOffline(trip.id)
                .then((next) => {
                  setTrip(next)
                  setOfflineQueue({ state: 'empty', pendingCount: 0 })
                })
                .catch(() => setError(true))
            else
              client
                .queueOfflineAction(trip.id, { kind: 'go_action' })
                .then(setOfflineQueue)
                .catch(() => setError(true))
          }}
        >
          {offlineQueue.state === 'queued' ? 'Reconnect and replay' : 'Work offline'}
        </button>
      )}
      {error && <TripError />}
      <p>
        <Link to={`/trips/${trip.id}/summary`}>Summary</Link>
      </p>
    </TripCard>
  )
}

export function SummaryPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  useEffect(() => {
    client
      .get(tripId)
      .then(setTrip)
      .catch(() => setTrip(null))
  }, [client, tripId])
  return (
    <TripCard title="Trip summary" description="Your private trip record.">
      {trip ? (
        <>
          <p>
            {trip.name} — {trip.state}
          </p>
          <ul>
            {trip.stops.map((stop) => (
              <li key={stop.id}>
                {stop.label}: {stop.state}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p role="status">Trip summary unavailable.</p>
      )}
      <Link to="/trips">Back to trips</Link>
    </TripCard>
  )
}

export function InviteTripPartnerPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const { tripId = '' } = useParams()
  const [collaboration, setCollaboration] = useState<TripCollaboration | null>(null)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    client
      .getCollaboration(tripId)
      .then((result) => {
        if (!cancelled) setCollaboration(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, tripId])

  async function invite(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeTripPartnerEmail(email)
    if (!normalized) return
    try {
      setCollaboration(await client.invitePartner(tripId, normalized))
      setEmail('')
      setNotice(
        'Invitation submitted. If that verified account can join, the invitation expires in seven days.',
      )
    } catch {
      setError(true)
    }
  }

  async function assignNavigator(userId: string) {
    try {
      const next = await client.assignNavigator(tripId, userId)
      setCollaboration(next)
      const navigator = next.participants.find((participant) => participant.userId === userId)
      setNotice(`${navigator?.displayName ?? 'Selected participant'} is Navigator.`)
    } catch {
      setError(true)
    }
  }

  return (
    <TripCard
      title="Trip Partner and Navigator"
      description="Invite one verified account to this trip only. Exactly one participant controls Go."
    >
      {error && <TripError />}
      {!collaboration ? (
        <p role="status">Loading collaboration…</p>
      ) : (
        <>
          {!collaboration.participants.some((participant) => participant.role === 'partner') &&
            collaboration.invitation?.state !== 'pending' && (
              <form onSubmit={invite}>
                <label htmlFor="trip-partner-email">Partner verified email</label>
                <input
                  id="trip-partner-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <button type="submit">Send invitation</button>
              </form>
            )}
          {collaboration.invitation?.state === 'pending' && (
            <p>
              One invitation is pending until{' '}
              {new Date(collaboration.invitation.expiresAt).toLocaleDateString()}.
              <button
                type="button"
                onClick={() =>
                  client
                    .revokeInvitation(tripId, collaboration.invitation!.id)
                    .then(setCollaboration)
                    .catch(() => setError(true))
                }
              >
                Revoke invitation
              </button>
            </p>
          )}
          <h2>Participants</h2>
          <ul>
            {collaboration.participants.map((participant) => (
              <li key={participant.userId}>
                {participant.displayName} — {participant.role}
                {collaboration.navigatorUserId === participant.userId ? (
                  <strong> — Navigator</strong>
                ) : (
                  <button
                    type="button"
                    onClick={() => void assignNavigator(participant.userId)}
                    aria-label={`Make ${participant.displayName} Navigator`}
                  >
                    Make Navigator
                  </button>
                )}
              </li>
            ))}
          </ul>
          {notice && <p role="status">{notice}</p>}
          <p>
            The non-Navigator can read progress but cannot control Go. Private ratings and notes are
            never shared.
          </p>
          <Link to={`/trips/${tripId}/plan`}>Back to trip plan</Link>
        </>
      )}
    </TripCard>
  )
}

export function AcceptTripInvitationPage({
  client = unavailableTripClient,
}: {
  client?: TripClient
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '')
  const started = useRef(false)
  const [collaboration, setCollaboration] = useState<TripCollaboration | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (location.hash) {
      navigate('/trip-invitations', { replace: true })
      return
    }
    if (!token) {
      setError(true)
      return
    }
    if (started.current) return
    started.current = true
    let cancelled = false
    client
      .acceptInvitation(token)
      .then((result) => {
        if (!cancelled) setCollaboration(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, location.hash, navigate, token])

  return (
    <TripCard
      title={collaboration ? 'Trip invitation accepted' : 'Trip invitation'}
      description="This invitation grants access to one trip only."
    >
      {error ? (
        <TripError />
      ) : collaboration ? (
        <>
          <p role="status">You joined this one trip as Trip Partner.</p>
          <Link className="button" to={`/trips/${collaboration.tripId}/plan`}>
            Open shared trip
          </Link>
        </>
      ) : (
        <p role="status">Accepting invitation…</p>
      )}
    </TripCard>
  )
}

export function GuardedTrips({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>
}
