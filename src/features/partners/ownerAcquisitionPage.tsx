import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogClient, CatalogStore } from '../catalog/types'
import { OwnerAcquisitionContent } from './ownerAcquisitionContent'

export function OwnerAcquisitionPage({
  catalog,
  intakeAvailable = false,
}: {
  catalog: CatalogClient
  intakeAvailable?: boolean
}) {
  const [selecting, setSelecting] = useState(false)
  const searchHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.append(robots)
    return () => robots.remove()
  }, [])
  useEffect(() => {
    if (selecting) searchHeading.current?.focus()
  }, [selecting])
  const action = (
    <div className="owner-page__actions">
      <button
        className="button"
        onClick={() => {
          setSelecting(true)
          searchHeading.current?.focus()
        }}
      >
        Add or claim my store
      </button>
      <Link to="/stores?area=topeka-ks">See what shoppers experience</Link>
    </div>
  )
  return (
    <main className="owner-page">
      <OwnerAcquisitionContent action={action} canonicalSiteUrl={window.location.origin} />
      <section className="owner-acquisition__section" aria-labelledby="owner-questions">
        <h2 id="owner-questions">Before you apply</h2>
        <h3>What is reviewed?</h3>
        <p>
          You maintain hours, descriptions, website and official social links. Identity, location,
          category and other sensitive facts need review; photos require rights confirmation and
          moderation before publication. A dated fact check is not a blanket verification of an
          owner.
        </p>
        <h3>Can one person manage several stores?</h3>
        <p>
          This release supports one active Representative per store and one store per
          Representative. For multiple locations or an ownership change,{' '}
          <Link to="/help">contact support</Link> for review.
        </p>
        <h3>Can I leave?</h3>
        <p>
          You can withdraw a pending application or use account privacy controls to export or delete
          your account. Participation is voluntary; current <Link to="/terms">terms</Link> explain
          the consequences. Application review has no promised turnaround time.
        </p>
      </section>
      {selecting && (
        <section className="owner-acquisition__section" aria-labelledby="owner-search-heading">
          <h2 id="owner-search-heading" ref={searchHeading} tabIndex={-1}>
            Find your store first
          </h2>
          {intakeAvailable ? (
            <OwnerStoreSelection catalog={catalog} />
          ) : (
            <>
              <p role="status">
                Store applications are not open yet. You can explore the shopper experience; no
                application or contact details will be collected here.
              </p>
              <Link className="button" to="/stores?area=topeka-ks">
                See what shoppers experience
              </Link>
            </>
          )}
        </section>
      )}
      {!selecting && action}
    </main>
  )
}

function OwnerStoreSelection({ catalog }: { catalog: CatalogClient }) {
  const [query, setQuery] = useState('')
  const [stores, setStores] = useState<CatalogStore[] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )
  async function search(event: FormEvent) {
    event.preventDefault()
    const request = ++generation.current
    setPending(true)
    setError(false)
    setStores(null)
    try {
      const result = await catalog.list({ q: query.trim(), area: 'topeka-ks' })
      if (request === generation.current) setStores(result.stores)
    } catch {
      if (request === generation.current) setError(true)
    } finally {
      if (request === generation.current) setPending(false)
    }
  }
  return (
    <>
      <p>
        Search the public store name before starting an application. Sign-in and MFA come next;
        selecting a listing does not claim it.
      </p>
      <form onSubmit={search}>
        <label htmlFor="owner-store-search">Public store name</label>
        <input
          id="owner-store-search"
          required
          maxLength={120}
          value={query}
          onChange={(event) => {
            generation.current++
            setQuery(event.target.value)
            setStores(null)
            setPending(false)
          }}
        />
        <button className="button" disabled={pending}>
          Search stores
        </button>
      </form>
      {pending && <p role="status">Searching store listings...</p>}
      {error && (
        <p role="alert">Store search is unavailable. Your search is still here; try again.</p>
      )}
      {stores && (
        <>
          <p role="status">
            {stores.length
              ? `${stores.length} matching ${stores.length === 1 ? 'listing' : 'listings'}. Confirm the name and address.`
              : 'No matching listing was found.'}
          </p>
          {stores.length > 0 && (
            <ul className="owner-page__results">
              {stores.map((store) => (
                <li key={store.id}>
                  <h3>{store.name}</h3>
                  <p>{store.address}</p>
                  <Link
                    className="button"
                    to={`/partner/claim?claimStore=${encodeURIComponent(store.id)}`}
                  >
                    Claim {store.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p>If the store is missing, the add-store application will check for duplicates again.</p>
          <Link to="/stores/add">My store is missing: start an add-store application</Link>
        </>
      )}
    </>
  )
}
