import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  GENERIC_PORTAL_ERROR,
  MEDIA_GATE_MESSAGE,
  PORTAL_ACCESS_ERROR,
  copyHoursDay,
  unavailablePortalClient,
  validateHours,
  validateOfficialLink,
  validateUpdateDraft,
} from './portalClient'
import type {
  HolidayHours,
  HoursInterval,
  OfficialLink,
  OfficialLinkPlatform,
  PortalClient,
  PortalControlledChangeDraft,
  PortalDiagnostic,
  PortalHours,
  PortalHomeSnapshot,
  PortalManagedFields,
  PortalPreview,
  StoreUpdate,
  StoreUpdateDraft,
  SupportCategory,
  SupportTicket,
} from './types'

const UPDATE_TYPES: Array<{ value: StoreUpdateDraft['type']; label: string }> = [
  { value: 'new_finds', label: 'New Finds' },
  { value: 'sale', label: 'Sale' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'store_news', label: 'Store News' },
]
const LINK_PLATFORMS: Array<{ value: OfficialLinkPlatform; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'tiktok', label: 'TikTok' },
]
const SUPPORT_CATEGORIES: Array<{ value: SupportCategory; label: string }> = [
  { value: 'bug', label: 'Bug' },
  { value: 'confusing_workflow', label: 'Confusing workflow' },
  { value: 'store_data_correction', label: 'Store-data correction' },
  { value: 'feature_idea', label: 'Feature idea' },
  { value: 'security_privacy', label: 'Security or privacy concern' },
]

function PortalCard({
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
      <section className="page-card" aria-labelledby="portal-heading">
        <p className="eyebrow">Store Portal</p>
        <h1 id="portal-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function GenericPortalError() {
  return <p role="alert">{GENERIC_PORTAL_ERROR}</p>
}

function PortalNav() {
  return (
    <nav aria-label="Store Portal sections">
      <ul>
        <li>
          <Link to="/store-portal">Portal home</Link>
        </li>
        <li>
          <Link to="/store-portal/hours">Hours &amp; holidays</Link>
        </li>
        <li>
          <Link to="/store-portal/info">Store information</Link>
        </li>
        <li>
          <Link to="/store-portal/changes">Pending changes</Link>
        </li>
        <li>
          <Link to="/store-portal/updates">Store Updates</Link>
        </li>
        <li>
          <Link to="/store-portal/links">Official links</Link>
        </li>
        <li>
          <Link to="/store-portal/support">Access &amp; Help</Link>
        </li>
      </ul>
    </nav>
  )
}

function Loading() {
  return <p role="status">Loading Store Portal…</p>
}

export function PortalAccessDeniedPage() {
  return (
    <PortalCard
      title="Store Portal unavailable"
      description="This account cannot access the requested store workspace."
    >
      <p role="alert">{PORTAL_ACCESS_ERROR}</p>
      <Link className="button" to="/stores">
        Browse stores
      </Link>
    </PortalCard>
  )
}

export function PortalHomePage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [snapshot, setSnapshot] = useState<PortalHomeSnapshot | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getHome()
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
      <PortalCard
        title="Store Portal unavailable"
        description="Your scoped workspace is temporarily unavailable."
      >
        <GenericPortalError />
      </PortalCard>
    )
  if (!snapshot)
    return (
      <PortalCard
        title="Store Portal"
        description="Manage approved information for your scoped store."
      >
        <Loading />
      </PortalCard>
    )
  const needsAttention = snapshot.freshness.state !== 'verified'
  return (
    <PortalCard
      title={snapshot.store.name}
      description="Manage approved store information from a phone or keyboard."
    >
      <PortalNav />
      <dl>
        <div>
          <dt>Public listing</dt>
          <dd>{snapshot.store.listingState.replaceAll('_', ' ')}</dd>
        </div>
        <div>
          <dt>Store timezone</dt>
          <dd>{snapshot.store.timeZone}</dd>
        </div>
        <div>
          <dt>Hours verification</dt>
          <dd>{snapshot.freshness.label}</dd>
        </div>
      </dl>
      {needsAttention && (
        <aside role="status">
          <strong>{snapshot.freshness.label}</strong>
          <p>Review hours and confirm the current public information.</p>
        </aside>
      )}
      <p>
        <Link className="button" to="/store-portal/hours">
          Update Hours
        </Link>{' '}
        <Link className="button" to="/store-portal/preview">
          Preview Public Listing
        </Link>
      </p>
      <section aria-labelledby="portal-information-heading">
        <h2 id="portal-information-heading">Store Information</h2>
        <p>
          Regular hours, holiday hours, phone, website, description, and temporary closure publish
          immediately after a successful save.
        </p>
        <p>
          Store identity, address, ownership, categories, permanent closure, and official photos
          require Administrator review.
        </p>
      </section>
      <section aria-labelledby="portal-freshness-heading">
        <h2 id="portal-freshness-heading">Freshness &amp; provenance</h2>
        <p>
          {snapshot.provenance.sourceLabel}; verified by {snapshot.provenance.verifiedBy} on{' '}
          {snapshot.provenance.verifiedAt}.
        </p>
        <p>
          {snapshot.provenance.ownerConfirmed
            ? 'Owner confirmation recorded.'
            : 'Owner confirmation is not recorded.'}
        </p>
      </section>
      <section aria-labelledby="portal-pending-heading">
        <h2 id="portal-pending-heading">Pending Changes</h2>
        {snapshot.pendingChanges.length === 0 ? (
          <p>No controlled changes are waiting for review.</p>
        ) : (
          <ul>
            {snapshot.pendingChanges.map((change) => (
              <li key={change.id}>
                {change.field}: {change.state}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="portal-photos-heading">
        <h2 id="portal-photos-heading">Photos</h2>
        <p role="status">{MEDIA_GATE_MESSAGE}</p>
      </section>
    </PortalCard>
  )
}

function emptyInterval(): HoursInterval {
  return { opensAt: '10:00', closesAt: '17:00' }
}

function updateInterval(
  hours: PortalHours,
  weekday: number,
  intervalIndex: number,
  key: keyof HoursInterval,
  value: string,
): PortalHours {
  return {
    ...hours,
    weekly: hours.weekly.map((day) => {
      if (day.weekday !== weekday) return day
      const intervals = [...day.intervals]
      intervals[intervalIndex] = { ...(intervals[intervalIndex] ?? emptyInterval()), [key]: value }
      return { ...day, isClosed: false, intervals }
    }),
  }
}

export function PortalHoursPage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [hours, setHours] = useState<PortalHours | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getHours()
      .then((result) => {
        if (!cancelled) setHours(result)
      })
      .catch(() => {
        if (!cancelled) setError(GENERIC_PORTAL_ERROR)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  if (error && !hours)
    return (
      <PortalCard title="Hours & holidays" description="Keep the public schedule current.">
        <GenericPortalError />
      </PortalCard>
    )
  if (!hours)
    return (
      <PortalCard title="Hours & holidays" description="Keep the public schedule current.">
        <Loading />
      </PortalCard>
    )
  const currentHours = hours
  function submit(event: FormEvent) {
    event.preventDefault()
    const errors = validateHours(currentHours)
    if (errors.length) {
      setError(errors.join(' '))
      setStatus(null)
      return
    }
    setPending(true)
    setError(null)
    client
      .saveHours(currentHours)
      .then(() => setStatus('Hours saved and freshness updated.'))
      .catch(() => setError(GENERIC_PORTAL_ERROR))
      .finally(() => setPending(false))
  }
  function addHoliday() {
    const holiday: HolidayHours = { localDate: '', label: '', isClosed: true, intervals: [] }
    setHours({ ...currentHours, holidays: [...currentHours.holidays, holiday] })
  }
  return (
    <PortalCard
      title="Hours & holidays"
      description={`Publishes Immediately · Store timezone: ${currentHours.timeZone}`}
    >
      <PortalNav />
      <form onSubmit={submit}>
        <fieldset>
          <legend>Weekly hours</legend>
          {currentHours.weekly.map((day) => {
            const first = day.intervals[0] ?? emptyInterval()
            const second = day.intervals[1]
            return (
              <div key={day.weekday}>
                <h2>{day.label}</h2>
                <label>
                  <input
                    type="checkbox"
                    checked={day.isClosed}
                    onChange={(event) =>
                      setHours({
                        ...currentHours,
                        weekly: currentHours.weekly.map((item) =>
                          item.weekday === day.weekday
                            ? {
                                ...item,
                                isClosed: event.target.checked,
                                intervals: event.target.checked ? [] : [first],
                              }
                            : item,
                        ),
                      })
                    }
                  />{' '}
                  Closed
                </label>
                {!day.isClosed && (
                  <>
                    <label htmlFor={`hours-${day.weekday}-open-1`}>First opening</label>
                    <input
                      id={`hours-${day.weekday}-open-1`}
                      type="time"
                      value={first.opensAt}
                      onChange={(event) =>
                        setHours(
                          updateInterval(
                            currentHours,
                            day.weekday,
                            0,
                            'opensAt',
                            event.target.value,
                          ),
                        )
                      }
                    />
                    <label htmlFor={`hours-${day.weekday}-close-1`}>First closing</label>
                    <input
                      id={`hours-${day.weekday}-close-1`}
                      type="time"
                      value={first.closesAt}
                      onChange={(event) =>
                        setHours(
                          updateInterval(
                            currentHours,
                            day.weekday,
                            0,
                            'closesAt',
                            event.target.value,
                          ),
                        )
                      }
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(second)}
                        onChange={(event) =>
                          setHours({
                            ...currentHours,
                            weekly: currentHours.weekly.map((item) =>
                              item.weekday === day.weekday
                                ? {
                                    ...item,
                                    intervals: event.target.checked
                                      ? [...item.intervals, emptyInterval()]
                                      : item.intervals.slice(0, 1),
                                  }
                                : item,
                            ),
                          })
                        }
                      />{' '}
                      Add second range
                    </label>
                    {second && (
                      <>
                        <label htmlFor={`hours-${day.weekday}-open-2`}>Second opening</label>
                        <input
                          id={`hours-${day.weekday}-open-2`}
                          type="time"
                          value={second.opensAt}
                          onChange={(event) =>
                            setHours(
                              updateInterval(
                                currentHours,
                                day.weekday,
                                1,
                                'opensAt',
                                event.target.value,
                              ),
                            )
                          }
                        />
                        <label htmlFor={`hours-${day.weekday}-close-2`}>Second closing</label>
                        <input
                          id={`hours-${day.weekday}-close-2`}
                          type="time"
                          value={second.closesAt}
                          onChange={(event) =>
                            setHours(
                              updateInterval(
                                currentHours,
                                day.weekday,
                                1,
                                'closesAt',
                                event.target.value,
                              ),
                            )
                          }
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setHours(copyHoursDay(currentHours, day.weekday))}
                    >
                      Copy {day.label} to Other Days
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </fieldset>
        <fieldset>
          <legend>Date-specific hours</legend>
          <p>A date-specific schedule replaces the weekly schedule for that date.</p>
          {currentHours.holidays.map((holiday, index) => (
            <div key={`${holiday.localDate}-${index}`}>
              <label htmlFor={`holiday-date-${index}`}>Date</label>
              <input
                id={`holiday-date-${index}`}
                type="date"
                value={holiday.localDate}
                onChange={(event) =>
                  setHours({
                    ...currentHours,
                    holidays: currentHours.holidays.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, localDate: event.target.value } : item,
                    ),
                  })
                }
              />
              <label htmlFor={`holiday-label-${index}`}>Holiday label</label>
              <input
                id={`holiday-label-${index}`}
                value={holiday.label}
                onChange={(event) =>
                  setHours({
                    ...currentHours,
                    holidays: currentHours.holidays.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item,
                    ),
                  })
                }
              />
              <label>
                <input
                  type="checkbox"
                  checked={holiday.isClosed}
                  onChange={(event) =>
                    setHours({
                      ...currentHours,
                      holidays: currentHours.holidays.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              isClosed: event.target.checked,
                              intervals: event.target.checked ? [] : [emptyInterval()],
                            }
                          : item,
                      ),
                    })
                  }
                />{' '}
                Closed
              </label>
            </div>
          ))}
          <button type="button" onClick={addHoliday}>
            Add holiday hours
          </button>
        </fieldset>
        <fieldset>
          <legend>Temporary closure</legend>
          <p>Use both dates for a temporary closure; the approved listing remains available.</p>
          <label htmlFor="closure-start">Start date</label>
          <input
            id="closure-start"
            type="date"
            value={currentHours.temporaryClosure?.startDate ?? ''}
            onChange={(event) =>
              setHours({
                ...currentHours,
                temporaryClosure: {
                  startDate: event.target.value,
                  endDate: currentHours.temporaryClosure?.endDate ?? event.target.value,
                  reason: currentHours.temporaryClosure?.reason,
                },
              })
            }
          />
          <label htmlFor="closure-end">End date</label>
          <input
            id="closure-end"
            type="date"
            value={currentHours.temporaryClosure?.endDate ?? ''}
            onChange={(event) =>
              setHours({
                ...currentHours,
                temporaryClosure: {
                  startDate: currentHours.temporaryClosure?.startDate ?? event.target.value,
                  endDate: event.target.value,
                  reason: currentHours.temporaryClosure?.reason,
                },
              })
            }
          />
          <label htmlFor="closure-reason">Reason (optional)</label>
          <input
            id="closure-reason"
            value={currentHours.temporaryClosure?.reason ?? ''}
            onChange={(event) =>
              setHours({
                ...currentHours,
                temporaryClosure: currentHours.temporaryClosure
                  ? { ...currentHours.temporaryClosure, reason: event.target.value }
                  : undefined,
              })
            }
          />
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save hours'}
        </button>
      </form>
    </PortalCard>
  )
}

export function PortalUpdatesPage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [updates, setUpdates] = useState<StoreUpdate[]>([])
  const [draft, setDraft] = useState<StoreUpdateDraft>({
    type: 'new_finds',
    headline: '',
    details: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    client
      .listUpdates()
      .then(setUpdates)
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }, [client])
  function submit(event: FormEvent) {
    event.preventDefault()
    const errors = validateUpdateDraft(draft)
    if (errors.length) {
      setError(errors.join(' '))
      return
    }
    setError(null)
    client
      .createUpdate(draft)
      .then((created) => {
        setUpdates((current) => [created, ...current])
        setStatus('Text update published.')
        setDraft({ type: 'new_finds', headline: '', details: '' })
      })
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  function changeState(update: StoreUpdate, action: 'archive' | 'restore') {
    const request =
      action === 'archive' ? client.archiveUpdate(update.id) : client.restoreUpdate(update.id)
    request
      .then((next) =>
        setUpdates((current) => current.map((item) => (item.id === next.id ? next : item))),
      )
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  return (
    <PortalCard
      title="Store Updates"
      description="Text-only updates publish immediately; images remain blocked until M-01."
    >
      <PortalNav />
      <form onSubmit={submit}>
        <fieldset>
          <legend>New Store Update</legend>
          <label htmlFor="update-type">Type</label>
          <select
            id="update-type"
            value={draft.type}
            onChange={(event) =>
              setDraft({ ...draft, type: event.target.value as StoreUpdateDraft['type'] })
            }
          >
            {UPDATE_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <label htmlFor="update-headline">Headline</label>
          <input
            id="update-headline"
            maxLength={120}
            value={draft.headline}
            onChange={(event) => setDraft({ ...draft, headline: event.target.value })}
            required
          />
          <label htmlFor="update-details">Details</label>
          <textarea
            id="update-details"
            maxLength={2000}
            value={draft.details}
            onChange={(event) => setDraft({ ...draft, details: event.target.value })}
            required
          />
          <label htmlFor="update-vendor">Vendor or booth label (optional)</label>
          <input
            id="update-vendor"
            value={draft.vendorLabel ?? ''}
            onChange={(event) => setDraft({ ...draft, vendorLabel: event.target.value })}
          />
          <label htmlFor="update-source">Official source link (optional)</label>
          <input
            id="update-source"
            type="url"
            value={draft.sourceUrl ?? ''}
            onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })}
          />
          {draft.type === 'sale' && (
            <>
              <label htmlFor="update-end">Sale end date</label>
              <input
                id="update-end"
                type="date"
                value={draft.endDate ?? ''}
                onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
                required
              />
            </>
          )}
          <p role="status">{MEDIA_GATE_MESSAGE}</p>
        </fieldset>
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Publish text update
        </button>
      </form>
      <section aria-labelledby="updates-list-heading">
        <h2 id="updates-list-heading">Your updates</h2>
        {updates.length === 0 ? (
          <p>No Store Updates yet.</p>
        ) : (
          <ul>
            {updates.map((update) => (
              <li key={update.id}>
                <strong>{update.headline}</strong> — {update.state}{' '}
                <button
                  type="button"
                  onClick={() =>
                    changeState(update, update.state === 'archived' ? 'restore' : 'archive')
                  }
                >
                  {update.state === 'archived' ? 'Restore' : 'Archive'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PortalCard>
  )
}

export function PortalLinksPage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [links, setLinks] = useState<OfficialLink[]>([])
  const [platform, setPlatform] = useState<OfficialLinkPlatform>('facebook')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    client
      .listOfficialLinks()
      .then(setLinks)
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }, [client])
  function submit(event: FormEvent) {
    event.preventDefault()
    const result = validateOfficialLink(platform, url)
    if (!result.ok) {
      setError(result.reason)
      return
    }
    client
      .saveOfficialLink({ platform, url: result.normalizedUrl })
      .then((saved) => {
        setLinks((current) => [
          ...current.filter((link) => link.platform !== saved.platform),
          saved,
        ])
        setUrl('')
        setStatus('Official link published.')
        setError(null)
      })
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  function remove(link: OfficialLink) {
    client
      .removeOfficialLink(link.platform)
      .then(() => {
        setLinks((current) => current.filter((item) => item.platform !== link.platform))
        setStatus('Official link removed.')
      })
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  return (
    <PortalCard
      title="Official links"
      description="Publish one validated official business profile per supported platform. No credentials, feeds, or tracking are requested."
    >
      <PortalNav />
      <form onSubmit={submit}>
        <label htmlFor="link-platform">Platform</label>
        <select
          id="link-platform"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as OfficialLinkPlatform)}
        >
          {LINK_PLATFORMS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <label htmlFor="link-url">Official profile URL</label>
        <input
          id="link-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Publish official link
        </button>
      </form>
      <ul>
        {links.map((link) => (
          <li key={link.platform}>
            <a href={link.url} rel="noreferrer">
              {link.platform}: {link.url}
            </a>{' '}
            <button type="button" onClick={() => remove(link)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </PortalCard>
  )
}

function DiagnosticPreview({ diagnostics }: { diagnostics: PortalDiagnostic[] }) {
  return (
    <section aria-labelledby="diagnostics-heading">
      <h2 id="diagnostics-heading">Diagnostics preview</h2>
      <p>
        Only this bounded allowlist is shared with a support request. No private store or shopper
        data is included.
      </p>
      {diagnostics.length ? (
        <ul>
          {diagnostics.map((item) => (
            <li key={item.key}>
              {item.label}: {item.value}
            </li>
          ))}
        </ul>
      ) : (
        <p>No diagnostics selected.</p>
      )}
    </section>
  )
}

function TicketThread({
  ticket,
  client,
  onChange,
}: {
  ticket: SupportTicket
  client: PortalClient
  onChange: (ticket: SupportTicket) => void
}) {
  const [reply, setReply] = useState('')
  const [error, setError] = useState(false)
  function sendReply() {
    if (!reply.trim()) return
    client
      .replySupportTicket(ticket.id, reply.trim())
      .then(onChange)
      .then(() => setReply(''))
      .catch(() => setError(true))
  }
  return (
    <article aria-labelledby={`ticket-${ticket.id}`}>
      <h3 id={`ticket-${ticket.id}`}>{ticket.subject}</h3>
      <p>
        {ticket.category.replaceAll('_', ' ')} · {ticket.state.replaceAll('_', ' ')}
      </p>
      <p>{ticket.body}</p>
      {ticket.diagnostics.length > 0 && <DiagnosticPreview diagnostics={ticket.diagnostics} />}
      <ol>
        {ticket.replies.map((item) => (
          <li key={item.id}>
            <strong>{item.author === 'owner' ? 'You' : 'Support'}:</strong> {item.body}
          </li>
        ))}
      </ol>
      {ticket.state === 'resolved' && (
        <button type="button" onClick={() => client.reopenSupportTicket(ticket.id).then(onChange)}>
          Reopen request
        </button>
      )}
      {ticket.state !== 'resolved' && (
        <>
          <label htmlFor={`reply-${ticket.id}`}>Reply</label>
          <textarea
            id={`reply-${ticket.id}`}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <button type="button" onClick={sendReply}>
            Send reply
          </button>
        </>
      )}
      {ticket.state === 'resolved' && (
        <button
          type="button"
          onClick={() => client.confirmSupportResolution(ticket.id).then(onChange)}
        >
          Confirm resolution
        </button>
      )}
      {error && <p role="alert">{GENERIC_PORTAL_ERROR}</p>}
    </article>
  )
}

export function PortalSupportPage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [category, setCategory] = useState<SupportCategory>('bug')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [diagnostics, setDiagnostics] = useState<PortalDiagnostic[]>([])
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    client
      .listSupportTickets()
      .then(setTickets)
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }, [client])
  function toggleDiagnostics(checked: boolean) {
    setIncludeDiagnostics(checked)
    if (!checked) {
      setDiagnostics([])
      return
    }
    client
      .getDiagnostics()
      .then(setDiagnostics)
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!subject.trim() || !body.trim()) {
      setError('Subject and details are required.')
      return
    }
    client
      .createSupportTicket({
        category,
        subject: subject.trim(),
        body: body.trim(),
        diagnostics: includeDiagnostics ? diagnostics : [],
      })
      .then((ticket) => {
        setTickets((current) => [ticket, ...current])
        setSubject('')
        setBody('')
        setDiagnostics([])
        setIncludeDiagnostics(false)
        setStatus('Support request submitted.')
        setError(null)
      })
      .catch(() => setError(GENERIC_PORTAL_ERROR))
  }
  function replaceTicket(next: SupportTicket) {
    setTickets((current) => current.map((ticket) => (ticket.id === next.id ? next : ticket)))
  }
  return (
    <PortalCard
      title="Access & Help"
      description="Contact support about a pilot workflow and follow the authenticated thread."
    >
      <PortalNav />
      <section aria-labelledby="support-new-heading">
        <h2 id="support-new-heading">Get Help</h2>
        <form onSubmit={submit}>
          <label htmlFor="support-category">Category</label>
          <select
            id="support-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportCategory)}
          >
            {SUPPORT_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <label htmlFor="support-subject">Subject</label>
          <input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
          <label htmlFor="support-body">Details</label>
          <textarea
            id="support-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <label>
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(event) => toggleDiagnostics(event.target.checked)}
            />{' '}
            Include allowlisted diagnostics
          </label>
          {includeDiagnostics && <DiagnosticPreview diagnostics={diagnostics} />}
          <p role="status">{MEDIA_GATE_MESSAGE} Arbitrary attachments are not available.</p>
          {error && <p role="alert">{error}</p>}
          {status && <p role="status">{status}</p>}
          <button className="button" type="submit">
            Submit support request
          </button>
        </form>
      </section>
      <section aria-labelledby="support-requests-heading">
        <h2 id="support-requests-heading">My Requests</h2>
        {tickets.length === 0 ? (
          <p>No support requests.</p>
        ) : (
          tickets.map((ticket) => (
            <TicketThread
              key={ticket.id}
              ticket={ticket}
              client={client}
              onChange={replaceTicket}
            />
          ))
        )}
      </section>
    </PortalCard>
  )
}

export function PortalPreviewPage({ client = unavailablePortalClient }: { client?: PortalClient }) {
  const [preview, setPreview] = useState<PortalPreview | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    client
      .previewPublicListing()
      .then(setPreview)
      .catch(() => setError(true))
  }, [client])
  if (error)
    return (
      <PortalCard
        title="Preview unavailable"
        description="The shopper preview could not be loaded."
      >
        <GenericPortalError />
      </PortalCard>
    )
  if (!preview)
    return (
      <PortalCard
        title="Preview Public Listing"
        description="Review live values before a direct publish."
      >
        <Loading />
      </PortalCard>
    )
  return (
    <PortalCard
      title={`Public preview: ${preview.storeName}`}
      description="Live values remain visible while controlled changes wait for Administrator review."
    >
      <PortalNav />
      <p role="status">
        Listing state: {preview.listingState.replaceAll('_', ' ')} · {preview.freshness.label}
      </p>
      <section aria-labelledby="preview-live-heading">
        <h2 id="preview-live-heading">Live public values</h2>
        <dl>
          {Object.entries(preview.liveFields).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="preview-pending-heading">
        <h2 id="preview-pending-heading">Pending changes (not public)</h2>
        {preview.pendingChanges.length ? (
          <ul>
            {preview.pendingChanges.map((change) => (
              <li key={change.id}>
                {change.field}: {change.state}
              </li>
            ))}
          </ul>
        ) : (
          <p>No pending controlled changes.</p>
        )}
      </section>
    </PortalCard>
  )
}

export function PortalManagedFieldsPage({
  client = unavailablePortalClient,
}: {
  client?: PortalClient
}) {
  const [fields, setFields] = useState<PortalManagedFields | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getHome()
      .then((home) => {
        if (cancelled) return
        if (!home.managedFields) {
          setError(true)
          return
        }
        setFields(home.managedFields)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!fields) return
    setError(false)
    client
      .saveManagedFields(fields)
      .then(() => setStatus('Managed fields published immediately.'))
      .catch(() => setError(true))
  }
  if (error)
    return (
      <PortalCard
        title="Store information unavailable"
        description="Your approved store information could not be loaded."
      >
        <GenericPortalError />
      </PortalCard>
    )
  if (!fields)
    return (
      <PortalCard
        title="Store information"
        description="Loading approved store information before it can be changed."
      >
        <Loading />
      </PortalCard>
    )
  return (
    <PortalCard
      title="Store information"
      description="Phone, website, description, and temporary closure are Representative-Managed Fields and publish immediately."
    >
      <PortalNav />
      <form onSubmit={submit}>
        <label htmlFor="managed-phone">Phone</label>
        <input
          id="managed-phone"
          type="tel"
          value={fields.phone}
          onChange={(event) => setFields({ ...fields, phone: event.target.value })}
        />
        <label htmlFor="managed-website">Website</label>
        <input
          id="managed-website"
          type="url"
          value={fields.website}
          onChange={(event) => setFields({ ...fields, website: event.target.value })}
        />
        <label htmlFor="managed-description">Official description</label>
        <textarea
          id="managed-description"
          value={fields.description}
          onChange={(event) => setFields({ ...fields, description: event.target.value })}
        />
        {error && <GenericPortalError />}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Publish managed fields
        </button>
      </form>
      <p>
        Identity, address, ownership, categories, permanent closure, and official photos use a typed
        change request instead.
      </p>
    </PortalCard>
  )
}

export function PortalControlledChangesPage({
  client = unavailablePortalClient,
}: {
  client?: PortalClient
}) {
  const [draft, setDraft] = useState<PortalControlledChangeDraft>({
    field: 'name',
    requestedValue: '',
    reason: '',
  })
  const [error, setError] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [mediaReady, setMediaReady] = useState<boolean | null>(null)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [mediaKind, setMediaKind] = useState<'cover' | 'gallery'>('gallery')
  const [mediaAltText, setMediaAltText] = useState('')
  const [mediaRights, setMediaRights] = useState(false)
  const [mediaPending, setMediaPending] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [mediaStatus, setMediaStatus] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([client.getMediaCapability(), client.getHome()])
      .then(([capability, home]) => {
        if (!active) return
        setMediaReady(capability.enabled)
        setStoreId(capability.enabled ? home.store.id : null)
      })
      .catch(() => {
        if (active) setMediaReady(false)
      })
    return () => {
      active = false
    }
  }, [client])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.requestedValue.trim() || !draft.reason.trim()) return
    client
      .submitControlledChange({
        ...draft,
        requestedValue: draft.requestedValue.trim(),
        reason: draft.reason.trim(),
      })
      .then(() => {
        setStatus(
          'Change request submitted for Administrator review. The approved value remains live.',
        )
        setDraft({ ...draft, requestedValue: '', reason: '' })
      })
      .catch(() => setError(true))
  }
  function submitMedia(event: FormEvent) {
    event.preventDefault()
    const altText = mediaAltText.normalize('NFKC').trim()
    if (!mediaReady || !storeId || !mediaFile || !mediaRights || !altText) {
      setMediaError('Choose an image, describe it, and confirm that you have publishing rights.')
      return
    }
    setMediaError(null)
    setMediaStatus(null)
    setMediaPending(true)
    client
      .uploadOfficialMedia({
        storeId,
        kind: mediaKind,
        altText,
        file: mediaFile,
        rightsConfirmed: true,
        idempotencyKey: crypto.randomUUID(),
      })
      .then(() => {
        setMediaStatus(
          'The processed derivative is awaiting Administrator review and is not published yet.',
        )
        setMediaFile(null)
        setMediaAltText('')
        setMediaRights(false)
      })
      .catch(() => setMediaError(GENERIC_PORTAL_ERROR))
      .finally(() => setMediaPending(false))
  }
  return (
    <PortalCard
      title="Controlled changes"
      description="These fields require Administrator review and remain unpublished until approved."
    >
      <PortalNav />
      <form onSubmit={submit}>
        <label htmlFor="controlled-field">Field</label>
        <select
          id="controlled-field"
          value={draft.field}
          onChange={(event) =>
            setDraft({
              ...draft,
              field: event.target.value as PortalControlledChangeDraft['field'],
            })
          }
        >
          <option value="name">Store name</option>
          <option value="address">Address or coordinates</option>
          <option value="ownership">Ownership</option>
          <option value="permanent_closure">Permanent closure</option>
          <option value="categories">Categories</option>
        </select>
        <label htmlFor="controlled-value">Requested value</label>
        <textarea
          id="controlled-value"
          value={draft.requestedValue}
          onChange={(event) => setDraft({ ...draft, requestedValue: event.target.value })}
          required
        />
        <label htmlFor="controlled-reason">Reason for change</label>
        <textarea
          id="controlled-reason"
          value={draft.reason}
          onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
          required
        />
        {error && <GenericPortalError />}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Submit change request
        </button>
      </form>
      <section aria-labelledby="official-media-heading">
        <h2 id="official-media-heading">Official photos</h2>
        {mediaReady ? (
          <form onSubmit={submitMedia}>
            <p>
              Images are quarantined, scanned, metadata-stripped, and re-encoded before a separate
              Administrator review. The original file is never published.
            </p>
            <label htmlFor="official-media-kind">Image placement</label>
            <select
              id="official-media-kind"
              value={mediaKind}
              onChange={(event) => setMediaKind(event.target.value as 'cover' | 'gallery')}
            >
              <option value="gallery">Gallery image</option>
              <option value="cover">Cover image</option>
            </select>
            <label htmlFor="official-media-file">Official image file</label>
            <input
              id="official-media-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)}
              required
            />
            <label htmlFor="official-media-alt">Alternative text</label>
            <input
              id="official-media-alt"
              value={mediaAltText}
              maxLength={240}
              onChange={(event) => setMediaAltText(event.target.value)}
              required
            />
            <label>
              <input
                type="checkbox"
                checked={mediaRights}
                onChange={(event) => setMediaRights(event.target.checked)}
              />{' '}
              I confirm that I have rights to publish this image.
            </label>
            {mediaError && <p role="alert">{mediaError}</p>}
            {mediaStatus && <p role="status">{mediaStatus}</p>}
            <button className="button" type="submit" disabled={mediaPending}>
              {mediaPending ? 'Submitting…' : 'Submit image for review'}
            </button>
          </form>
        ) : (
          <p role="status">
            {mediaReady === null ? 'Checking the M-01 media capability…' : MEDIA_GATE_MESSAGE}
          </p>
        )}
      </section>
    </PortalCard>
  )
}

export const StorePortalHomePage = PortalHomePage
export const StorePortalHoursPage = PortalHoursPage
export const StorePortalUpdatesPage = PortalUpdatesPage
export const StorePortalLinksPage = PortalLinksPage
export const StorePortalSupportPage = PortalSupportPage
export const StorePortalPreviewPage = PortalPreviewPage
export const StorePortalControlledChangesPage = PortalControlledChangesPage
