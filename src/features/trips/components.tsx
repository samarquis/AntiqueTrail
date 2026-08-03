import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RequireSession } from '../auth'
import {
  GENERIC_TRIP_ERROR,
  MAX_ACTIVE_STOPS,
  normalizeTripName,
  unavailableTripClient,
  validDwellMinutes,
} from './tripClient'
import type { StopPriority, Trip, TripClient } from './types'

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
  const [offline, setOffline] = useState(false)
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
    try {
      setTrip(await client.replayOffline(trip.id))
      setOffline(false)
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
      {offline && <p role="status">Changes are queued offline. Reconnect to replay them.</p>}
      <ol aria-label="Ordered trip stops">
        {trip.stops.map((stop) => (
          <li key={stop.id}>
            {stop.label} — {stop.priority}, {stop.plannedDwellMinutes} minutes, {stop.state}
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
      {offline ? (
        <button type="button" onClick={() => void replay()}>
          Replay queued changes
        </button>
      ) : (
        <button type="button" onClick={() => setOffline(true)}>
          Simulate offline queue
        </button>
      )}
      <p>
        <Link to={`/trips/${trip.id}/go`}>Go</Link> · <Link to="/trips">My trips</Link>
      </p>
    </TripCard>
  )
}

export function GoPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState(false)
  const [offline, setOffline] = useState(false)
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
  return (
    <TripCard
      title="Go"
      description="Manual arrival tracking only. Antique Trail does not claim route feasibility or travel time."
    >
      <button
        className="button"
        type="button"
        onClick={async () => {
          try {
            setTrip(await client.start(trip.id))
          } catch {
            setError(true)
          }
        }}
      >
        Start trip
      </button>
      {offline && <p role="status">Offline: actions will replay in order when you reconnect.</p>}
      <ol aria-label="Trip stops">
        {trip.stops.map((stop) => (
          <li key={stop.id}>
            {stop.label} — {stop.state}
            {stop.state === 'planned' && (
              <>
                <button type="button" onClick={() => void mutate(client.markArrived, stop.id)}>
                  Arrived
                </button>
                <button type="button" onClick={() => void mutate(client.skipStop, stop.id)}>
                  Skip
                </button>
              </>
            )}
            {stop.state === 'arrived' && (
              <button type="button" onClick={() => void mutate(client.completeStop, stop.id)}>
                Done
              </button>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setOffline(!offline)}>
        {offline ? 'Reconnect' : 'Work offline'}
      </button>
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

export function GuardedTrips({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>
}
