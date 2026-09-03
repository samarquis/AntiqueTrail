import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { RequireSession, safeReturnTo } from '../auth'
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
  icon,
  children,
}: {
  title: string
  description: string
  icon?: string
  children: ReactNode
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="trip-heading">
        <p className="eyebrow">My Trip</p>
        <h1 id="trip-heading" className="page-card__heading">
          {icon && (
            <img
              className="page-card__icon"
              src={icon}
              alt=""
              aria-hidden="true"
              width="26"
              height="26"
            />
          )}
          {title}
        </h1>
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
      icon="/icons/trail-map.svg"
    >
      {error ? (
        <TripError />
      ) : trips === null ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          <Link className="button" to="/trips/new">
            <img
              className="button__icon"
              src="/icons/shopping-trip.svg"
              alt=""
              aria-hidden="true"
              width="20"
              height="20"
            />
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
            <p role="status" className="empty-state">
              <img
                className="catalog-state__illustration"
                src="/icons/shopping-trip.svg"
                alt=""
                aria-hidden="true"
                width="64"
                height="64"
              />
              No trips yet.
            </p>
          )}
        </>
      )}
    </TripCard>
  )
}

function NewTripForm({ client }: { client: TripClient }) {
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
      icon="/icons/shopping-trip.svg"
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

export function NewTripPage({ client = unavailableTripClient }: { client?: TripClient }) {
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const addStoreId = query.get('addStoreId')
  if (!addStoreId) return <NewTripForm client={client} />
  return <AddToTripPage storeId={addStoreId} returnTo={query.get('returnTo')} client={client} />
}

// The Add-to-Trip chooser keeps the store identity to the URL seam alone: only the
// bounded store id travels through the arriving deep link and the auth returnTo
// boundary. The store object is never serialized into the URL, local storage, or a
// new cache.
export function AddToTripPage({
  storeId,
  returnTo,
  client = unavailableTripClient,
}: {
  storeId: string
  returnTo?: string | null
  client?: TripClient
}) {
  const backTarget = safeReturnTo(returnTo ?? null)
  const [trips, setTrips] = useState<Trip[] | 'error' | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [actionError, setActionError] = useState(false)
  const [createdTripForRetry, setCreatedTripForRetry] = useState<Trip | null>(null)
  const [pendingAction, setPendingAction] = useState<
    { kind: 'existing'; trip: Trip } | { kind: 'new' } | null
  >(null)
  const [result, setResult] = useState<{ trip: Trip; stop: Trip['stops'][number] } | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    client
      .list()
      .then((list) => {
        if (!cancelled) setTrips(list)
      })
      .catch(() => {
        if (!cancelled) setTrips('error')
      })
    return () => {
      cancelled = true
    }
  }, [client])

  function reload() {
    client
      .list()
      .then(setTrips)
      .catch(() => setTrips('error'))
  }

  const tripsList = Array.isArray(trips) ? trips : []
  const editable = tripsList.filter((trip) => trip.state === 'draft' || trip.state === 'ready')
  const alreadyHas = editable.filter((trip) => trip.stops.some((stop) => stop.storeId === storeId))
  const eligible = editable.filter(
    (trip) => !alreadyHas.includes(trip) && trip.stops.length < MAX_ACTIVE_STOPS,
  )
  const fullTrips = editable.filter(
    (trip) => !alreadyHas.includes(trip) && trip.stops.length >= MAX_ACTIVE_STOPS,
  )
  const backLabel = backTarget === '/saved' ? 'Back to saved stores' : 'Back to stores'

  async function addStoreStopWithReconciliation(tripId: string): Promise<Trip> {
    try {
      return await client.addStoreStop(tripId, storeId)
    } catch (error) {
      // A committed write can lose its response. Re-read the authoritative trip
      // before offering a retry so the same stop is never submitted forever.
      const current = await client.get(tripId).catch(() => null)
      if (current?.stops.some((stop) => stop.storeId === storeId)) return current
      throw error
    }
  }

  async function addToTrip(trip: Trip) {
    if (pendingAction) return
    setPendingAction({ kind: 'existing', trip })
    setActionError(false)
    setNotice(null)
    try {
      const next = await addStoreStopWithReconciliation(trip.id)
      const stop = next.stops.find((candidate) => candidate.storeId === storeId)
      if (!stop) throw new Error('missing added stop')
      setResult({ trip: next, stop })
    } catch {
      setActionError(true)
    } finally {
      setPendingAction(null)
    }
  }

  async function createAndAdd(event: FormEvent) {
    event.preventDefault()
    const normalized = normalizeTripName(name)
    if (!normalized || !date || pendingAction) return
    setPendingAction({ kind: 'new' })
    setActionError(false)
    setNotice(null)
    try {
      const created =
        createdTripForRetry ?? (await client.create({ name: normalized, localDate: date }))
      setCreatedTripForRetry(created)
      const next = await addStoreStopWithReconciliation(created.id)
      const stop = next.stops.find((candidate) => candidate.storeId === storeId)
      if (!stop) throw new Error('missing added stop')
      setName('')
      setDate('')
      setCreatedTripForRetry(null)
      setResult({ trip: next, stop })
    } catch {
      setActionError(true)
    } finally {
      setPendingAction(null)
    }
  }

  async function undoAddition() {
    if (!result || undoing) return
    setUndoing(true)
    setActionError(false)
    try {
      const next = await client.removeStop(result.trip.id, result.stop.id, result.trip.version)
      setResult(null)
      setNotice(`The store was removed from ${next.name}.`)
      reload()
    } catch {
      setActionError(true)
    } finally {
      setUndoing(false)
    }
  }

  if (result)
    return (
      <TripCard
        title={`Added to ${result.trip.name}`}
        description="This store is on your dated trip and stays private to you and any invited trip partner."
        icon="/icons/shopping-trip.svg"
      >
        <p>
          The store is now on {result.trip.name}, dated {result.trip.localDate}.
        </p>
        <Link className="button" to={`/trips/${result.trip.id}/plan`}>
          View Trip
        </Link>{' '}
        <button
          className="button button--secondary"
          type="button"
          disabled={undoing}
          onClick={() => void undoAddition()}
        >
          {undoing ? 'Removing…' : 'Undo'}
        </button>
        {actionError && <TripError />}
        <p>
          <Link to={backTarget}>{backLabel}</Link>
        </p>
      </TripCard>
    )

  return (
    <TripCard
      title="Add to Trip"
      description="Choose an existing trip or start a new trip for this store. Only your own trips are listed here."
      icon="/icons/shopping-trip.svg"
    >
      <p>
        <Link to={backTarget}>{backLabel}</Link>
      </p>
      {notice && <p role="status">{notice}</p>}
      {trips === 'error' ? (
        <>
          <TripError />
          <button className="button" type="button" onClick={reload}>
            Try again
          </button>
        </>
      ) : trips === null ? (
        <p role="status">Loading your trips…</p>
      ) : (
        <>
          {alreadyHas.length > 0 && (
            <p>This store is already on: {alreadyHas.map((trip) => trip.name).join(', ')}.</p>
          )}
          {eligible.length > 0 && (
            <>
              <p className="eyebrow">Existing trips</p>
              <ul aria-label="Existing trips">
                {eligible.map((trip) => {
                  const pending =
                    pendingAction?.kind === 'existing' && pendingAction.trip.id === trip.id
                  return (
                    <li key={trip.id}>
                      <button
                        className="button"
                        type="button"
                        disabled={pendingAction !== null || undoing}
                        onClick={() => void addToTrip(trip)}
                      >
                        {pending ? `Adding to ${trip.name}…` : `Add to ${trip.name}`}
                      </button>
                      <p>
                        {trip.localDate} · {trip.stops.length} of {MAX_ACTIVE_STOPS} stops
                      </p>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {tripsList.length > 0 && eligible.length === 0 && (
            <p role="status">No existing trip can receive this store right now.</p>
          )}
          {tripsList.length === 0 && <p role="status">You have no trips yet.</p>}
          {fullTrips.length > 0 && (
            <p>
              {fullTrips.length === 1
                ? 'One trip is full and is not listed.'
                : `${fullTrips.length} trips are full and are not listed.`}
            </p>
          )}
          <p className="eyebrow">Start a new trip</p>
          <form onSubmit={createAndAdd}>
            <label htmlFor="trip-name">Trip name</label>
            <input
              id="trip-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={createdTripForRetry !== null}
              maxLength={80}
              required
            />
            <label htmlFor="trip-date">Date</label>
            <input
              id="trip-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={createdTripForRetry !== null}
              required
            />
            {actionError &&
              (createdTripForRetry ? (
                <p role="alert">
                  {createdTripForRetry.name} was created, but the store was not added. Retry to add
                  it to that same trip.
                </p>
              ) : (
                <TripError />
              ))}
            <button className="button" type="submit" disabled={pendingAction !== null || undoing}>
              {pendingAction?.kind === 'new'
                ? createdTripForRetry
                  ? 'Adding store…'
                  : 'Creating trip…'
                : createdTripForRetry
                  ? 'Retry adding store'
                  : 'Create trip and add store'}
            </button>
          </form>
        </>
      )}
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
  const [tripName, setTripName] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [startLabel, setStartLabel] = useState('')
  const [hoursAcknowledged, setHoursAcknowledged] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<Trip['stops'][number] | null>(null)
  const [removingStopId, setRemovingStopId] = useState<string | null>(null)
  const [removalStatus, setRemovalStatus] = useState('')
  const removalTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [renameConflict, setRenameConflict] = useState<{
    attemptedName: string
    latest: { name: string; version: number }
  } | null>(null)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueSnapshot>({
    state: 'empty',
    pendingCount: 0,
  })
  useEffect(() => {
    let cancelled = false
    client
      .get(tripId)
      .then((result) => {
        if (!cancelled) {
          setTrip(result)
          setTripName(result?.name ?? '')
          setScheduleDate(result?.localDate ?? '')
          setStartLabel(result?.startLabel ?? '')
          if (result?.departureMinute != null)
            setDepartureTime(
              `${String(Math.floor(result.departureMinute / 60)).padStart(2, '0')}:${String(result.departureMinute % 60).padStart(2, '0')}`,
            )
        }
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
  async function reviewHours(acknowledgeWarnings = false) {
    if (!trip) return
    try {
      setTrip(await client.reviewHours(trip.id, acknowledgeWarnings))
      setHoursAcknowledged(false)
    } catch {
      setError(true)
    }
  }
  async function saveStart(event: FormEvent) {
    event.preventDefault()
    if (!trip || !client.setStart || !startLabel.trim() || !departureTime) return
    const [hours, minutes] = departureTime.split(':').map(Number)
    try {
      setTrip(
        await client.setStart(trip.id, {
          kind: 'manual',
          label: startLabel.trim(),
          departureMinute: hours * 60 + minutes,
        }),
      )
    } catch {
      setError(true)
    }
  }
  async function applyRename(name: string, expectedVersion: number) {
    if (!trip || !normalizeTripName(name)) return
    try {
      const result = await client.renameTrip(trip.id, name, expectedVersion, crypto.randomUUID())
      if (result.state === 'conflict') {
        setRenameConflict({ attemptedName: normalizeTripName(name), latest: result.latest })
        return
      }
      setRenameConflict(null)
      setTrip(result.trip)
      setTripName(result.trip.name)
    } catch {
      setError(true)
    }
  }
  async function rename(event: FormEvent) {
    event.preventDefault()
    if (!trip) return
    await applyRename(tripName, trip.version)
  }
  async function saveSchedule(event: FormEvent) {
    event.preventDefault()
    if (!trip || !scheduleDate) return
    const [hours, minutes] = departureTime ? departureTime.split(':').map(Number) : []
    try {
      setTrip(
        await client.updateSchedule(
          trip.id,
          {
            localDate: scheduleDate,
            departureMinute: hours == null || minutes == null ? undefined : hours * 60 + minutes,
          },
          trip.version,
        ),
      )
    } catch {
      setError(true)
    }
  }
  async function replay() {
    if (!trip) return
    setOfflineQueue((current) => ({ ...current, state: 'replaying' }))
    try {
      setTrip(await client.replayOffline(trip.id))
      setOfflineQueue(await client.getOfflineQueue(trip.id))
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
  async function confirmRemoval() {
    if (!trip || !pendingRemoval) return
    setRemovingStopId(pendingRemoval.id)
    try {
      setTrip(await client.removeStop(trip.id, pendingRemoval.id, trip.version))
      setRemovalStatus(`${pendingRemoval.label} was removed from this trip.`)
      setPendingRemoval(null)
    } catch {
      setError(true)
    } finally {
      setRemovingStopId(null)
    }
  }
  function cancelRemoval() {
    setPendingRemoval(null)
    removalTriggerRef.current?.focus()
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
      icon="/icons/trail-map.svg"
    >
      <p>Trip date: {trip.localDate}</p>
      <section className="trip-plan-section" aria-labelledby="trip-identity-heading">
        <h2 id="trip-identity-heading">Trip identity</h2>
        <form onSubmit={rename}>
          <label htmlFor="plan-trip-name">Trip name</label>
          <input
            id="plan-trip-name"
            value={tripName}
            maxLength={80}
            required
            onChange={(event) => setTripName(event.target.value)}
          />
          <button className="button" type="submit">
            Rename trip
          </button>
        </form>
        {renameConflict && (
          <section aria-label="Rename conflict">
            <p role="alert">
              This trip is now named “{renameConflict.latest.name}”. Choose which name to keep.
            </p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() =>
                void applyRename(renameConflict.attemptedName, renameConflict.latest.version)
              }
            >
              Reapply My Name
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setTrip((current) =>
                  current
                    ? {
                        ...current,
                        name: renameConflict.latest.name,
                        version: renameConflict.latest.version,
                      }
                    : current,
                )
                setTripName(renameConflict.latest.name)
                setRenameConflict(null)
              }}
            >
              Keep Latest Name
            </button>
          </section>
        )}
      </section>
      <section className="trip-plan-section" aria-labelledby="trip-schedule-heading">
        <h2 id="trip-schedule-heading">Schedule</h2>
        <form onSubmit={saveSchedule}>
          <label htmlFor="plan-trip-date">Trip date</label>
          <input
            id="plan-trip-date"
            type="date"
            value={scheduleDate}
            required
            onChange={(event) => setScheduleDate(event.target.value)}
          />
          <label htmlFor="plan-departure-time">Departure time</label>
          <input
            id="plan-departure-time"
            type="time"
            value={departureTime}
            onChange={(event) => setDepartureTime(event.target.value)}
          />
          <button className="button" type="submit">
            Update schedule
          </button>
        </form>
      </section>
      <section className="trip-plan-section" aria-labelledby="trip-start-heading">
        <h2 id="trip-start-heading">Starting place for Go</h2>
        <form onSubmit={saveStart}>
          <p>Enter a place yourself. Antique Trail does not request background location.</p>
          <label htmlFor="plan-start-kind">Start kind</label>
          <select id="plan-start-kind" value="manual" disabled>
            <option value="manual">Manual starting place</option>
          </select>
          <label htmlFor="plan-start-label">Manual starting place</label>
          <input
            id="plan-start-label"
            value={startLabel}
            maxLength={240}
            required
            onChange={(event) => setStartLabel(event.target.value)}
          />
          <label htmlFor="plan-start-time">Start time</label>
          <input
            id="plan-start-time"
            type="time"
            value={departureTime}
            required
            onChange={(event) => setDepartureTime(event.target.value)}
          />
          <button className="button" type="submit" disabled={!client.setStart}>
            Save starting place
          </button>
        </form>
      </section>
      <section className="trip-plan-section" aria-labelledby="trip-offline-heading">
        <h2 id="trip-offline-heading">Offline planning</h2>
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
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void resolveConflict('phone')}
            >
              Keep This Phone&apos;s Version
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void resolveConflict('saved')}
            >
              Keep Saved Version
            </button>
          </>
        )}
        {offlineQueue.state === 'purged' && (
          <p role="status">Offline data was purged. Reconnect before making another change.</p>
        )}
        {offlineQueue.state !== 'empty' && (
          <button
            className="button button--secondary"
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
        {offlineQueue.state === 'queued' || offlineQueue.state === 'conflict' ? (
          <button className="button button--secondary" type="button" onClick={() => void replay()}>
            Replay queued changes
          </button>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => void queueOffline()}
          >
            Save a change offline
          </button>
        )}
      </section>
      <section className="trip-plan-section" aria-labelledby="trip-stops-heading">
        <h2 id="trip-stops-heading">Stops</h2>
        <ol aria-label="Ordered trip stops">
          {trip.stops.map((stop, index) => (
            <li key={stop.id}>
              <section aria-labelledby={`stop-${stop.id}-heading`}>
                <h3 id={`stop-${stop.id}-heading`}>
                  {stop.label} — {stop.priority}, {stop.plannedDwellMinutes} minutes, {stop.state}
                </h3>
                {stop.kind === 'store' && stop.hours && (
                  <p>
                    {stop.hours.state === 'verified'
                      ? stop.hours.closed
                        ? 'Closed on this trip date.'
                        : stop.hours.opensAt != null && stop.hours.closesAt != null
                          ? `Trip-date hours: ${formatTripMinute(stop.hours.opensAt)}–${formatTripMinute(stop.hours.closesAt)}.`
                          : 'Trip-date hours verified.'
                      : (stop.hours.warning ?? 'Hours unavailable for this trip date.')}
                  </p>
                )}
                <label htmlFor={`priority-${stop.id}`}>Priority for {stop.label}</label>
                <select
                  id={`priority-${stop.id}`}
                  value={stop.priority}
                  onChange={(event) =>
                    client
                      .setStopPriority(
                        trip.id,
                        stop.id,
                        event.target.value as StopPriority,
                        trip.version,
                      )
                      .then(setTrip)
                      .catch(() => setError(true))
                  }
                >
                  <option value="must">Must</option>
                  <option value="prefer">Prefer</option>
                  <option value="flexible">Flexible</option>
                </select>
                <label htmlFor={`dwell-${stop.id}`}>Dwell minutes for {stop.label}</label>
                <input
                  id={`dwell-${stop.id}`}
                  type="number"
                  min={5}
                  max={720}
                  step={1}
                  defaultValue={stop.plannedDwellMinutes}
                  onBlur={(event) => {
                    const next = Number(event.target.value)
                    if (!validDwellMinutes(next)) return setError(true)
                    void client
                      .setStopDwell(trip.id, stop.id, next, trip.version)
                      .then(setTrip)
                      .catch(() => setError(true))
                  }}
                />
                <button
                  className="button button--secondary"
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
                  className="button button--secondary"
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
                <button
                  ref={pendingRemoval?.id === stop.id ? removalTriggerRef : undefined}
                  className="button button--danger"
                  type="button"
                  aria-label={`Remove ${stop.label}`}
                  onClick={(event) => {
                    removalTriggerRef.current = event.currentTarget
                    setPendingRemoval(stop)
                    setRemovalStatus('')
                  }}
                >
                  Remove stop
                </button>
                {pendingRemoval?.id === stop.id && (
                  <fieldset className="trip-remove-confirmation">
                    <legend>Remove {stop.label}?</legend>
                    <p id={`remove-${stop.id}-consequence`}>
                      Removing {stop.label} changes this trip plan immediately.
                    </p>
                    <div className="memory-delete-actions">
                      <button
                        className="button button--secondary"
                        type="button"
                        onClick={cancelRemoval}
                      >
                        Keep {stop.label}
                      </button>
                      <button
                        className="button button--danger"
                        type="button"
                        aria-describedby={`remove-${stop.id}-consequence`}
                        disabled={removingStopId === stop.id}
                        onClick={() => void confirmRemoval()}
                      >
                        {removingStopId === stop.id ? 'Removing…' : `Yes, remove ${stop.label}`}
                      </button>
                    </div>
                  </fieldset>
                )}
              </section>
            </li>
          ))}
        </ol>
      </section>
      {removalStatus && <p role="status">{removalStatus}</p>}
      <section className="trip-plan-section" aria-labelledby="trip-add-stop-heading">
        <h2 id="trip-add-stop-heading">Add a stop</h2>
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
      </section>
      {error && <TripError />}
      <section className="trip-plan-section" aria-labelledby="trip-hours-heading">
        <h2 id="trip-hours-heading">Store hours</h2>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void reviewHours(false)}
        >
          Review Hours
        </button>
        {trip.hoursReview?.hasUnresolvedWarnings && !trip.hoursReview.acknowledged && (
          <fieldset>
            <legend>Hours warnings</legend>
            <label>
              <input
                type="checkbox"
                checked={hoursAcknowledged}
                onChange={(event) => setHoursAcknowledged(event.target.checked)}
              />{' '}
              I understand these hours warnings. Travel time is not included, and this does not
              claim an optimal or feasible route.
            </label>
            <button
              className="button"
              type="button"
              disabled={!hoursAcknowledged}
              onClick={() => void reviewHours(true)}
            >
              Acknowledge warnings and continue
            </button>
          </fieldset>
        )}
      </section>
      <section className="trip-plan-section" aria-labelledby="trip-navigator-heading">
        <h2 id="trip-navigator-heading">Navigator device</h2>
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            client
              .bindNavigatorDevice(trip.id)
              .then(() => client.get(trip.id))
              .then(setTrip)
              .catch(() => setError(true))
          }
        >
          Bind this device
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() =>
            client
              .transferNavigatorDevice(trip.id)
              .then(setTrip)
              .catch(() => setError(true))
          }
        >
          Transfer Navigator to this device
        </button>
      </section>
      <nav className="trip-nav" aria-label="Trip actions">
        <Link to={`/trips/${trip.id}/invite`}>Trip Partner and Navigator</Link>
        <Link to={`/trips/${trip.id}/check-my-day`}>Check My Day</Link>
        <Link to={`/trips/${trip.id}/go`}>Go</Link>
        <Link to="/trips">My trips</Link>
      </nav>
    </TripCard>
  )
}

function formatTripMinute(value: number) {
  const hour = Math.floor(value / 60)
  const minute = value % 60
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`
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
  const navigate = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState(false)
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueSnapshot>({
    state: 'empty',
    pendingCount: 0,
  })
  const [collaboration, setCollaboration] = useState<TripCollaboration | null>(null)
  const [workingOffline, setWorkingOffline] = useState(false)
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
              setWorkingOffline(true)
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
      .catch(() => undefined)
  }, [client, tripId])
  async function mutate(
    kind: 'mark_arrived' | 'complete_stop' | 'skip_stop' | 'mark_observed_closed' | 'restore_stop',
    action: ((tripId: string, stopId: string) => Promise<Trip>) | undefined,
    stopId: string,
  ) {
    if (!trip || !action) return
    try {
      let next: Trip
      if (workingOffline && offlineRuntime?.queueMutation && accountId) {
        const state: Trip['stops'][number]['state'] =
          kind === 'mark_arrived'
            ? 'arrived'
            : kind === 'complete_stop'
              ? 'completed'
              : kind === 'skip_stop'
                ? 'skipped'
                : kind === 'mark_observed_closed'
                  ? 'observed_closed'
                  : 'planned'
        next = {
          ...trip,
          stops: trip.stops.map((stop) => (stop.id === stopId ? { ...stop, state } : stop)),
        }
        setOfflineQueue(await offlineRuntime.queueMutation(accountId, next, { kind, stopId }))
      } else next = await action(trip.id, stopId)
      setTrip(next)
      if (
        kind !== 'restore_stop' &&
        next.stops.every((stop) => ['completed', 'skipped', 'observed_closed'].includes(stop.state))
      ) {
        if (workingOffline) return
        if (!client.completeTrip) throw new Error('trip_completion_unavailable')
        const completed = await client.completeTrip(next.id)
        if (completed.state !== 'completed') throw new Error('trip_completion_incomplete')
        if (offlineRuntime?.recordCompleted && accountId)
          await offlineRuntime.recordCompleted(accountId, completed)
        setTrip(completed)
        navigate(`/trips/${completed.id}/summary`, { state: { trip: completed } })
      }
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
      icon="/icons/trail-map.svg"
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
                <button
                  type="button"
                  onClick={() => void mutate('mark_arrived', client.markArrived, stop.id)}
                >
                  Arrived
                </button>
                <button
                  type="button"
                  onClick={() => void mutate('skip_stop', client.skipStop, stop.id)}
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void mutate('mark_observed_closed', client.markObservedClosed, stop.id)
                  }
                >
                  Store is closed
                </button>
              </>
            )}
            {stop.state === 'arrived' && isNavigator && (
              <>
                <button
                  type="button"
                  onClick={() => void mutate('complete_stop', client.completeStop, stop.id)}
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void mutate('mark_observed_closed', client.markObservedClosed, stop.id)
                  }
                >
                  Store is closed
                </button>
              </>
            )}
            {stop.state === 'observed_closed' && isNavigator && (
              <button
                type="button"
                onClick={() => void mutate('restore_stop', client.restoreStop, stop.id)}
              >
                Restore stop
              </button>
            )}
            {stop.state === 'skipped' && isNavigator && (
              <button
                type="button"
                aria-label={`Undo skip for ${stop.label}`}
                onClick={() => void mutate('restore_stop', client.restoreStop, stop.id)}
              >
                Undo skip
              </button>
            )}
            {stop.kind === 'store' &&
              stop.state === 'completed' &&
              stop.storeId &&
              client.saveVisitMemory && (
                <VisitMemoryForm
                  tripId={trip.id}
                  storeId={stop.storeId}
                  storeLabel={stop.label}
                  save={client.saveVisitMemory}
                  onSaved={setTrip}
                />
              )}
          </li>
        ))}
      </ol>
      {isNavigator &&
        trip.state === 'active' &&
        trip.stops.every((stop) =>
          ['completed', 'skipped', 'observed_closed'].includes(stop.state),
        ) && (
          <button
            className="button"
            type="button"
            onClick={() =>
              client
                .completeTrip?.(trip.id)
                .then(setTrip)
                .catch(() => setError(true))
            }
          >
            Complete trip
          </button>
        )}
      {isNavigator && (
        <button
          type="button"
          onClick={() => {
            if (offlineQueue.state === 'queued' && offlineRuntime?.replay && accountId)
              offlineRuntime
                .replay(accountId, trip.id, client)
                .then((result) => {
                  if (result.state === 'empty') {
                    const finishReplay = async () => {
                      let synchronized = result.trip
                      if (
                        synchronized.state === 'active' &&
                        synchronized.stops.every((stop) =>
                          ['completed', 'skipped', 'observed_closed'].includes(stop.state),
                        )
                      ) {
                        if (!client.completeTrip) throw new Error('trip_completion_unavailable')
                        synchronized = await client.completeTrip(synchronized.id)
                        if (synchronized.state !== 'completed')
                          throw new Error('trip_completion_incomplete')
                      }
                      if (synchronized.state === 'completed') {
                        await offlineRuntime.recordCompleted?.(accountId, synchronized)
                        navigate(`/trips/${synchronized.id}/summary`, {
                          state: { trip: synchronized },
                        })
                      }
                      setTrip(synchronized)
                      setOfflineQueue({ state: 'empty', pendingCount: 0 })
                      setWorkingOffline(false)
                    }
                    void finishReplay().catch(() => setError(true))
                  } else if (result.state === 'conflict') {
                    setOfflineQueue({
                      state: 'conflict',
                      pendingCount: offlineQueue.pendingCount,
                      conflict: { id: 'offline-replay', summary: result.conflict.summary },
                    })
                  } else {
                    setOfflineQueue({
                      state: 'purged',
                      pendingCount: 0,
                      purgeReason: 'authorization_lost',
                    })
                    setWorkingOffline(false)
                  }
                })
                .catch(() => setError(true))
            else setWorkingOffline(true)
          }}
        >
          {offlineQueue.state === 'queued'
            ? 'Reconnect and replay'
            : workingOffline
              ? 'Working offline'
              : 'Work offline'}
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
  const navigate = useNavigate()
  const location = useLocation()
  const navigatedTrip = (location.state as { trip?: Trip } | null)?.trip
  const [trip, setTrip] = useState<Trip | null>(navigatedTrip?.id === tripId ? navigatedTrip : null)
  const [cloning, setCloning] = useState(false)
  const [cloneFailed, setCloneFailed] = useState(false)
  useEffect(() => {
    client
      .get(tripId)
      .then(setTrip)
      .catch(() => undefined)
  }, [client, tripId])
  return (
    <TripCard
      title="Trip summary"
      description="Your private trip record."
      icon="/icons/trail-map.svg"
    >
      {trip ? (
        <>
          <p>
            {trip.name} — {trip.state}
          </p>
          <p>
            Visited:{' '}
            {
              trip.stops.filter((stop) => stop.kind === 'store' && stop.state === 'completed')
                .length
            }{' '}
            · Skipped:{' '}
            {trip.stops.filter((stop) => stop.kind === 'store' && stop.state === 'skipped').length}{' '}
            · Appeared closed:{' '}
            {
              trip.stops.filter((stop) => stop.kind === 'store' && stop.state === 'observed_closed')
                .length
            }{' '}
            · Duration: {formatDuration(trip.durationMinutes)}
          </p>
          <ul>
            {trip.stops.map((stop) => (
              <li key={stop.id}>
                {stop.label}: {summaryStopState(stop.state)} — {summaryMemoryStatus(stop)}
                {stop.kind === 'store' &&
                  stop.state === 'completed' &&
                  stop.storeId &&
                  stop.memoryStatus !== 'saved' &&
                  client.saveVisitMemory && (
                    <VisitMemoryForm
                      tripId={trip.id}
                      storeId={stop.storeId}
                      storeLabel={stop.label}
                      save={client.saveVisitMemory}
                      onSaved={setTrip}
                    />
                  )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p role="status">Trip summary unavailable.</p>
      )}
      {cloneFailed && <TripError />}
      <p>
        {trip?.state === 'completed' && (
          <button
            className="button"
            type="button"
            disabled={cloning}
            onClick={async () => {
              setCloning(true)
              setCloneFailed(false)
              try {
                const cloned = await client.cloneCompleted(trip.id)
                navigate(`/trips/${cloned.id}/plan`)
              } catch {
                setCloneFailed(true)
                setCloning(false)
              }
            }}
          >
            {cloning ? 'Planning again…' : 'Plan Again'}
          </button>
        )}{' '}
        <Link to="/trips">Back to trips</Link>
      </p>
    </TripCard>
  )
}

function formatDuration(minutes: number | undefined): string {
  if (minutes == null) return 'Unavailable'
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (!hours) return `${remaining} min`
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`
}

function summaryStopState(state: Trip['stops'][number]['state']): string {
  if (state === 'completed') return 'Visited'
  if (state === 'observed_closed') return 'Appeared closed'
  return state.charAt(0).toUpperCase() + state.slice(1)
}

function summaryMemoryStatus(stop: Trip['stops'][number]): string {
  if (stop.kind !== 'store') return 'Private memory not applicable'
  return stop.memoryStatus === 'saved' ? 'Private memory saved' : 'Private memory missing'
}

function VisitMemoryForm({
  tripId,
  storeId,
  storeLabel,
  save,
  onSaved,
}: {
  tripId: string
  storeId: string
  storeLabel: string
  save: NonNullable<TripClient['saveVisitMemory']>
  onSaved: (trip: Trip) => void
}) {
  const fieldId = storeId.replace(/[^A-Za-z0-9_-]/g, '-')
  const [rating, setRating] = useState('')
  const [returnChoice, setReturnChoice] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!rating && !returnChoice && !note.trim()) return
    setPending(true)
    setFailed(false)
    setSaved(false)
    try {
      onSaved(
        await save(tripId, storeId, {
          rating: rating ? Number(rating) : undefined,
          returnChoice: returnChoice ? (returnChoice as 'no' | 'maybe' | 'yes') : undefined,
          note: note.trim() || undefined,
        }),
      )
      setSaved(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label={`Private memory for ${storeLabel}`}>
      <label htmlFor={`visit-rating-${fieldId}`}>Private rating for {storeLabel}</label>
      <select
        id={`visit-rating-${fieldId}`}
        value={rating}
        onChange={(event) => setRating(event.target.value)}
      >
        <option value="">No rating</option>
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <label htmlFor={`visit-return-${fieldId}`}>Return to {storeLabel}</label>
      <select
        id={`visit-return-${fieldId}`}
        value={returnChoice}
        onChange={(event) => setReturnChoice(event.target.value)}
      >
        <option value="">Not selected</option>
        <option value="yes">Yes</option>
        <option value="maybe">Maybe</option>
        <option value="no">No</option>
      </select>
      <label htmlFor={`visit-note-${fieldId}`}>Private note for {storeLabel}</label>
      <textarea
        id={`visit-note-${fieldId}`}
        value={note}
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
      />
      <button type="submit" disabled={pending || (!rating && !returnChoice && !note.trim())}>
        {pending ? 'Saving…' : `Save private memory for ${storeLabel}`}
      </button>
      {saved && (
        <p role="status" aria-label={`${storeLabel} memory`}>
          Private memory saved.
        </p>
      )}
      {failed && <TripError />}
    </form>
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
      icon="/icons/shared-trip.svg"
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
      icon="/icons/shared-trip.svg"
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
