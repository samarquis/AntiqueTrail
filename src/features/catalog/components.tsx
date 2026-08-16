import React, { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CatalogClient,
  CatalogBrowseStage,
  CatalogDetailsStage,
  CatalogFilters,
  CatalogMapAdapter,
  CatalogMapBounds,
  CatalogMapPoint,
  CatalogStore,
} from './types'
import {
  displayDayLabel,
  externalNavigationHref,
  formatCatalogDate,
  formatHours,
  formatHoursException,
  freshnessLabel,
  normalizeQueryParams,
  queryParams,
  todayHoursSummary,
} from './query'

const stageRank: Record<CatalogBrowseStage, number> = {
  'package-1': 1,
  'package-3': 3,
  'package-5b': 5,
  'package-10a': 10,
}

const detailsStageRank: Record<CatalogDetailsStage, number> = {
  'package-1': 1,
  'package-3': 3,
  'package-5a': 5,
  'package-10a': 10,
}

const BROWSE_RETURN_KEY = 'antique-trail:browse-return'

function catalogAppHref(path: string, base = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${path.replace(/^\/+/, '')}`
}

interface BrowseReturnState {
  href: string
  scrollY: number
  storeId: string
  savedAt: number
}

function responsiveCatalogImage(src: string, sizes: string) {
  if (!src.includes('/1280w/') || !src.endsWith('.webp')) return { sizes }
  return {
    srcSet: [480, 800, 1280]
      .map((width) => `${src.replace('/1280w/', `/${width}w/`)} ${width}w`)
      .join(', '),
    sizes,
  }
}

function readBrowseReturn(): BrowseReturnState | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(BROWSE_RETURN_KEY) ?? 'null',
    ) as Partial<BrowseReturnState> | null
    if (
      !parsed ||
      typeof parsed.href !== 'string' ||
      !/^\/stores(?:\?|$)/u.test(parsed.href) ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollY) ||
      typeof parsed.storeId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > 30 * 60_000
    )
      return null
    return parsed as BrowseReturnState
  } catch {
    return null
  }
}

function rememberBrowseReturn(storeId: string) {
  if (typeof window === 'undefined') return
  const href = `${window.location.pathname}${window.location.search}`
  if (!/^\/stores(?:\?|$)/u.test(href)) return
  window.sessionStorage.setItem(
    BROWSE_RETURN_KEY,
    JSON.stringify({ href, scrollY: window.scrollY, storeId, savedAt: Date.now() }),
  )
}

const STORE_RETURN_KEY = 'antique-trail:store-return'

function readStoreReturn(storeId: string): StoreReturnState | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STORE_RETURN_KEY) ?? 'null',
    ) as Partial<StoreReturnState> | null
    if (
      !parsed ||
      parsed.storeId !== storeId ||
      typeof parsed.href !== 'string' ||
      !/^\/stores\/[^/]+(?:\?|$)/u.test(parsed.href) ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollY) ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > 30 * 60_000
    )
      return null
    return parsed as StoreReturnState
  } catch {
    return null
  }
}

function rememberStoreReturn(storeId: string) {
  if (typeof window === 'undefined') return
  const href = `${window.location.pathname}${window.location.search}`
  if (!/^\/stores\/[^/]+(?:\?|$)/u.test(href)) return
  window.sessionStorage.setItem(
    STORE_RETURN_KEY,
    JSON.stringify({ href, scrollY: window.scrollY, storeId, savedAt: Date.now() }),
  )
}

interface StoreReturnState {
  href: string
  scrollY: number
  storeId: string
  savedAt: number
}

export function CatalogFiltersForm({
  filters,
  onChange,
  stage = 'package-1',
}: {
  filters: CatalogFilters
  onChange: (filters: CatalogFilters) => void
  stage?: CatalogBrowseStage
}) {
  const [q, setQ] = useState(filters.q ?? '')
  const [panelOpen, setPanelOpen] = useState(false)
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  const available = stageRank[stage]
  const hasFilters = Boolean(
    Object.values(filters).some((value) => value != null && value !== false),
  )
  return (
    <div className="catalog-filter-region">
      <form
        className="catalog-filters"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          onChange({ ...filters, q: q.trim() || undefined })
          setPanelOpen(false)
        }}
      >
        <div className="catalog-field catalog-field--search">
          <label htmlFor="catalog-search">Search stores</label>
          <div className="catalog-search-control">
            <input
              id="catalog-search"
              name="q"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Name, town, or category"
            />
            <button type="submit">Search</button>
          </div>
        </div>
        <button
          className="catalog-filters__trigger"
          type="button"
          aria-expanded={panelOpen}
          aria-controls="catalog-filter-panel"
          onClick={() => setPanelOpen((open) => !open)}
        >
          Filters{hasFilters ? ' · Active' : ''}
        </button>
        <div
          id="catalog-filter-panel"
          className="catalog-filters__panel"
          data-expanded={panelOpen ? 'true' : 'false'}
        >
          <div className="catalog-field">
            <label htmlFor="catalog-category">Category</label>
            <select
              id="catalog-category"
              value={filters.category ?? ''}
              onChange={(event) =>
                onChange({ ...filters, category: event.target.value || undefined })
              }
            >
              <option value="">All categories</option>
              <option value="antique-mall">Antique mall</option>
              <option value="vintage">Vintage</option>
              <option value="furniture">Furniture</option>
              <option value="collectibles">Collectibles</option>
              <option value="home-decor">Home decor</option>
              <option value="flea-market">Flea market</option>
            </select>
          </div>
          <div className="catalog-field">
            <label htmlFor="catalog-area">Area</label>
            <select
              id="catalog-area"
              value={filters.area ?? ''}
              onChange={(event) => onChange({ ...filters, area: event.target.value || undefined })}
            >
              <option value="">All areas</option>
              <option value="topeka-ks">Topeka</option>
            </select>
          </div>
          {available >= 10 && (
            <label className="catalog-check">
              <input
                type="checkbox"
                checked={Boolean(filters.openNow)}
                onChange={(event) =>
                  onChange({ ...filters, openNow: event.target.checked || undefined })
                }
              />
              Open now
            </label>
          )}
          {available >= 3 && (
            <div className="catalog-field">
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
            </div>
          )}
          {available >= 3 && (
            <label className="catalog-check">
              <input
                type="checkbox"
                checked={Boolean(filters.saved)}
                onChange={(event) =>
                  onChange({ ...filters, saved: event.target.checked || undefined })
                }
              />
              Saved only
            </label>
          )}
          {available >= 10 && (
            <label className="catalog-check">
              <input
                type="checkbox"
                checked={Boolean(filters.claimed)}
                onChange={(event) =>
                  onChange({ ...filters, claimed: event.target.checked || undefined })
                }
              />
              Claimed only
            </label>
          )}
          {available >= 5 && (
            <div className="catalog-field">
              <label htmlFor="catalog-distance">Distance from area center</label>
              <select
                id="catalog-distance"
                value={filters.maxAreaCentroidMiles ?? ''}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    maxAreaCentroidMiles: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  })
                }
              >
                <option value="">Any distance</option>
                <option value="5">Within 5 miles</option>
                <option value="10">Within 10 miles</option>
                <option value="25">Within 25 miles</option>
                <option value="50">Within 50 miles</option>
              </select>
            </div>
          )}
          {available >= 10 && (
            <div className="catalog-field">
              <label htmlFor="catalog-state">State</label>
              <select
                id="catalog-state"
                value={filters.state ?? ''}
                onChange={(event) =>
                  onChange({ ...filters, state: event.target.value || undefined })
                }
              >
                <option value="">All states</option>
                <option value="KS">Kansas</option>
              </select>
            </div>
          )}
          <div className="catalog-filters__actions">
            <button type="submit">Apply filters</button>
            <button
              type="button"
              disabled={!hasFilters && !q}
              onClick={() => {
                setQ('')
                onChange({})
                setPanelOpen(false)
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
      </form>
      {hasFilters && (
        <p className="catalog-filter-summary" role="status">
          Filters are active. Open Filters to review or clear them.
        </p>
      )}
    </div>
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
  const hours = todayHoursSummary(store)
  const initials = store.name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase()
  return (
    <article
      id={mapCardId(store.id)}
      className="catalog-card"
      aria-current={mapSelected ? 'true' : undefined}
      tabIndex={-1}
    >
      {cover && !imageFailed ? (
        <img
          className="catalog-card__image"
          src={cover.src}
          {...responsiveCatalogImage(cover.src, '(max-width: 1023px) calc(100vw - 2rem), 540px')}
          alt={cover.alt || `${store.name} storefront`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="catalog-card__placeholder" role="img" aria-label="Store image unavailable">
          <span aria-hidden="true">{initials}</span>
          <small>{store.categories[0]?.label ?? 'Antiques'} · Photo coming soon</small>
        </div>
      )}
      <div className="catalog-card__body">
        <p className="catalog-card__area">{store.area.label}</p>
        <h2>
          <a
            href={catalogAppHref(`/stores/${encodeURIComponent(store.slug)}`)}
            onClick={() => rememberBrowseReturn(store.id)}
          >
            {store.name}
          </a>
        </h2>
        <p>
          {store.town}, {store.state}
        </p>
        <ul className="catalog-card__categories" aria-label="Store categories">
          {store.categories.map((category) => (
            <li key={category.slug}>{category.label}</li>
          ))}
        </ul>
        {store.summary && <p>{store.summary}</p>}
        <p className="catalog-card__hours">
          <strong>{hours.openStateLabel}</strong>
          <span>
            {hours.dayLabel}: {hours.hoursLabel}
          </span>
        </p>
        <p className="catalog-card__freshness">{freshnessLabel(store)}</p>
        {onShowOnMap && (
          <button type="button" onClick={onShowOnMap}>
            Show {store.name} on map
          </button>
        )}
        <a
          className="button button--secondary catalog-card__add-to-trip"
          href={catalogAppHref(`/trips/new?addStoreId=${encodeURIComponent(store.id)}`)}
        >
          Add to Trip
        </a>
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
    <section className="catalog-state catalog-state--error" role="alert">
      <h2>We couldn’t load the stores</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </section>
  )
}
function LoadingState() {
  return (
    <section className="catalog-state catalog-state--loading" role="status" aria-live="polite">
      <h2>Finding stores</h2>
      <p>Loading current store details…</p>
    </section>
  )
}
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <section className="catalog-state catalog-state--empty" role="status">
      <h2>{hasFilters ? 'No matching stores' : 'The trail is quiet for now'}</h2>
      <p>{hasFilters ? 'No stores match those filters.' : 'No stores are available yet.'}</p>
      {hasFilters && (
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  )
}

export function BrowsePage({
  client,
  initialSearch = '',
  renderPrivateActions,
  map,
  filterStage = 'package-1',
  availability = 'available',
}: {
  client: CatalogClient
  initialSearch?: string
  renderPrivateActions?: (store: CatalogStore) => React.ReactNode
  map?: CatalogMapAdapter
  filterStage?: CatalogBrowseStage
  availability?: 'available' | 'blocked'
}) {
  const [filters, setFilters] = useState(() => normalizeQueryParams(initialSearch))
  const [state, setState] = useState<{
    kind: 'loading' | 'success' | 'error' | 'blocked'
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
    if (availability === 'blocked') {
      setState({ kind: 'blocked', message: 'The store directory is not available in this stage.' })
      return
    }
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
  }, [availability, client, filters])
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
  useEffect(() => {
    if (state.kind !== 'success' || !state.stores?.length || typeof window === 'undefined') return
    const saved = readBrowseReturn()
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (!saved || saved.href !== currentHref) return
    const card = document.getElementById(mapCardId(saved.storeId))
    const returnTarget = card?.querySelector<HTMLElement>('h2 a')
    if (!returnTarget) return
    window.sessionStorage.removeItem(BROWSE_RETURN_KEY)
    requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, saved.scrollY), behavior: 'auto' })
      returnTarget.focus({ preventScroll: true })
    })
  }, [state.kind, state.stores])
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
      <CatalogFiltersForm filters={filters} onChange={updateFilters} stage={filterStage} />
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
                            <a
                              href={catalogAppHref(`/stores/${point.slug}`)}
                              onClick={() => rememberBrowseReturn(point.storeId)}
                            >
                              View store details
                            </a>
                            {renderPrivateActions?.(point.store)}
                            <a
                              href={catalogAppHref(
                                `/trips/new?addStoreId=${encodeURIComponent(point.storeId)}`,
                              )}
                            >
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
      {state.kind === 'blocked' && (
        <section
          className="catalog-state catalog-state--blocked"
          aria-labelledby="catalog-blocked-heading"
        >
          <h2 id="catalog-blocked-heading">Browse is unavailable</h2>
          <p>{state.message}</p>
          <a href={catalogAppHref('/')}>Return home</a>
        </section>
      )}
      {state.kind === 'success' &&
        (state.stores?.length ? (
          <>
            <div className="catalog-results-heading">
              <div>
                <p className="eyebrow">Local directory</p>
                <h2>{state.stores.length} stores to explore</h2>
              </div>
              <p>Fictional listings for safe product review</p>
            </div>
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
          </>
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

function StoreGallery({ store }: { store: CatalogStore }) {
  const media = store.media.slice(0, 6)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [failed, setFailed] = useState<Set<number>>(() => new Set())
  const [enlarged, setEnlarged] = useState(false)
  const enlargeButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const choiceButtons = useRef<Array<HTMLButtonElement | null>>([])
  const selected = media[selectedIndex]
  const selectedFailed = !selected || failed.has(selectedIndex)

  useEffect(() => {
    if (enlarged) closeButton.current?.focus()
  }, [enlarged])

  const closeGallery = (returnFocus: 'opener' | 'selected-choice' = 'opener') => {
    setEnlarged(false)
    requestAnimationFrame(() =>
      (returnFocus === 'selected-choice'
        ? choiceButtons.current[selectedIndex]
        : enlargeButton.current
      )?.focus(),
    )
  }

  const markFailed = (index: number) =>
    setFailed((current) => {
      const next = new Set(current)
      next.add(index)
      return next
    })

  return (
    <section className="store-gallery" aria-labelledby="gallery-heading">
      <h2 id="gallery-heading" className="sr-only">
        Store photos
      </h2>
      {selectedFailed ? (
        <div className="store-gallery__missing" role="img" aria-label="Store image unavailable">
          <strong aria-hidden="true">{store.name.slice(0, 1)}</strong>
          <span>Photo unavailable</span>
        </div>
      ) : (
        <figure className="store-gallery__hero">
          <button
            ref={enlargeButton}
            type="button"
            className="store-gallery__enlarge"
            aria-label={`Enlarge image: ${selected.alt}`}
            onClick={() => setEnlarged(true)}
          >
            <img
              src={selected.src}
              {...responsiveCatalogImage(selected.src, '(max-width: 800px) 100vw, 720px')}
              alt={selected.alt}
              onError={() => markFailed(selectedIndex)}
            />
          </button>
          {(selected.caption || selected.rightsLabel) && (
            <figcaption>
              {selected.caption}
              {selected.caption && selected.rightsLabel ? ' · ' : ''}
              {selected.rightsLabel}
            </figcaption>
          )}
        </figure>
      )}
      {media.length > 1 && (
        <div className="store-gallery__choices" role="group" aria-label="Choose a store photo">
          {media.map((item, index) => (
            <button
              ref={(element) => {
                choiceButtons.current[index] = element
              }}
              key={`${item.src}-${index}`}
              type="button"
              aria-label={`Show image ${index + 1}: ${item.alt}`}
              aria-pressed={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
            >
              {failed.has(index) ? (
                <span>Unavailable</span>
              ) : (
                <img
                  src={item.src}
                  {...responsiveCatalogImage(item.src, '96px')}
                  alt=""
                  onError={() => markFailed(index)}
                />
              )}
            </button>
          ))}
        </div>
      )}
      {enlarged && selected && !selectedFailed && (
        <div
          className="store-gallery__dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged store image: ${selected.alt}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeGallery()
            if (event.key === 'Tab') {
              event.preventDefault()
              closeButton.current?.focus()
            }
          }}
        >
          <button ref={closeButton} type="button" onClick={() => closeGallery()}>
            Close enlarged image
          </button>
          <img
            src={selected.src}
            {...responsiveCatalogImage(
              selected.src,
              '(max-width: 800px) calc(100vw - 2rem), 1120px',
            )}
            alt={selected.alt}
            onError={() => {
              markFailed(selectedIndex)
              closeGallery('selected-choice')
            }}
          />
          {(selected.caption || selected.rightsLabel) && (
            <p>
              {selected.caption}
              {selected.caption && selected.rightsLabel ? ' · ' : ''}
              {selected.rightsLabel}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function StoreHours({ store }: { store: CatalogStore }) {
  const today = todayHoursSummary(store)
  return (
    <section className="store-detail__panel" aria-labelledby="hours-heading">
      <div className="store-detail__section-heading">
        <div>
          <p className="eyebrow">Plan your stop</p>
          <h2 id="hours-heading">Hours</h2>
        </div>
        <p className={`status-badge status-badge--${today.openState}`}>
          <span aria-hidden="true">
            {today.openState === 'open' ? '✓' : today.openState === 'closed' ? '●' : '?'}
          </span>{' '}
          {today.openStateLabel}
        </p>
      </div>
      <p className="store-detail__today">
        <strong>{today.dayLabel}</strong> · {today.hoursLabel}
      </p>
      {store.hours.length ? (
        <dl className="store-hours">
          {store.hours.map((day) => (
            <React.Fragment key={day.weekday}>
              <dt>{day.label || displayDayLabel(day.weekday)}</dt>
              <dd>{formatHours(day)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <p className="honesty-note">Regular hours are unavailable. Call before making a trip.</p>
      )}
      <div className="store-detail__exceptions">
        <h3>Special hours &amp; exceptions</h3>
        {store.hoursExceptions?.length ? (
          <ul>
            {store.hoursExceptions.map((exception) => (
              <li key={`${exception.date}-${exception.label}`}>
                <strong>{exception.label}</strong>
                <span>
                  {formatCatalogDate(exception.date)} · {formatHoursException(exception)}
                  {exception.note ? ` · ${exception.note}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="honesty-note">No special-hours information has been supplied.</p>
        )}
      </div>
    </section>
  )
}

export function DetailsPage({
  client,
  slug,
  renderPrivateActions,
  stage = 'package-5a',
}: {
  client: CatalogClient
  slug: string
  renderPrivateActions?: (store: CatalogStore) => React.ReactNode
  stage?: CatalogDetailsStage
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
  useEffect(() => {
    if (state.kind !== 'success' || !state.store || typeof window === 'undefined') return
    const saved = readStoreReturn(state.store.id)
    const currentHref = `${window.location.pathname}${window.location.search}`
    if (!saved || saved.href !== currentHref) return
    const seeAllLink = document.querySelector<HTMLElement>('a[href$="/updates"]')
    if (!seeAllLink) return
    window.sessionStorage.removeItem(STORE_RETURN_KEY)
    requestAnimationFrame(() => {
      window.scrollTo({ top: Math.max(0, saved.scrollY), behavior: 'auto' })
      seeAllLink.focus({ preventScroll: true })
    })
  }, [state.kind, state.store])
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
        <a href={catalogAppHref(readBrowseReturn()?.href ?? '/stores')}>Back to stores</a>
      </main>
    )
  const store = state.store!
  const browseReturn = readBrowseReturn()
  const backHref = browseReturn?.href ?? '/stores'
  const verifiedDate = formatCatalogDate(store.freshness?.verifiedAt)
  const provenanceDate = formatCatalogDate(store.provenance?.updatedAt)
  const hasContact = Boolean(store.website || store.phone || store.email)
  const canAddToTrip = detailsStageRank[stage] >= detailsStageRank['package-5a']
  return (
    <main className="store-detail">
      <a className="store-detail__back" href={catalogAppHref(backHref)}>
        <span aria-hidden="true">←</span> Back to Browse
      </a>
      <article className="store-detail__article">
        <header className="store-detail__header">
          <p className="eyebrow">{store.area.label} trail stop</p>
          <h1>{store.name}</h1>
          <p className="store-detail__address">
            {store.address}, {store.town}, {store.state}
          </p>
          <div className="store-detail__trust" aria-label="Listing status">
            <p className={`status-badge status-badge--${store.freshness?.status ?? 'unknown'}`}>
              <span aria-hidden="true">
                {store.freshness?.status === 'current' ? '✓' : 'i'}
              </span>{' '}
              {freshnessLabel(store)}
            </p>
            {store.freshness?.status === 'stale' && (
              <p className="honesty-note">
                This listing may be out of date. Confirm before travel.
              </p>
            )}
            {!store.freshness && (
              <p className="honesty-note">Freshness information is unavailable.</p>
            )}
          </div>
        </header>

        <StoreGallery store={store} />

        <section className="store-detail__intro" aria-labelledby="about-heading">
          <p className="eyebrow">What you’ll find</p>
          <h2 id="about-heading">About this store</h2>
          <p>{store.description || 'A store description has not been supplied.'}</p>
          {store.categories.length ? (
            <ul className="catalog-card__categories" aria-label="Store categories">
              {store.categories.map((category) => (
                <li key={category.slug}>{category.label}</li>
              ))}
            </ul>
          ) : (
            <p className="honesty-note">Store categories are unavailable.</p>
          )}
        </section>

        <nav className="store-detail__actions" aria-label="Store visit actions">
          <a
            className="button"
            href={externalNavigationHref(store)}
            target="_blank"
            rel="noreferrer"
          >
            Navigate in Maps <span aria-hidden="true">↗</span>
            <span className="sr-only"> (opens in a new window)</span>
          </a>
          {canAddToTrip && (
            <a
              className="button button--secondary"
              href={catalogAppHref(`/trips/new?addStoreId=${encodeURIComponent(store.id)}`)}
            >
              Add to Trip
            </a>
          )}
          {renderPrivateActions?.(store)}
        </nav>

        <StoreHours store={store} />

        <section className="store-detail__panel" aria-labelledby="contact-heading">
          <p className="eyebrow">Confirm your visit</p>
          <h2 id="contact-heading">Contact &amp; location</h2>
          <address>
            {store.address}, {store.town}, {store.state}
          </address>
          {hasContact ? (
            <ul className="store-detail__link-list">
              {store.phone && (
                <li>
                  <a href={`tel:${store.phone}`}>Call {store.phone}</a>
                </li>
              )}
              {store.email && (
                <li>
                  <a href={`mailto:${store.email}`}>Email the store</a>
                </li>
              )}
              {store.website && (
                <li>
                  <a href={store.website} target="_blank" rel="noreferrer">
                    Visit official website <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (opens in a new window)</span>
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <p className="honesty-note">Contact details have not been supplied.</p>
          )}
        </section>

        <section className="store-detail__panel" aria-labelledby="accessibility-heading">
          <p className="eyebrow">Know before you go</p>
          <h2 id="accessibility-heading">Accessibility</h2>
          {store.accessibility?.status === 'verified' && store.accessibility.details.length ? (
            <>
              <ul>
                {store.accessibility.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <p className="store-detail__source">
                Verified accessibility information
                {formatCatalogDate(store.accessibility.verifiedAt)
                  ? ` on ${formatCatalogDate(store.accessibility.verifiedAt)}`
                  : ''}
                .
              </p>
            </>
          ) : store.accessibility?.status === 'unverified' && store.accessibility.details.length ? (
            <>
              <ul>
                {store.accessibility.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <p className="honesty-note">
                These details have not yet been verified. Contact the store to confirm.
              </p>
            </>
          ) : (
            <p className="honesty-note">
              Accessibility information is unavailable. Contact the store before visiting if you
              need an accommodation.
            </p>
          )}
        </section>

        <section className="store-detail__panel" aria-labelledby="updates-heading">
          <p className="eyebrow">From the store</p>
          <h2 id="updates-heading">Latest updates</h2>
          {store.updates?.length ? (
            <>
              <ol className="store-updates">
                {store.updates.slice(0, 3).map((update) => (
                  <li key={update.id}>
                    <article>
                      <h3>{update.title}</h3>
                      <p>{update.body}</p>
                      <time dateTime={update.publishedAt}>
                        {formatCatalogDate(update.publishedAt) ?? 'Date unavailable'}
                      </time>
                      {update.href && <a href={update.href}>Read full update</a>}
                    </article>
                  </li>
                ))}
              </ol>
              {store.updates.length > 3 && (
                <a
                  href={catalogAppHref(`/stores/${encodeURIComponent(store.slug)}/updates`)}
                  onClick={() => rememberStoreReturn(store.id)}
                >
                  See all store updates
                </a>
              )}
            </>
          ) : (
            <p className="honesty-note">This store has not published any updates.</p>
          )}
        </section>

        {store.socialLinks?.length ? (
          <section className="store-detail__panel" aria-labelledby="social-heading">
            <p className="eyebrow">Official profiles</p>
            <h2 id="social-heading">Follow this store</h2>
            <p>These links open the store’s official profile on an external service.</p>
            <ul className="store-detail__link-list">
              {store.socialLinks.map((social) => (
                <li key={`${social.platform}-${social.href}`}>
                  <a href={social.href} target="_blank" rel="noreferrer">
                    {social.platform} <span aria-hidden="true">↗</span>
                    <span className="sr-only"> (opens in a new window)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="store-detail__provenance" aria-labelledby="source-heading">
          <p className="eyebrow">Why you can trust this listing</p>
          <h2 id="source-heading">Source &amp; freshness</h2>
          <dl>
            <dt>Listing source</dt>
            <dd>{store.provenance?.sourceLabel || 'Source information unavailable'}</dd>
            <dt>Source updated</dt>
            <dd>{provenanceDate || 'Update date unavailable'}</dd>
            <dt>Details verified</dt>
            <dd>{verifiedDate || 'Verification date unavailable'}</dd>
          </dl>
          {store.provenance?.note && <p>{store.provenance.note}</p>}
          <p className="store-detail__source">
            Photo rights are shown with each image when supplied.
          </p>
        </section>
      </article>
    </main>
  )
}

export function StoreUpdatesPage({ client, slug }: { client: CatalogClient; slug: string }) {
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
        <a href={catalogAppHref(readBrowseReturn()?.href ?? '/stores')}>Back to stores</a>
      </main>
    )
  const store = state.store!
  const updates = [...(store.updates ?? [])].sort((a, b) =>
    a.publishedAt.localeCompare(b.publishedAt),
  )
  return (
    <main className="store-detail">
      <a
        className="store-detail__back"
        href={catalogAppHref(`/stores/${encodeURIComponent(store.slug)}`)}
      >
        <span aria-hidden="true">←</span> Back to {store.name}
      </a>
      <article className="store-detail__article">
        <header className="store-detail__header">
          <p className="eyebrow">{store.area.label} trail stop</p>
          <h1>{store.name}</h1>
        </header>
        <section className="store-detail__panel" aria-labelledby="updates-heading">
          <p className="eyebrow">From the store</p>
          <h2 id="updates-heading">All store updates</h2>
          {updates.length ? (
            <ol className="store-updates">
              {updates.map((update) => (
                <li key={update.id}>
                  <article>
                    <h3>{update.title}</h3>
                    <p>{update.body}</p>
                    <time dateTime={update.publishedAt}>
                      {formatCatalogDate(update.publishedAt) ?? 'Date unavailable'}
                    </time>
                    {update.href && <a href={update.href}>Read full update</a>}
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <p className="honesty-note">This store has not published any updates.</p>
          )}
        </section>
      </article>
    </main>
  )
}
