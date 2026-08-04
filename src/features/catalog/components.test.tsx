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
    expect(catalog.map).toHaveBeenCalledWith({}, { north: 40, south: 39, east: -95, west: -96 })

    await user.click(screen.getByRole('button', { name: `Map marker ${syntheticStores[0].name}` }))
    const card = screen.getByRole('article')
    expect(card).toHaveAttribute('aria-current', 'true')
    expect(card).toHaveFocus()

    await user.selectOptions(screen.getByLabelText('Category'), 'vintage')
    expect(await screen.findByTestId('provider-map')).toBeVisible()
    expect(catalog.map).toHaveBeenLastCalledWith(
      { category: 'vintage' },
      { north: 40, south: 39, east: -95, west: -96 },
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
})
