import { useState } from 'react'
import { CheckMyDayChoice } from './components'
import {
  checkMyDay,
  type CheckMyDayOutcome,
  type CheckMyDayProvider,
  type CheckMyDayRequest,
} from './checkMyDay'
import { ROUTING_BLOCKED_MESSAGE } from './boundary'
import type { CheckMyDayServerResult } from '../trips'

export function AuthoritativeCheckMyDayPage({
  requestServer,
  pollServer,
  onUseSuggestedOrder,
  onKeepMyOrder,
}: {
  requestServer: () => Promise<CheckMyDayServerResult>
  pollServer: (requestId: string) => Promise<CheckMyDayServerResult>
  onUseSuggestedOrder?: (stopIds: string[]) => void | Promise<void>
  onKeepMyOrder?: () => void | Promise<void>
}) {
  const [result, setResult] = useState<CheckMyDayServerResult | null>(null)
  const [pending, setPending] = useState(false)
  async function run() {
    setPending(true)
    try {
      let next = await requestServer()
      for (
        let attempt = 0;
        attempt < 3 && (next.state === 'ready' || next.state === 'running');
        attempt += 1
      ) {
        next = await pollServer(next.requestId)
      }
      setResult(next)
    } finally {
      setPending(false)
    }
  }
  return (
    <main>
      <section className="page-card" aria-labelledby="authoritative-check-my-day-heading">
        <h1 id="authoritative-check-my-day-heading">Check My Day</h1>
        <p>Antique Trail sends only the server-approved trip coordinates after you ask.</p>
        <button className="button" type="button" disabled={pending} onClick={() => void run()}>
          {pending ? 'Checking…' : 'Check My Day'}
        </button>
        {result?.state === 'blocked' && <p role="status">{ROUTING_BLOCKED_MESSAGE}</p>}
        {(result?.state === 'ready' || result?.state === 'running') && (
          <p role="status">Preparing your suggestion…</p>
        )}
        {result?.state === 'failed' && (
          <p role="status">The trip changed. Your manual order is unchanged.</p>
        )}
        {result?.state === 'suggested' && result.orderedStopIds && (
          <section aria-labelledby="authoritative-suggestion-heading">
            <h2 id="authoritative-suggestion-heading">Suggested order</h2>
            <ul>{result.explanation?.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <CheckMyDayChoice
              onUseSuggested={() => onUseSuggestedOrder?.(result.orderedStopIds!)}
              onKeepOrder={() => onKeepMyOrder?.()}
            />
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
  onKeepMyOrder,
}: {
  request: CheckMyDayRequest | null
  provider: CheckMyDayProvider
  onUseSuggestedOrder?: (stopIds: string[]) => void | Promise<void>
  onKeepMyOrder?: (stopIds: string[]) => void | Promise<void>
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
              onKeepOrder={() =>
                Promise.resolve(onKeepMyOrder?.(outcome.choices.keepMyOrder)).then(() =>
                  setSaved('Manual order saved.'),
                )
              }
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
