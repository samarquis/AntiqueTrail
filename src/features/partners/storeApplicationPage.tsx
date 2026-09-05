import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MaterialTermsGate } from './components'
import type { PartnerClient, PartnerConsentStatus } from './types'
import {
  APPLICATION_ERROR,
  type StoreApplication,
  type StoreApplicationClient,
  type StoreApplicationDraft,
  type ApplicationSearch,
} from './storeApplications'

export function StoreApplicationPage({
  client,
  partner,
}: {
  client: StoreApplicationClient
  partner: PartnerClient
}) {
  const [consent, setConsent] = useState<PartnerConsentStatus | null>(null)
  const [error, setError] = useState(false)
  const { applicationId } = useParams()
  useEffect(() => {
    let active = true
    partner.getConsentStatus().then(
      (value) => {
        if (active) setConsent(value)
      },
      () => {
        if (active) setError(true)
      },
    )
    return () => {
      active = false
    }
  }, [partner])
  return (
    <main>
      <section className="page-card">
        <h1>Add a store</h1>
        <p>
          Find the listing first. An application does not publish a store or grant access; an
          Administrator reviews eligibility, authority, and the store facts.
        </p>
        {error ? (
          <p role="alert">{APPLICATION_ERROR}</p>
        ) : !consent ? (
          <p role="status">Checking material terms…</p>
        ) : (
          <MaterialTermsGate client={partner} status={consent} onAccepted={setConsent}>
            <ApplicationForm
              key={applicationId ?? 'current'}
              client={client}
              applicationId={applicationId}
            />
          </MaterialTermsGate>
        )}
      </section>
    </main>
  )
}

function ApplicationForm({
  client,
  applicationId,
}: {
  client: StoreApplicationClient
  applicationId: string | undefined
}) {
  const [draft, setDraft] = useState<StoreApplicationDraft | null>(null)
  const [options, setOptions] = useState<Awaited<
    ReturnType<StoreApplicationClient['options']>
  > | null>(null)
  const [application, setApplication] = useState<StoreApplication | null>(null)
  const [search, setSearch] = useState<ApplicationSearch | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [channel, setChannel] = useState('published_business_contact')
  useEffect(() => {
    let active = true
    Promise.all([client.options(), client.status(applicationId)]).then(
      ([choices, current]) => {
        if (!active) return
        if (applicationId && !current) {
          setError(true)
          return
        }
        setOptions(choices)
        setApplication(current)
        setDraft(
          current?.draft ?? {
            name: '',
            address: '',
            areaId: choices.areas[0]?.id ?? '',
            categoryId: '',
            summary: '',
            description: '',
            phone: '',
            website: '',
            ownerConfirmed: false,
            hours: Array.from({ length: 7 }, (_, index) => ({
              day: index + 1,
              closed: true,
              opens: '09:00',
              closes: '17:00',
            })),
          },
        )
      },
      () => {
        if (active) setError(true)
      },
    )
    return () => {
      active = false
    }
  }, [client, applicationId])
  async function perform(action: () => Promise<StoreApplication>) {
    setPending(true)
    setError(false)
    setSaved(false)
    try {
      const next = await action()
      setApplication(next)
      if (next.draft) setDraft(next.draft)
      setSaved(true)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  async function find(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    setPending(true)
    setError(false)
    try {
      setSearch(await client.search(draft))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }
  if (!draft || !options)
    return error ? (
      <p role="alert">{APPLICATION_ERROR}</p>
    ) : (
      <p role="status">Loading application…</p>
    )
  const matchedStoreId = application?.matchedStoreId
  const editable = !application || ['draft', 'changes_requested'].includes(application.state)
  function change(
    field: 'name' | 'address' | 'categoryId' | 'summary' | 'description' | 'phone' | 'website',
    value: string,
  ) {
    if (!draft) return
    setDraft({ ...draft, [field]: value })
    setSaved(false)
    if (field === 'name' || field === 'address') setSearch(null)
  }
  return (
    <>
      {error && <p role="alert">{APPLICATION_ERROR} Your entered draft is still here.</p>}
      {application && (
        <p role="status">Application status: {application.state.replaceAll('_', ' ')}.</p>
      )}
      {saved && <p role="status">Saved.</p>}
      {application?.state === 'approved' && (
        <p>
          Your store was approved with Free participation. Sign in with MFA to open your Store
          Portal.
        </p>
      )}
      {application?.claimId && <Link to="/partner/claim">Continue the existing-store claim</Link>}
      {application?.state === 'duplicate_review' && matchedStoreId && (
        <section>
          <h2>A possible existing listing needs review</h2>
          <p>
            A second store will not be created. Confirm the existing listing to continue its claim
            review.
          </p>
          {application.matches.map((match) => (
            <p key={match.storeId}>
              {match.name} / {match.address}
            </p>
          ))}
          <button
            disabled={pending}
            onClick={() => void perform(() => client.convert(application, matchedStoreId))}
          >
            Confirm existing listing and continue claim
          </button>
        </section>
      )}
      {application && ['draft', 'submitted', 'changes_requested'].includes(application.state) && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void perform(async () => {
              const next = await client.signal(application, channel, evidence)
              setEvidence('')
              return next
            })
          }}
        >
          <fieldset disabled={pending}>
            <legend>Authority evidence for review</legend>
            <p>
              Provide a reference for each independent verification channel. Do not enter passwords
              or identity documents.
            </p>
            <label>
              Channel
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
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </label>
            <button>Submit evidence reference</button>
          </fieldset>
        </form>
      )}
      {editable && (
        <form onSubmit={find}>
          <fieldset disabled={pending}>
            <legend>Find the store before adding it</legend>
            <label htmlFor="application-name">Store name</label>
            <input
              id="application-name"
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => change('name', e.target.value)}
            />
            <label htmlFor="application-address">Street address in Topeka</label>
            <input
              id="application-address"
              required
              maxLength={240}
              value={draft.address}
              onChange={(e) => change('address', e.target.value)}
            />
            {!application && <button type="submit">Search existing listings</button>}
          </fieldset>
          {search && !application && (
            <section aria-label="Search results">
              {search.matches.length ? (
                <ul>
                  {search.matches.map((match) => (
                    <li key={match.storeId}>
                      {match.name} — {match.address}{' '}
                      <Link to={`/partner/claim?claimStore=${match.storeId}`}>
                        Claim this listing
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No matching listing was found.</p>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => void perform(() => client.start(draft, search.searchId))}
              >
                Continue add-store application
              </button>
            </section>
          )}
          {application && (
            <fieldset disabled={pending}>
              <legend>Store facts for review</legend>
              <label htmlFor="application-category">Primary category</label>
              <select
                id="application-category"
                value={draft.categoryId}
                onChange={(e) => change('categoryId', e.target.value)}
              >
                <option value="">Choose a category</option>
                {options.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label htmlFor="application-summary">Short summary</label>
              <input
                id="application-summary"
                maxLength={280}
                value={draft.summary}
                onChange={(e) => change('summary', e.target.value)}
              />
              <label htmlFor="application-description">Description</label>
              <textarea
                id="application-description"
                maxLength={4000}
                value={draft.description}
                onChange={(e) => change('description', e.target.value)}
              />
              <label htmlFor="application-phone">Published business phone</label>
              <input
                id="application-phone"
                type="tel"
                maxLength={40}
                value={draft.phone}
                onChange={(e) => change('phone', e.target.value)}
              />
              <label htmlFor="application-website">Business website</label>
              <input
                id="application-website"
                type="url"
                maxLength={500}
                value={draft.website}
                onChange={(e) => change('website', e.target.value)}
              />
              {draft.hours.map((hours, index) => (
                <fieldset key={hours.day}>
                  <legend>
                    {
                      [
                        'Monday',
                        'Tuesday',
                        'Wednesday',
                        'Thursday',
                        'Friday',
                        'Saturday',
                        'Sunday',
                      ][index]
                    }
                  </legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={hours.closed}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          hours: draft.hours.map((h, i) =>
                            i === index ? { ...h, closed: e.target.checked } : h,
                          ),
                        })
                      }
                    />
                    Closed
                  </label>
                  {!hours.closed && (
                    <>
                      <label>
                        Opens
                        <input
                          type="time"
                          value={hours.opens}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              hours: draft.hours.map((h, i) =>
                                i === index ? { ...h, opens: e.target.value } : h,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Closes
                        <input
                          type="time"
                          value={hours.closes}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              hours: draft.hours.map((h, i) =>
                                i === index ? { ...h, closes: e.target.value } : h,
                              ),
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={draft.ownerConfirmed}
                  onChange={(e) => setDraft({ ...draft, ownerConfirmed: e.target.checked })}
                />
                I confirm these store facts and understand that eligibility, authority, and
                publication require independent review.
              </label>
              <button
                type="button"
                onClick={() => void perform(() => client.save(application, draft))}
              >
                Save draft
              </button>
              <button
                type="button"
                onClick={() =>
                  void perform(async () => {
                    const saved = await client.save(application, draft)
                    setApplication(saved)
                    return client.submit(saved)
                  })
                }
              >
                Submit for review
              </button>
            </fieldset>
          )}
        </form>
      )}
      {application && !['approved', 'rejected', 'withdrawn'].includes(application.state) && (
        <button disabled={pending} onClick={() => void perform(() => client.withdraw(application))}>
          Withdraw application
        </button>
      )}
      <p>
        Only eligible brick-and-mortar Topeka antique or vintage stores with recurring public hours
        can be approved. For unsupported or multiple locations,{' '}
        <Link to="/help">contact support</Link>.
      </p>
    </>
  )
}
