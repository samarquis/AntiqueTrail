import { useEffect, useRef, useState } from 'react'
import { CheckMyDayChoice } from './components'
import {
  checkMyDay,
  type CheckMyDayOutcome,
  type CheckMyDayProvider,
  type CheckMyDayRequest,
} from './checkMyDay'
import { ROUTING_BLOCKED_MESSAGE } from './boundary'
import type { CheckMyDayServerResult } from '../trips'
import type { Trip } from '../trips'

export function AuthoritativeCheckMyDayPage({
  requestServer,
  pollServer,
  loadTrip,
  onUseSuggestedOrder,
}: {
  requestServer: () => Promise<CheckMyDayServerResult>
  pollServer: (requestId: string) => Promise<CheckMyDayServerResult>
  loadTrip: () => Promise<Trip | null>
  onUseSuggestedOrder?: (requestId: string, expectedVersion: number) => void | Promise<void>
}) {
  const runSequence = useRef(0)
  const runActive = useRef(false)
  const [result, setResult] = useState<CheckMyDayServerResult | null>(null)
  const [pending, setPending] = useState(false)
  const [cancelMessage, setCancelMessage] = useState<string | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoadFailed, setTripLoadFailed] = useState(false)
  const [requestFailed, setRequestFailed] = useState(false)
  const [choicePending, setChoicePending] = useState(false)
  const [choiceFailed, setChoiceFailed] = useState(false)
  const [choiceMessage, setChoiceMessage] = useState<string | null>(null)
  const [tripRefreshPending, setTripRefreshPending] = useState(false)
  const [tripRefreshFailed, setTripRefreshFailed] = useState(false)
  const [tripRefreshed, setTripRefreshed] = useState(false)
  useEffect(() => () => {
    runSequence.current += 1
    runActive.current = false
  }, [])

  async function run() {
    if (runActive.current) return
    runActive.current = true
    const sequence = ++runSequence.current
    setPending(true)
    setCancelMessage(null)
    setRequestFailed(false)
    setResult(null)
    setTrip(null)
    setTripLoadFailed(false)
    setChoiceFailed(false)
    setChoiceMessage(null)
    setTripRefreshPending(false)
    setTripRefreshFailed(false)
    setTripRefreshed(false)
    try {
      let next = await requestServer()
      if (sequence !== runSequence.current) return
      const requestId = next.requestId
      const tripVersion = next.tripVersion
      if (
        (next.state === 'ready' || next.state === 'running' || next.state === 'suggested') &&
        tripVersion === undefined
      ) {
        next = { requestId, state: 'failed', reason: 'trip_changed' }
      }
      for (
        let attempt = 0;
        attempt < 3 && (next.state === 'ready' || next.state === 'running');
        attempt += 1
      ) {
        const polled = await pollServer(requestId)
        if (sequence !== runSequence.current) return
        if (polled.requestId !== requestId || polled.tripVersion !== tripVersion) {
          next = { requestId, state: 'failed', reason: 'trip_changed', tripVersion }
          break
        }
        next = polled
      }
      if (
        next.state === 'suggested' &&
        (next.requestId !== requestId || next.tripVersion !== tripVersion || tripVersion === undefined)
      ) {
        next = { requestId, state: 'failed', reason: 'trip_changed', tripVersion }
      }
      if (next.state === 'suggested') {
        try {
          const currentTrip = await loadTrip()
          if (sequence !== runSequence.current) return
          if (currentTrip) setTrip(currentTrip)
          else setTripLoadFailed(true)
        } catch {
          if (sequence !== runSequence.current) return
          setTripLoadFailed(true)
        }
      }
      setResult(next)
    } catch {
      if (sequence === runSequence.current) setRequestFailed(true)
    } finally {
      if (sequence === runSequence.current) {
        runActive.current = false
        setPending(false)
      }
    }
  }

  function stopWaiting() {
    runSequence.current += 1
    runActive.current = false
    setPending(false)
    setResult(null)
    setTrip(null)
    setTripLoadFailed(false)
    setRequestFailed(false)
    setTripRefreshPending(false)
    setTripRefreshFailed(false)
    setTripRefreshed(false)
    setCancelMessage(
      'Stopped waiting. A server request or trip read may still finish; late results will be ignored. Refresh your trip before relying on the outcome.',
    )
  }

  async function saveChoice(requestId: string, expectedVersion: number) {
    setChoicePending(true)
    setChoiceFailed(false)
    try {
      if (!onUseSuggestedOrder) throw new Error('Suggested order persistence is unavailable.')
      await onUseSuggestedOrder(requestId, expectedVersion)
      setChoiceMessage('Suggested order saved.')
    } catch {
      setChoiceFailed(true)
    } finally {
      setChoicePending(false)
    }
  }

  async function refreshTrip() {
    const sequence = ++runSequence.current
    setTripRefreshPending(true)
    setTripRefreshFailed(false)
    setTripRefreshed(false)
    try {
      const currentTrip = await loadTrip()
      if (sequence !== runSequence.current) return
      if (!currentTrip) {
        setTripRefreshFailed(true)
        return
      }
      setTrip(currentTrip)
      setTripLoadFailed(false)
      setResult(null)
      setChoiceFailed(false)
      setChoiceMessage(null)
      setTripRefreshed(true)
    } catch {
      if (sequence === runSequence.current) setTripRefreshFailed(true)
    } finally {
      if (sequence === runSequence.current) setTripRefreshPending(false)
    }
  }

  async function retryTripLoad() {
    const sequence = ++runSequence.current
    setTripRefreshPending(true)
    try {
      const currentTrip = await loadTrip()
      if (sequence !== runSequence.current) return
      if (currentTrip) {
        setTrip(currentTrip)
        setTripLoadFailed(false)
      } else {
        setTripLoadFailed(true)
      }
    } catch {
      if (sequence === runSequence.current) setTripLoadFailed(true)
    } finally {
      if (sequence === runSequence.current) setTripRefreshPending(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="authoritative-check-my-day-heading">
        <h1 id="authoritative-check-my-day-heading">Check My Day</h1>
        <p>Antique Trail sends only the server-approved trip coordinates after you ask.</p>
        <button
          className="button"
          type="button"
          disabled={pending || choicePending || tripRefreshPending}
          onClick={() => void run()}
        >
          {pending ? 'Checking…' : 'Check My Day'}
        </button>
        {pending && <button type="button" onClick={stopWaiting}>Stop waiting</button>}
        {cancelMessage && <p role="status">{cancelMessage}</p>}
        {requestFailed && (
          <p role="alert">
            Check My Day could not be completed. Your manual order is unchanged.{' '}
            <button type="button" onClick={() => void run()}>
              Retry
            </button>
          </p>
        )}
        {result?.state === 'blocked' && <p role="status">{ROUTING_BLOCKED_MESSAGE}</p>}
        {(result?.state === 'ready' || result?.state === 'running') && (
          <p role="status">Preparing your suggestion…</p>
        )}
        {result?.state === 'failed' && (
          <p role="status">
            {result.reason === 'trip_changed'
              ? 'The trip changed. Your manual order is unchanged.'
              : 'Check My Day could not be completed. Your manual order is unchanged.'}
          </p>
        )}
        {result?.state === 'suggested' && tripLoadFailed && (
          <>
            <p role="status">The trip could not be refreshed. Your manual order is unchanged.</p>
            <button type="button" disabled={tripRefreshPending} onClick={() => void retryTripLoad()}>
              {tripRefreshPending ? 'Refreshing trip…' : 'Retry trip refresh'}
            </button>
          </>
        )}
        {result?.state === 'suggested' && !tripLoadFailed && !trip && (
          <p role="status">Loading the current trip…</p>
        )}
        {result?.state === 'suggested' && trip && !tripLoadFailed && result.orderedStopIds && (() => {
            const ids = result.orderedStopIds!
            const unique = new Set(ids)
            const valid =
              result.tripVersion === trip.version &&
              ids.length === trip.stops.length &&
              unique.size === ids.length &&
              ids.every((id) => trip.stops.some((stop) => stop.id === id))
            const orderedStops = valid
              ? ids.map((id) => trip.stops.find((stop) => stop.id === id)!)
              : []
            return (
              <>
                {!valid && (
                  <p role="status">
                    The suggested order is stale or incomplete. Your manual order is unchanged.
                  </p>
                )}
                {valid && (
                  <ol aria-label="Suggested stop order">
                    {orderedStops.map((stop) => (
                      <li key={stop.id}>{stop.label}</li>
                    ))}
                  </ol>
                )}
                {valid && (
                  <section aria-labelledby="authoritative-suggestion-heading">
                    <h2 id="authoritative-suggestion-heading">Suggested order</h2>
                    <ul>{result.explanation?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                    <CheckMyDayChoice
                      disabled={choicePending || choiceFailed || choiceMessage !== null}
                      onUseSuggested={() =>
                        result.tripVersion === undefined
                          ? setChoiceFailed(true)
                          : void saveChoice(result.requestId, result.tripVersion)
                      }
                      onKeepOrder={() => setChoiceMessage('Your manual order remains unchanged.')}
                    />
                    {choiceFailed && (
                      <div role="alert">
                        <p>We could not confirm whether the suggestion was applied.</p>
                        {tripRefreshFailed && <p>Trip refresh failed. Try again before using another suggestion.</p>}
                        <button type="button" disabled={tripRefreshPending} onClick={() => void refreshTrip()}>
                          {tripRefreshPending
                            ? 'Refreshing trip…'
                            : tripRefreshFailed
                              ? 'Retry trip refresh'
                              : 'Refresh trip'}
                        </button>
                      </div>
                    )}
                    {choiceMessage && <p role="status">{choiceMessage}</p>}
                  </section>
                )}
              </>
            )
          })()}
        {tripRefreshed && trip && (
          <section aria-labelledby="current-trip-order-heading">
            <h2 id="current-trip-order-heading">Current trip order</h2>
            <p role="status">Trip refreshed. Check My Day again for a suggestion based on the current trip.</p>
            <ol aria-label="Current saved trip order">
              {[...trip.stops]
                .sort((left, right) => left.position - right.position)
                .map((stop) => <li key={stop.id}>{stop.label}</li>)}
            </ol>
          </section>
        )}
      </section>
    </main>
  )
}

export function CheckMyDayPage({
  request,
  provider,
  onUseSuggestedOrder,
}: {
  request: CheckMyDayRequest | null
  provider: CheckMyDayProvider
  onUseSuggestedOrder?: (stopIds: string[]) => void | Promise<void>
}) {
  const [outcome, setOutcome] = useState<CheckMyDayOutcome | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  if (!request)
    return (
      <main>
        <section className="page-card" aria-labelledby="check-my-day-heading">
          <h1 id="check-my-day-heading">Check My Day</h1>
          <p role="status">{ROUTING_BLOCKED_MESSAGE}</p>
          <p>Your manual trip order remains available.</p>
        </section>
      </main>
    )
  const approvedRequest = request

  async function run() {
    setPending(true)
    try {
      setOutcome(await checkMyDay(approvedRequest, provider))
    } finally {
      setPending(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="check-my-day-heading">
        <p className="eyebrow">Trip planning</p>
        <h1 id="check-my-day-heading">Check My Day</h1>
        <p>
          Uses your selected stops, reviewed hours, dwell times, transition buffer, and approved
          routing inputs only after you ask.
        </p>
        <button className="button" type="button" disabled={pending} onClick={() => void run()}>
          {pending ? 'Checking…' : 'Check My Day'}
        </button>
        {outcome?.kind === 'fallback' && (
          <p role="status">
            {outcome.message} Keep My Order: {outcome.originalOrder.join(', ')}.
          </p>
        )}
        {outcome?.kind === 'suggestion' && (
          <section aria-labelledby="suggested-order-heading">
            <h2 id="suggested-order-heading">Suggested order</h2>
            <ol>
              {outcome.itinerary.map((stop) => (
                <li key={stop.id}>
                  <strong>{stop.name}</strong> — arrive {formatMinute(stop.arrivalMinute)}, leave{' '}
                  {formatMinute(stop.departureMinute)}
                  {stop.warning ? ` — ${stop.warning}` : ''}
                </li>
              ))}
            </ol>
            <ul aria-label="Why this order">
              {outcome.explanation.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>Provider attribution: {outcome.evidence.attribution}</p>
            <CheckMyDayChoice
              onUseSuggested={() =>
                Promise.resolve(onUseSuggestedOrder?.(outcome.choices.useSuggestedOrder)).then(() =>
                  setSaved('Suggested order saved.'),
                )
              }
              onKeepOrder={() => setSaved('Your manual order remains unchanged.')}
            />
            {saved && <p role="status">{saved}</p>}
          </section>
        )}
      </section>
    </main>
  )
}

function formatMinute(value: number): string {
  const hours = Math.floor(value / 60) % 24
  const minutes = value % 60
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`
}
