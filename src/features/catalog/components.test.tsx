import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage, DetailsPage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient } from './types'

function client(): CatalogClient {
  return {
    list: vi.fn(async () => ({ stores: [syntheticStores[0]], generatedAt: '2026-08-04' })),
    details: vi.fn(async () => syntheticStores[0]),
    map: vi.fn(async () => ({
      points: [
        {
          storeId: syntheticStores[0].id,
          slug: syntheticStores[0].slug,
          name: syntheticStores[0].name,
          latitude: 39.05,
          longitude: -95.68,
          store: syntheticStores[0],
          rating: 4.5,
          ratingCount: 8,
          hoursLabel: '10:00 AM–6:00 PM',
          openState: 'open' as const,
          categoryLabel: 'Antique mall',
          distanceMiles: 2.4,
          claimed: true,
          saved: true,
          visited: false,
        },
      ],
      asOfUtc: '2026-08-04T12:00:00Z',
    })),
  }
}

describe('catalog private-action integration seam', () => {
  afterEach(() => cleanup())

  it('renders account-aware actions on every Browse card', async () => {
    render(
      <BrowsePage
        client={client()}
        renderPrivateActions={(store) => <button type="button">Save {store.name}</button>}
      />,
    )
    expect(
      await screen.findByRole('button', { name: `Save ${syntheticStores[0].name}` }),
    ).toBeVisible()
  })

  it('renders the same action boundary on Store Details', async () => {
    render(
      <DetailsPage
        client={client()}
        slug={syntheticStores[0].slug}
        renderPrivateActions={(store) => (
          <a href={`/stores/${store.slug}/memory`}>Private memory</a>
        )}
      />,
    )
    expect(await screen.findByRole('link', { name: /private memory/i })).toHaveAttribute(
      'href',
      `/stores/${syntheticStores[0].slug}/memory`,
    )
  })

  it('keeps Browse list-first and makes the R-01-blocked map a no-call fallback', async () => {
    const catalog = client()
    const user = userEvent.setup()
    render(<BrowsePage client={catalog} />)
    expect(await screen.findByRole('heading', { name: syntheticStores[0].name })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /show map/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/not available.*list.*available/i)
    expect(catalog.map).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: syntheticStores[0].name })).toBeVisible()
  })

  it('synchronizes filtered list selection with an injected accessible map seam', async () => {
    const catalog = client()
    const user = userEvent.setup()
    render(
      <BrowsePage
        client={catalog}
        map={{
          capability: 'available',
          bounds: { north: 40, south: 39, east: -95, west: -96 },
          attribution: 'Map data: approved test provider',
          render: ({ points, selectedStoreId, onSelect }) => (
            <div data-testid="provider-map">
              <output>{selectedStoreId ?? 'none selected'}</output>
              {points.map((point) => (
                <button key={point.storeId} type="button" onClick={() => onSelect(point.storeId)}>
                  Map marker {point.name}
                </button>
              ))}
            </div>
          ),
        }}
      />,
    )
    await screen.findByRole('heading', { name: syntheticStores[0].name })
    await user.click(screen.getByRole('button', { name: /show map/i }))

    expect(await screen.findByTestId('provider-map')).toBeVisible()
    expect(screen.getByText('Map data: approved test provider')).toBeVisible()
    expect(catalog.map).toHaveBeenCalledWith({}, { north: 40, south: 39, east: -95, west: -96 }, 12)

    await user.click(screen.getByRole('button', { name: `Map marker ${syntheticStores[0].name}` }))
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('aria-current', 'true')
    expect(card).toHaveFocus()

    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
    expect(await screen.findByTestId('provider-map')).toBeVisible()
    expect(catalog.map).toHaveBeenLastCalledWith(
      { category: 'vintage' },
      { north: 40, south: 39, east: -95, west: -96 },
      12,
    )
    expect(
      within(screen.getByRole('main')).getByRole('heading', { name: /browse stores/i }),
    ).toBeVisible()
  })

  it('preserves list and filters when the map seam fails', async () => {
    const catalog = client()
    catalog.map = vi.fn().mockRejectedValue(new Error('provider outage'))
    const user = userEvent.setup()
    render(
      <BrowsePage
        client={catalog}
        initialSearch="?q=finch"
        map={{
          capability: 'available',
          bounds: { north: 40, south: 39, east: -95, west: -96 },
          attribution: 'Map data: approved test provider',
          render: () => null,
        }}
      />,
    )
    await screen.findByRole('heading', { name: syntheticStores[0].name })
    await user.click(screen.getByRole('button', { name: /show map/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/map unavailable/i)
    expect(screen.getByLabelText('Search stores')).toHaveValue('finch')
    expect(screen.getByRole('heading', { name: syntheticStores[0].name })).toBeVisible()
  })

  it('searches changed bounds only on request and exposes cluster and marker-preview actions', async () => {
    const catalog = client()
    const user = userEvent.setup()
    const changedBounds = { north: 39.5, south: 39, east: -95.4, west: -96 }
    const clusterBounds = { north: 39.3, south: 39.1, east: -95.5, west: -95.8 }
    render(
      <BrowsePage
        client={catalog}
        map={{
          capability: 'available',
          bounds: { north: 40, south: 39, east: -95, west: -96 },
          attribution: 'Map data: approved test provider',
          render: ({ onBoundsChange, onClusterZoom, onPreview }) => (
            <div>
              <button type="button" onClick={() => onBoundsChange(changedBounds)}>
                Pan map
              </button>
              <button
                type="button"
                aria-label="Zoom cluster: Downtown, 4 stores"
                onClick={() =>
                  onClusterZoom({ bounds: clusterBounds, label: 'Downtown cluster, 4 stores' })
                }
              >
                4
              </button>
              <button type="button" onClick={() => onPreview(syntheticStores[0].id)}>
                Preview marker
              </button>
            </div>
          ),
        }}
      />,
    )
    await screen.findByRole('heading', { name: syntheticStores[0].name })
    await user.click(screen.getByRole('button', { name: /show map/i }))
    await screen.findByRole('button', { name: /pan map/i })
    expect(catalog.map).toHaveBeenCalledTimes(1)

    const searchArea = screen.getByRole('button', { name: /search this map area/i })
    expect(searchArea).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /pan map/i }))
    expect(searchArea).toBeEnabled()
    expect(catalog.map).toHaveBeenCalledTimes(1)
    await user.click(searchArea)
    expect(catalog.map).toHaveBeenLastCalledWith({}, changedBounds, 12)

    await screen.findByRole('button', { name: /zoom cluster: downtown/i })
    await user.click(screen.getByRole('button', { name: /zoom cluster: downtown/i }))
    expect(screen.getByRole('button', { name: /search this map area/i })).toBeEnabled()
    expect(screen.getByText(/downtown cluster, 4 stores expanded/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /preview marker/i }))
    expect(screen.getByRole('complementary', { name: /map marker preview/i })).toHaveTextContent(
      syntheticStores[0].name,
    )
    expect(screen.getByRole('link', { name: /view store details/i })).toHaveAttribute(
      'href',
      `/stores/${syntheticStores[0].slug}`,
    )
    expect(screen.getByRole('complementary', { name: /map marker preview/i })).toHaveTextContent(
      /4.5 from 8 ratings.*open now.*antique mall.*2.4 miles.*claimed listing.*saved.*not visited/i,
    )
    expect(screen.getByRole('link', { name: /add to trip/i })).toHaveAttribute(
      'href',
      `/trips/new?addStoreId=${syntheticStores[0].id}`,
    )
  })

  it('replaces the accessible result list only after Search this map area', async () => {
    const catalog = client()
    const second = syntheticStores[1]
    catalog.map = vi.fn(async (_filters, bounds) => ({
      points: [
        {
          storeId: second.id,
          slug: second.slug,
          name: second.name,
          latitude: Math.min(bounds.north, 39.2),
          longitude: Math.max(bounds.west, -95.7),
          store: second,
          rating: null,
          ratingCount: 0,
          hoursLabel: 'Closed',
          openState: 'closed' as const,
          categoryLabel: second.categories[0].label,
          distanceMiles: 4,
          claimed: false,
          saved: null,
          visited: null,
        },
      ],
    }))
    const user = userEvent.setup()
    const changedBounds = { north: 39.5, south: 39, east: -95.4, west: -96 }
    render(
      <BrowsePage
        client={catalog}
        map={{
          capability: 'available',
          bounds: { north: 40, south: 39, east: -95, west: -96 },
          attribution: 'Approved map',
          render: ({ onBoundsChange }) => (
            <button type="button" onClick={() => onBoundsChange(changedBounds)}>
              Pan map
            </button>
          ),
        }}
      />,
    )
    expect(await screen.findByRole('heading', { name: syntheticStores[0].name })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /show map/i }))
    await user.click(await screen.findByRole('button', { name: /pan map/i }))
    expect(screen.getByRole('heading', { name: syntheticStores[0].name })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /search this map area/i }))
    expect(await screen.findByRole('heading', { name: second.name })).toBeVisible()
    expect(screen.queryByRole('heading', { name: syntheticStores[0].name })).not.toBeInTheDocument()
  })
})
