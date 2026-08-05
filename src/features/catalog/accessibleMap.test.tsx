import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAccessibleCatalogMapAdapter } from './accessibleMap'

const bounds = { north: 40, south: 39, east: -95, west: -96 }

describe('accessible catalog map adapter', () => {
  afterEach(cleanup)

  it('fails closed when an available map lacks attribution or valid bounds', () => {
    expect(
      createAccessibleCatalogMapAdapter({ capability: 'available', attribution: '', bounds })
        .capability,
    ).toBe('unavailable')
    expect(
      createAccessibleCatalogMapAdapter({
        capability: 'available',
        attribution: 'Approved map',
        bounds: { ...bounds, north: 38 },
      }).capability,
    ).toBe('unavailable')
  })

  it('renders keyboard controls and forwards only provider-safe public points', async () => {
    const user = userEvent.setup()
    const onBoundsChange = vi.fn()
    const onZoomChange = vi.fn()
    const onPreview = vi.fn()
    const onSelect = vi.fn()
    const adapter = createAccessibleCatalogMapAdapter({
      capability: 'available',
      attribution: 'Map data © approved provider v1',
      bounds,
      zoom: 12,
    })

    render(
      adapter.render!({
        points: [
          {
            storeId: 'store-1',
            slug: 'oak-antiques',
            name: 'Oak Antiques',
            latitude: 39.5,
            longitude: -95.5,
          },
        ],
        searchedBounds: bounds,
        pendingBounds: bounds,
        searchedZoom: 12,
        pendingZoom: 12,
        onBoundsChange,
        onZoomChange,
        onClusterZoom: vi.fn(),
        onPreview,
        onSelect,
      }),
    )

    expect(screen.getByRole('region', { name: /store map/i })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /map marker oak antiques/i }))
    expect(onPreview).toHaveBeenCalledWith('store-1')
    expect(onSelect).toHaveBeenCalledWith('store-1')

    await user.click(screen.getByRole('button', { name: /pan map east/i }))
    expect(onBoundsChange).toHaveBeenCalledWith({
      north: 40,
      south: 39,
      east: -94.8,
      west: -95.8,
    })
    await user.click(screen.getByRole('button', { name: /zoom map in/i }))
    expect(onZoomChange).toHaveBeenCalledWith(13)
  })

  it('never exposes private catalog fields through marker rendering', () => {
    const adapter = createAccessibleCatalogMapAdapter({
      capability: 'available',
      attribution: 'Approved map',
      bounds,
    })
    const rendered = adapter.render!({
      points: [],
      searchedBounds: bounds,
      pendingBounds: bounds,
      searchedZoom: 12,
      pendingZoom: 12,
      onBoundsChange: vi.fn(),
      onZoomChange: vi.fn(),
      onClusterZoom: vi.fn(),
      onPreview: vi.fn(),
      onSelect: vi.fn(),
    })
    expect(JSON.stringify(rendered)).not.toMatch(/account|cohort|privateNote|preciseLocation/i)
  })
})
