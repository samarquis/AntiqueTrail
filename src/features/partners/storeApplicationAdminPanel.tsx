import { useState } from 'react'
import {
  APPLICATION_ERROR,
  type StoreApplication,
  type StoreApplicationAdminClient,
  type ApplicationAdminOperation,
} from './storeApplications'

export function StoreApplicationAdminPanel({ client }: { client: StoreApplicationAdminClient }) {
  const [applicationId, setApplicationId] = useState('')
  const [current, setCurrent] = useState<StoreApplication | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [reasonCode, setReasonCode] = useState('')
  const [channel, setChannel] = useState('published_business_contact')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [verificationEventReference, setVerificationEventReference] = useState('')
  const [factsConfirmed, setFactsConfirmed] = useState(false)
  const [exactTopekaEligible, setExactTopekaEligible] = useState(false)
  const [noClosureOrHold, setNoClosureOrHold] = useState(false)
  const [releaseReceiptId, setReleaseReceiptId] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [confirm, setConfirm] = useState(false)
  async function perform(action: () => Promise<StoreApplication>) {
    setPending(true)
    setError(false)
    try {
      setCurrent(await action())
      setConfirm(false)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  function command(
    operation: ApplicationAdminOperation,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    if (current) void perform(() => client.command(operation, current, { ...details, reasonCode }))
  }
  return (
    <section aria-label="Add-store review">
      <h2>Add-store applications</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setCurrent(null)
          setFactsConfirmed(false)
          setExactTopekaEligible(false)
          setNoClosureOrHold(false)
          setIdempotencyKey(crypto.randomUUID())
          void perform(() => client.read(applicationId))
        }}
      >
        <label>
          Application reference
          <input
            required
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
          />
        </label>
        <button disabled={pending}>Open and assign application</button>
      </form>
      {error && <p role="alert">{APPLICATION_ERROR}</p>}
      {current && (
        <fieldset disabled={pending}>
          <legend>Assigned application review</legend>
          <p role="status">Application status: {current.state.replaceAll('_', ' ')}.</p>
          {current.draft && (
            <>
              <h3>{current.draft.name}</h3>
              <p>Primary category: {current.categoryLabel}</p>
              <p>{current.draft.address}</p>
              <p>{current.draft.summary}</p>
              <p>{current.draft.description}</p>
              <p>
                Phone: {current.draft.phone || 'Not supplied'} · Website:{' '}
                {current.draft.website || 'Not supplied'}
              </p>
              <ul>
                {current.draft.hours.map((h) => (
                  <li key={h.day}>
                    {
                      [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ][h.day - 1]
                    }
                    : {h.closed ? 'Closed' : `${h.opens}–${h.closes}`}
                  </li>
                ))}
              </ul>
              <label>
                Decision reason code
                <input
                  required
                  pattern="[a-z][a-z0-9_]{1,63}"
                  value={reasonCode}
                  onChange={(event) => setReasonCode(event.target.value)}
                />
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  command('verify_signal', {
                    channelClass: channel,
                    evidenceReference,
                    verificationEventReference,
                  })
                }}
              >
                <h3>Verify an independent authority channel</h3>
                <p>
                  Use separate evidence objects and verification events for each channel. One must
                  verify the published business contact.
                </p>
                <label>
                  Verification channel
                  <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                    <option value="published_business_contact">Published business contact</option>
                    <option value="callback">Independent callback</option>
                    <option value="mailed_code">Mailed code</option>
                    <option value="filing_lookup">Public filing</option>
                    <option value="in_person">In-person inspection</option>
                  </select>
                </label>
                <label>
                  Evidence reference
                  <input
                    required
                    maxLength={500}
                    value={evidenceReference}
                    onChange={(event) => setEvidenceReference(event.target.value)}
                  />
                </label>
                <label>
                  Verification event reference
                  <input
                    required
                    maxLength={500}
                    value={verificationEventReference}
                    onChange={(event) => setVerificationEventReference(event.target.value)}
                  />
                </label>
                <button>Record verified channel</button>
              </form>
              <h3>Verify store facts</h3>
              <label>
                <input
                  type="checkbox"
                  checked={factsConfirmed}
                  onChange={(event) => setFactsConfirmed(event.target.checked)}
                />
                I independently checked the owner-confirmed identity, contact, category and hours.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={exactTopekaEligible}
                  onChange={(event) => setExactTopekaEligible(event.target.checked)}
                />
                This is an eligible store inside the exact Topeka boundary.
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={noClosureOrHold}
                  onChange={(event) => setNoClosureOrHold(event.target.checked)}
                />
                There is no closure, hold, or unresolved authority conflict.
              </label>
              <button
                disabled={!factsConfirmed || !exactTopekaEligible || !noClosureOrHold}
                onClick={() =>
                  command('verify', { factsConfirmed, exactTopekaEligible, noClosureOrHold })
                }
              >
                Record verified facts
              </button>
              <label>
                Current regional release receipt
                <input
                  value={releaseReceiptId}
                  onChange={(event) => setReleaseReceiptId(event.target.value)}
                />
              </label>
              {confirm ? (
                <p>
                  Approve {current.draft.name} at {current.draft.address}, publish the verified
                  listing, and grant this applicant Free participation?
                </p>
              ) : null}
              <button
                onClick={() => {
                  if (!confirm) setConfirm(true)
                  else command('approve', { idempotencyKey, releaseReceiptId })
                }}
              >
                {confirm ? 'Confirm approval and Free participation' : 'Review approval'}
              </button>
              <button onClick={() => command('changes')}>Request changes</button>
              <button onClick={() => command('reject')}>Reject application</button>
            </>
          )}
        </fieldset>
      )}
    </section>
  )
}
