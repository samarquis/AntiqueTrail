import React, { useCallback, useEffect, useState } from 'react'
import type { CatalogClient, CatalogFilters, CatalogStore } from './types'
import {
  displayDayLabel,
  formatHours,
  freshnessLabel,
  normalizeQueryParams,
  queryParams,
} from './query'

export function CatalogFiltersForm({
  filters,
  onChange,
}: {
  filters: CatalogFilters
  onChange: (filters: CatalogFilters) => void
}) {
  const [q, setQ] = useState(filters.q ?? '')
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  return (
    <form
      className="catalog-filters"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        onChange({ ...filters, q: q.trim() || undefined })
      }}
    >
      <label htmlFor="catalog-search">Search stores</label>
      <div>
        <input
          id="catalog-search"
          name="q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, town, or category"
        />
        <button type="submit">Search</button>
      </div>
      <label htmlFor="catalog-category">Category</label>
      <select
        id="catalog-category"
        value={filters.category ?? ''}
        onChange={(event) => onChange({ ...filters, category: event.target.value || undefined })}
      >
        <option value="">All categories</option>
        <option value="antique-mall">Antique mall</option>
        <option value="vintage">Vintage</option>
        <option value="furniture">Furniture</option>
        <option value="collectibles">Collectibles</option>
        <option value="home-decor">Home decor</option>
        <option value="flea-market">Flea market</option>
      </select>
      <label htmlFor="catalog-area">Area</label>
      <select
        id="catalog-area"
        value={filters.area ?? ''}
        onChange={(event) => onChange({ ...filters, area: event.target.value || undefined })}
      >
        <option value="">All areas</option>
        <option value="topeka-ks">Topeka</option>
      </select>
    </form>
  )
}

export function CatalogCard({
  store,
  privateActions,
}: {
  store: CatalogStore
  privateActions?: React.ReactNode
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const cover = store.media.find((item) => item.kind === 'cover') ?? store.media[0]
  return (
    <article className="catalog-card">
      {cover && !imageFailed ? (
        <img
          src={cover.src}
          alt={cover.alt || `${store.name} storefront`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="catalog-card__placeholder" role="img" aria-label="Store image unavailable">
          Image unavailable
        </div>
      )}
      <div className="catalog-card__body">
        <p className="catalog-card__area">{store.area.label}</p>
        <h2>
          <a href={`/stores/${encodeURIComponent(store.slug)}`}>{store.name}</a>
        </h2>
        <p>
          {store.town}, {store.state}
        </p>
        {store.summary && <p>{store.summary}</p>}
        <p className="catalog-card__freshness">{freshnessLabel(store)}</p>
        {privateActions}
      </div>
    </article>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert">
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
function LoadingState() {
  return (
    <p role="status" aria-live="polite">
      Loading stores…
    </p>
  )
}
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div role="status">
      <p>{hasFilters ? 'No stores match those filters.' : 'No stores are available yet.'}</p>
      {hasFilters && (
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  )
}

export function BrowsePage({
  client,
  initialSearch = '',
  renderPrivateActions,
}: {
  client: CatalogClient
  initialSearch?: string
  renderPrivateActions?: (store: CatalogStore) => React.ReactNode
}) {
  const [filters, setFilters] = useState(() => normalizeQueryParams(initialSearch))
  const [state, setState] = useState<{
    kind: 'loading' | 'success' | 'error'
    stores?: CatalogStore[]
    message?: string
  }>({ kind: 'loading' })
  const load = useCallback(() => {
    setState({ kind: 'loading' })
    client
      .list(filters)
      .then((result) => setState({ kind: 'success', stores: result.stores }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'Catalog unavailable. Please try again.',
        }),
      )
  }, [client, filters])
  useEffect(() => {
    load()
  }, [load])
  const updateFilters = (next: CatalogFilters) => {
    setFilters(normalizeQueryParams(queryParams(next)))
    const query = queryParams(next).toString()
    if (typeof window !== 'undefined')
      window.history.replaceState({}, '', `/stores${query ? `?${query}` : ''}`)
  }
  return (
    <main>
      <header>
        <p className="eyebrow">Antique Trail</p>
        <h1>Browse stores</h1>
        <p>Find antique and vintage stores with practical, current details.</p>
      </header>
      <CatalogFiltersForm filters={filters} onChange={updateFilters} />
      {state.kind === 'loading' && <LoadingState />}
      {state.kind === 'error' && (
        <ErrorState message={state.message ?? 'Catalog unavailable.'} onRetry={load} />
      )}
      {state.kind === 'success' &&
        (state.stores?.length ? (
          <section aria-label="Store results" className="catalog-grid">
            {state.stores.map((store) => (
              <CatalogCard
                key={store.id || store.slug}
                store={store}
                privateActions={renderPrivateActions?.(store)}
              />
            ))}
          </section>
        ) : (
          <EmptyState
            hasFilters={Boolean(filters.q || filters.category || filters.area)}
            onClear={() => updateFilters({})}
          />
        ))}
    </main>
  )
}

export function DetailsPage({
  client,
  slug,
  renderPrivateActions,
}: {
  client: CatalogClient
  slug: string
  renderPrivateActions?: (store: CatalogStore) => React.ReactNode
}) {
  const [state, setState] = useState<{
    kind: 'loading' | 'success' | 'error' | 'not-found'
    store?: CatalogStore
    message?: string
  }>({ kind: 'loading' })
  const load = useCallback(() => {
    setState({ kind: 'loading' })
    client
      .details(slug)
      .then((store) => setState(store ? { kind: 'success', store } : { kind: 'not-found' }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'Catalog unavailable. Please try again.',
        }),
      )
  }, [client, slug])
  useEffect(() => {
    load()
  }, [load])
  if (state.kind === 'loading')
    return (
      <main>
        <LoadingState />
      </main>
    )
  if (state.kind === 'error')
    return (
      <main>
        <ErrorState message={state.message ?? 'Catalog unavailable.'} onRetry={load} />
      </main>
    )
  if (state.kind === 'not-found')
    return (
      <main>
        <h1>Store not found</h1>
        <p>That store is not available in the catalog.</p>
        <a href="/stores">Back to stores</a>
      </main>
    )
  const store = state.store!
  const cover = store.media.find((item) => item.kind === 'cover') ?? store.media[0]
  return (
    <main>
      <a href="/stores">← Back to stores</a>
      <article>
        <header>
          <p>{store.area.label}</p>
          <h1>{store.name}</h1>
          <p>
            {store.address}, {store.town}, {store.state}
          </p>
          <p>{freshnessLabel(store)}</p>
          {renderPrivateActions?.(store)}
        </header>
        {cover ? (
          <img
            src={cover.src}
            alt={cover.alt || `${store.name} storefront`}
            onError={(event) => {
              event.currentTarget.hidden = true
              event.currentTarget.nextElementSibling?.removeAttribute('hidden')
            }}
          />
        ) : null}
        <div hidden={Boolean(cover)} role="img" aria-label="Store image unavailable">
          Image unavailable
        </div>
        {store.description && <p>{store.description}</p>}
        <section aria-labelledby="hours-heading">
          <h2 id="hours-heading">Hours</h2>
          <dl>
            {store.hours.length ? (
              store.hours.map((day) => (
                <React.Fragment key={day.weekday}>
                  <dt>{day.label || displayDayLabel(day.weekday)}</dt>
                  <dd>{formatHours(day)}</dd>
                </React.Fragment>
              ))
            ) : (
              <p>Hours unavailable</p>
            )}
          </dl>
        </section>
        {store.website && (
          <p>
            <a href={store.website} rel="noreferrer">
              Visit store website
            </a>
          </p>
        )}
        {store.phone && (
          <p>
            <a href={`tel:${store.phone}`}>{store.phone}</a>
          </p>
        )}
      </article>
    </main>
  )
}
