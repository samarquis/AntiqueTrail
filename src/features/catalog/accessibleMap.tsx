import type {
  CatalogMapAdapter,
  CatalogMapBounds,
  CatalogMapCapability,
  CatalogMapRenderInput,
} from './types'

export interface AccessibleCatalogMapOptions {
  capability: CatalogMapCapability
  attribution: string
  bounds: CatalogMapBounds
  zoom?: number
}

function validBounds(bounds: CatalogMapBounds): boolean {
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

function shiftedBounds(
  bounds: CatalogMapBounds,
  direction: 'north' | 'south' | 'east' | 'west',
): CatalogMapBounds {
  const latitudeStep = (bounds.north - bounds.south) / 5
  const longitudeStep = (bounds.east - bounds.west) / 5
  if (direction === 'north')
    return { ...bounds, north: bounds.north + latitudeStep, south: bounds.south + latitudeStep }
  if (direction === 'south')
    return { ...bounds, north: bounds.north - latitudeStep, south: bounds.south - latitudeStep }
  if (direction === 'east')
    return { ...bounds, east: bounds.east + longitudeStep, west: bounds.west + longitudeStep }
  return { ...bounds, east: bounds.east - longitudeStep, west: bounds.west - longitudeStep }
}

export function AccessibleCatalogMap({
  points,
  pendingBounds,
  pendingZoom,
  selectedStoreId,
  onBoundsChange,
  onZoomChange,
  onPreview,
  onSelect,
}: CatalogMapRenderInput) {
  const latitudeSpan = pendingBounds.north - pendingBounds.south
  const longitudeSpan = pendingBounds.east - pendingBounds.west
  return (
    <section className="accessible-map" role="region" aria-label="Store map">
      <p className="sr-only">
        An optional map of the stores in the accessible result list. Use arrow controls to change
        the pending area, then choose Search this map area.
      </p>
      <div className="accessible-map__controls" role="group" aria-label="Map controls">
        {(['north', 'south', 'east', 'west'] as const).map((direction) => (
          <button
            key={direction}
            type="button"
            aria-label={`Pan map ${direction}`}
            onClick={() => onBoundsChange(shiftedBounds(pendingBounds, direction))}
          >
            {direction}
          </button>
        ))}
        <button
          type="button"
          aria-label="Zoom map out"
          disabled={pendingZoom <= 0}
          onClick={() => onZoomChange(Math.max(0, pendingZoom - 1))}
        >
          −
        </button>
        <output aria-label="Map zoom level">Zoom {pendingZoom}</output>
        <button
          type="button"
          aria-label="Zoom map in"
          disabled={pendingZoom >= 22}
          onClick={() => onZoomChange(Math.min(22, pendingZoom + 1))}
        >
          +
        </button>
      </div>
      <div className="accessible-map__plot" role="group" aria-label="Map markers">
        {points.length === 0 ? (
          <p>No stores are visible in this map area.</p>
        ) : (
          points.map((point) => {
            const left = ((point.longitude - pendingBounds.west) / longitudeSpan) * 100
            const top = ((pendingBounds.north - point.latitude) / latitudeSpan) * 100
            return (
              <button
                key={point.storeId}
                type="button"
                className="accessible-map__marker"
                aria-label={`Map marker ${point.name}`}
                aria-pressed={selectedStoreId === point.storeId}
                style={{
                  left: `${Math.min(100, Math.max(0, left))}%`,
                  top: `${Math.min(100, Math.max(0, top))}%`,
                }}
                onFocus={() => onPreview(point.storeId)}
                onMouseEnter={() => onPreview(point.storeId)}
                onClick={() => {
                  onPreview(point.storeId)
                  onSelect(point.storeId)
                }}
              >
                <span aria-hidden="true">●</span>
                <span className="sr-only">{point.name}</span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}

// The adapter factory intentionally returns a React renderer at the catalog/provider seam.
// eslint-disable-next-line react-refresh/only-export-components
export function createAccessibleCatalogMapAdapter(
  options: AccessibleCatalogMapOptions,
): CatalogMapAdapter {
  const attribution = options.attribution.trim()
  const capability =
    options.capability === 'available' && (!attribution || !validBounds(options.bounds))
      ? 'unavailable'
      : options.capability
  return {
    capability,
    bounds: options.bounds,
    zoom: Number.isInteger(options.zoom) ? Math.min(22, Math.max(0, options.zoom!)) : 12,
    attribution,
    render: capability === 'available' ? (input) => <AccessibleCatalogMap {...input} /> : undefined,
  }
}
