import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogClient,
  CatalogFilters,
  CatalogMapAdapter,
  CatalogMapBounds,
  CatalogMapPoint,
  CatalogStore,
} from './types'
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
      <label>
        <input
          type="checkbox"
          checked={Boolean(filters.openNow)}
          onChange={(event) => onChange({ ...filters, openNow: event.target.checked || undefined })}
        />
        Open now
      </label>
      <label htmlFor="catalog-visited">Visit status</label>
      <select
        id="catalog-visited"
        value={filters.visited ?? ''}
        onChange={(event) =>
          onChange({
            ...filters,
            visited: (event.target.value || undefined) as CatalogFilters['visited'],
          })
        }
      >
        <option value="">Any visit status</option>
        <option value="visited">Visited</option>
        <option value="unvisited">Unvisited</option>
      </select>
      <label>
        <input
          type="checkbox"
          checked={Boolean(filters.saved)}
          onChange={(event) => onChange({ ...filters, saved: event.target.checked || undefined })}
        />
        Saved only
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(filters.claimed)}
          onChange={(event) => onChange({ ...filters, claimed: event.target.checked || undefined })}
        />
        Claimed only
      </label>
      <label htmlFor="catalog-distance">Within miles of area center</label>
      <select
        id="catalog-distance"
        value={filters.maxAreaCentroidMiles ?? ''}
        onChange={(event) =>
          onChange({
            ...filters,
            maxAreaCentroidMiles: event.target.value ? Number(event.target.value) : undefined,
          })
        }
      >
        <option value="">Any distance</option>
        <option value="5">5 miles</option>
        <option value="10">10 miles</option>
        <option value="25">25 miles</option>
        <option value="50">50 miles</option>
      </select>
      <label htmlFor="catalog-state">State</label>
      <select
        id="catalog-state"
        value={filters.state ?? ''}
        onChange={(event) => onChange({ ...filters, state: event.target.value || undefined })}
      >
        <option value="">All states</option>
        <option value="KS">Kansas</option>
      </select>
    </form>
  )
}

export function CatalogCard({
  store,
  privateActions,
  mapSelected = false,
  onShowOnMap,
}: {
  store: CatalogStore
  privateActions?: React.ReactNode
  mapSelected?: boolean
  onShowOnMap?: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const cover = store.media.find((item) => item.kind === 'cover') ?? store.media[0]
  return (
    <article
      id={mapCardId(store.id)}
      className="catalog-card"
      aria-current={mapSelected ? 'true' : undefined}
      tabIndex={-1}
    >
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
        {onShowOnMap && (
          <button type="button" onClick={onShowOnMap}>
            Show {store.name} on map
          </button>
        )}
        {privateActions}
      </div>
    </article>
  )
}

function mapCardId(storeId: string) {
  return `catalog-map-store-${encodeURIComponent(storeId)}`
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
  map,
}: {
  client: CatalogClient
  initialSearch?: string
  renderPrivateActions?: (store: CatalogStore) => React.ReactNode
  map?: CatalogMapAdapter
}) {
  const [filters, setFilters] = useState(() => normalizeQueryParams(initialSearch))
  const [state, setState] = useState<{
    kind: 'loading' | 'success' | 'error'
    stores?: CatalogStore[]
    message?: string
  }>({ kind: 'loading' })
  const [mapExpanded, setMapExpanded] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<string>()
  const [mapFocusStoreId, setMapFocusStoreId] = useState<string>()
  const [searchedMapBounds, setSearchedMapBounds] = useState<CatalogMapBounds | undefined>(
    map?.bounds,
  )
  const [pendingMapBounds, setPendingMapBounds] = useState<CatalogMapBounds | undefined>(
    map?.bounds,
  )
  const [searchedMapZoom, setSearchedMapZoom] = useState(map?.zoom ?? 12)
  const [pendingMapZoom, setPendingMapZoom] = useState(map?.zoom ?? 12)
  const replaceListFromMap = useRef(false)
  const [mapAnnouncement, setMapAnnouncement] = useState('')
  const [mapState, setMapState] = useState<{
    kind: 'idle' | 'loading' | 'success' | 'error'
    points?: CatalogMapPoint[]
  }>({ kind: 'idle' })
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
  const mapCapability = map?.capability ?? 'blocked'
  const mapBounds = searchedMapBounds
  const mapAttribution = map?.attribution?.trim()
  const renderMap = map?.render
  const acceptMapBounds = (bounds: CatalogMapBounds) => {
    if (validMapBounds(bounds)) setPendingMapBounds(bounds)
  }
  useEffect(() => {
    if (
      !mapExpanded ||
      mapCapability !== 'available' ||
      !mapBounds ||
      !mapAttribution ||
      !renderMap ||
      !client.map ||
      state.kind !== 'success'
    )
      return
    let cancelled = false
    setMapState({ kind: 'loading' })
    client
      .map(filters, mapBounds, searchedMapZoom)
      .then((result) => {
        if (!cancelled) {
          setMapState({ kind: 'success', points: result.points })
          if (replaceListFromMap.current) {
            setState({ kind: 'success', stores: result.points.map((point) => point.store) })
            replaceListFromMap.current = false
            setMapAnnouncement(`${result.points.length} stores shown in the result list.`)
          }
        }
      })
      .catch(() => {
        if (!cancelled) setMapState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [
    client,
    filters,
    mapAttribution,
    mapBounds,
    mapCapability,
    mapExpanded,
    renderMap,
    searchedMapZoom,
    state.kind,
  ])
  useEffect(() => {
    if (!mapFocusStoreId) return
    document.getElementById(mapCardId(mapFocusStoreId))?.focus()
    setMapFocusStoreId(undefined)
  }, [mapFocusStoreId])
  useEffect(() => {
    if (
      selectedStoreId &&
      state.kind === 'success' &&
      !state.stores?.some((store) => store.id === selectedStoreId)
    )
      setSelectedStoreId(undefined)
  }, [selectedStoreId, state.kind, state.stores])
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
      <section aria-labelledby="browse-map-heading" className="catalog-map-panel">
        <h2 id="browse-map-heading">Store map</h2>
        <p>The store list remains the primary discovery view.</p>
        <button
          type="button"
          aria-expanded={mapExpanded}
          aria-controls="browse-map-content"
          onClick={() => setMapExpanded((expanded) => !expanded)}
        >
          {mapExpanded ? 'Hide map' : 'Show map'}
        </button>
        {mapExpanded && (
          <div id="browse-map-content">
            {mapCapability !== 'available' ? (
              <p role="status">
                Map and travel-time suggestions are not available yet. Your store list and filters
                remain available.
              </p>
            ) : !mapBounds || !pendingMapBounds || !mapAttribution || !renderMap || !client.map ? (
              <p role="status">
                Map configuration is unavailable. Your store list and filters remain available.
              </p>
            ) : mapState.kind === 'loading' || mapState.kind === 'idle' ? (
              <p role="status">Loading the optional map…</p>
            ) : mapState.kind === 'error' ? (
              <p role="alert">
                Map unavailable. Your store list, filters, and current results are unchanged.
              </p>
            ) : (
              <>
                {renderMap({
                  points: (mapState.points ?? []).map(
                    ({ storeId, slug, name, latitude, longitude }) => ({
                      storeId,
                      slug,
                      name,
                      latitude,
                      longitude,
                    }),
                  ),
                  selectedStoreId,
                  searchedBounds: mapBounds,
                  pendingBounds: pendingMapBounds,
                  searchedZoom: searchedMapZoom,
                  pendingZoom: pendingMapZoom,
                  previewStore: mapState.points?.find((point) => point.storeId === selectedStoreId)
                    ?.store,
                  onBoundsChange: acceptMapBounds,
                  onZoomChange: (zoom) => {
                    if (Number.isInteger(zoom) && zoom >= 0 && zoom <= 22) setPendingMapZoom(zoom)
                  },
                  onClusterZoom: (cluster) => {
                    if (!validMapBounds(cluster.bounds) || !cluster.label.trim()) return
                    setPendingMapBounds(cluster.bounds)
                    setMapAnnouncement(
                      `${cluster.label} expanded. Search this map area to update results.`,
                    )
                  },
                  onPreview: (storeId) => {
                    if (!mapState.points?.some((point) => point.storeId === storeId)) return
                    setSelectedStoreId(storeId)
                    setMapAnnouncement('Store preview selected from map.')
                  },
                  onSelect: (storeId) => {
                    if (!mapState.points?.some((point) => point.storeId === storeId)) return
                    setSelectedStoreId(storeId)
                    setMapFocusStoreId(storeId)
                  },
                })}
                <button
                  type="button"
                  disabled={
                    sameMapBounds(mapBounds, pendingMapBounds) && searchedMapZoom === pendingMapZoom
                  }
                  onClick={() => {
                    replaceListFromMap.current = true
                    setSearchedMapBounds(pendingMapBounds)
                    setSearchedMapZoom(pendingMapZoom)
                    setMapAnnouncement('Searching the visible map area.')
                  }}
                >
                  Search this map area
                </button>
                <p aria-live="polite" className="sr-only">
                  {mapAnnouncement}
                </p>
                {selectedStoreId &&
                  mapState.points?.find((point) => point.storeId === selectedStoreId) && (
                    <aside aria-label="Map marker preview">
                      {(() => {
                        const point = mapState.points!.find(
                          (candidate) => candidate.storeId === selectedStoreId,
                        )!
                        return (
                          <>
                            <strong>{point.name}</strong>{' '}
                            <p>
                              {point.rating == null
                                ? 'Not yet rated'
                                : `${point.rating.toFixed(1)} from ${point.ratingCount} ratings`}
                            </p>
                            <p>
                              {point.hoursLabel} ·{' '}
                              {point.openState === 'unavailable'
                                ? 'Open state unavailable'
                                : point.openState === 'open'
                                  ? 'Open now'
                                  : 'Closed now'}
                            </p>
                            <p>
                              {point.categoryLabel} · {point.distanceMiles.toFixed(1)} miles from{' '}
                              {point.store.area.label} center
                            </p>
                            <p>
                              {point.claimed ? 'Claimed listing' : 'Unclaimed listing'}
                              {point.saved != null
                                ? ` · ${point.saved ? 'Saved' : 'Not saved'}`
                                : ''}
                              {point.visited != null
                                ? ` · ${point.visited ? 'Visited' : 'Not visited'}`
                                : ''}
                            </p>
                            <a href={`/stores/${point.slug}`}>View store details</a>
                            {renderPrivateActions?.(point.store)}
                            <a href={`/trips/new?addStoreId=${encodeURIComponent(point.storeId)}`}>
                              Add to Trip
                            </a>
                            {map.navigationHref && <a href={map.navigationHref(point)}>Navigate</a>}
                          </>
                        )
                      })()}
                    </aside>
                  )}
                <p className="catalog-map-attribution">{mapAttribution}</p>
              </>
            )}
          </div>
        )}
      </section>
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
                mapSelected={selectedStoreId === store.id}
                onShowOnMap={
                  mapExpanded && mapState.points?.some((point) => point.storeId === store.id)
                    ? () => setSelectedStoreId(store.id)
                    : undefined
                }
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

function validMapBounds(bounds: CatalogMapBounds) {
  return (
    [bounds.north, bounds.south, bounds.east, bounds.west].every(Number.isFinite) &&
    bounds.north > bounds.south &&
    bounds.east > bounds.west &&
    bounds.north <= 90 &&
    bounds.south >= -90 &&
    bounds.east <= 180 &&
    bounds.west >= -180
  )
}

function sameMapBounds(left: CatalogMapBounds, right: CatalogMapBounds) {
  return (
    left.north === right.north &&
    left.south === right.south &&
    left.east === right.east &&
    left.west === right.west
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
