import { useState } from 'react'
import { CheckMyDayChoice } from './components'
import {
  checkMyDay,
  type CheckMyDayOutcome,
  type CheckMyDayProvider,
  type CheckMyDayRequest,
} from './checkMyDay'
import { ROUTING_BLOCKED_MESSAGE } from './boundary'

export function CheckMyDayPage({
  request,
  provider,
  onUseSuggestedOrder,
  onKeepMyOrder,
}: {
  request: CheckMyDayRequest | null
  provider: CheckMyDayProvider
  onUseSuggestedOrder?: (stopIds: string[]) => void
  onKeepMyOrder?: (stopIds: string[]) => void
}) {
  const [outcome, setOutcome] = useState<CheckMyDayOutcome | null>(null)
  const [pending, setPending] = useState(false)

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
              onUseSuggested={() => onUseSuggestedOrder?.(outcome.choices.useSuggestedOrder)}
              onKeepOrder={() => onKeepMyOrder?.(outcome.choices.keepMyOrder)}
            />
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
