import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage, DetailsPage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient, CatalogStore } from './types'

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
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
    vi.unstubAllEnvs()
  })

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

  it('keeps store links inside a configured deployment base path', async () => {
    vi.stubEnv('BASE_URL', '/AntiqueTrail/')
    render(<BrowsePage client={client()} />)

    expect(await screen.findByRole('link', { name: syntheticStores[0].name })).toHaveAttribute(
      'href',
      `/AntiqueTrail/stores/${syntheticStores[0].slug}`,
    )
  })

  it('defaults to Package 1 filters and exposes a labeled filter panel contract', async () => {
    const user = userEvent.setup()
    render(<BrowsePage client={client()} />)
    await screen.findByRole('heading', { name: syntheticStores[0].name })

    const trigger = screen.getByRole('button', { name: /^filters$/i })
    expect(trigger).toHaveAttribute('aria-controls', 'catalog-filter-panel')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    expect(screen.getByLabelText('Search stores')).toBeVisible()
    expect(screen.getByLabelText('Category')).toBeVisible()
    expect(screen.getByLabelText('Area')).toBeVisible()
    expect(screen.queryByLabelText('Visit status')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /open now/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply filters/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeDisabled()
  })

  it('adds later Browse filters only at their delivery stage', async () => {
    render(<BrowsePage client={client()} filterStage="package-10a" />)
    await screen.findByRole('heading', { name: syntheticStores[0].name })

    expect(screen.getByLabelText('Visit status')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /saved only/i })).toBeVisible()
    expect(screen.getByLabelText('Distance from area center')).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /open now/i })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: /claimed only/i })).toBeVisible()
  })

  it("shows today's hours and a plain-language open state on each card", async () => {
    render(<BrowsePage client={client()} />)
    const card = await screen.findByRole('article')
    expect(card.querySelector('.catalog-card__hours')).toHaveTextContent(
      /open now.*wednesday: 10:00 am–6:00 pm/i,
    )
    const cover = card.querySelector<HTMLImageElement>('.catalog-card__image')
    expect(cover).toHaveAttribute('alt', expect.stringMatching(/\S+/))
    expect(cover?.alt.toLowerCase()).not.toContain(syntheticStores[0].name.toLowerCase())
    expect(cover).toHaveAttribute('srcset', expect.stringContaining('/800w/'))
    expect(cover).toHaveAttribute('sizes', '(max-width: 1023px) calc(100vw - 2rem), 540px')
  })

  it('renders a distinct blocked state without requesting catalog data', async () => {
    const catalog = client()
    render(<BrowsePage client={catalog} availability="blocked" />)

    expect(await screen.findByRole('heading', { name: /browse is unavailable/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /return home/i })).toHaveAttribute('href', '/')
    expect(catalog.list).not.toHaveBeenCalled()
  })

  it('gives loading, empty, and error results distinct recovery semantics', async () => {
    const pending = client()
    pending.list = vi.fn(() => new Promise<never>(() => undefined))
    const loadingView = render(<BrowsePage client={pending} />)
    expect(screen.getByRole('heading', { name: /finding stores/i })).toBeVisible()
    loadingView.unmount()

    const empty = client()
    empty.list = vi.fn(async () => ({ stores: [] }))
    const emptyView = render(<BrowsePage client={empty} />)
    expect(await screen.findByRole('heading', { name: /trail is quiet/i })).toBeVisible()
    emptyView.unmount()

    const failed = client()
    failed.list = vi.fn(async () => {
      throw new Error('Directory service unavailable')
    })
    render(<BrowsePage client={failed} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn’t load.*directory service unavailable/i)
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeVisible()
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
    render(<BrowsePage client={catalog} />)
    expect(await screen.findByRole('heading', { name: syntheticStores[0].name })).toBeVisible()

    expect(screen.getByRole('status')).toHaveTextContent(/not available.*list.*available/i)
    expect(screen.queryByRole('button', { name: /show map/i })).not.toBeInTheDocument()
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
    const preview = screen.getByRole('complementary', { name: /map marker preview/i })
    expect(within(preview).getByRole('link', { name: /add to trip/i })).toHaveAttribute(
      'href',
      `/trips/new?addStoreId=${syntheticStores[0].id}`,
    )
    expect(screen.getAllByRole('link', { name: /add to trip/i }).length).toBeGreaterThanOrEqual(2)
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

describe('trustworthy Store Details contract', () => {
  const detailedStore = {
    ...syntheticStores[0],
    phone: '785-555-0101',
    email: 'hello@bluefinch.example',
    website: 'https://bluefinch.example',
    freshness: {
      label: 'Verified this week',
      verifiedAt: '2026-08-03T12:00:00Z',
      daysOld: 2,
      status: 'current' as const,
    },
    provenance: {
      sourceLabel: 'Synthetic Store owner-approved profile',
      updatedAt: '2026-08-02T12:00:00Z',
      note: 'Fictional information for product review.',
    },
    accessibility: {
      status: 'verified' as const,
      details: ['Step-free front entrance', 'Seating available near checkout'],
      verifiedAt: '2026-08-01T12:00:00Z',
    },
    hoursExceptions: [
      {
        date: '2026-08-09',
        label: 'Summer market Sunday',
        status: 'open' as const,
        intervals: [{ opensAt: '11:00', closesAt: '15:00' }],
        note: 'Closes early',
      },
    ],
    updates: [
      {
        id: 'update-1',
        title: 'New cabinet collection',
        body: 'A new group of oak cabinets is now on the floor.',
        publishedAt: '2026-08-04T12:00:00Z',
      },
    ],
    socialLinks: [{ platform: 'Instagram' as const, href: 'https://instagram.com/bluefinch' }],
    media: [
      {
        src: '/synthetic-stores/1280w/blue-finch-cover.webp',
        alt: 'Blue Finch Curios storefront with a teal door',
        kind: 'cover' as const,
        caption: 'Front entrance',
        rightsLabel: 'Synthetic image · approved for testing',
      },
      {
        src: '/synthetic-stores/1280w/blue-finch-gallery-1.webp',
        alt: 'Oak cabinets inside Blue Finch Curios',
        kind: 'gallery' as const,
      },
    ],
  }

  function detailsClient(store: CatalogStore = detailedStore): CatalogClient {
    return {
      list: vi.fn(async () => ({ stores: [store] })),
      details: vi.fn(async () => store),
    }
  }

  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('puts visit-critical, provenance, accessibility, updates, and external links in order', async () => {
    render(<DetailsPage client={detailsClient()} slug={detailedStore.slug} />)

    expect(await screen.findByRole('heading', { level: 1, name: detailedStore.name })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Hours' })).toBeVisible()
    expect(screen.getByText(/summer market sunday/i)).toBeVisible()
    expect(screen.getByText(/step-free front entrance/i)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    expect(screen.getByRole('heading', { name: /new cabinet collection/i })).toBeVisible()
    expect(screen.getByText(/synthetic store owner-approved profile/i)).toBeVisible()
    expect(screen.getByText('August 3, 2026')).toBeVisible()

    const navigate = screen.getByRole('link', { name: /navigate in maps/i })
    expect(navigate).toHaveAttribute('target', '_blank')
    expect(decodeURIComponent(navigate.getAttribute('href') ?? '')).toContain(detailedStore.address)
    expect(screen.getByRole('link', { name: /visit official website/i })).toHaveAttribute(
      'rel',
      'noreferrer',
    )
    expect(screen.getByRole('link', { name: /instagram/i })).toHaveAttribute('target', '_blank')
  })

  it('provides a keyboard-operable gallery with failure and enlargement behavior', async () => {
    const user = userEvent.setup()
    render(<DetailsPage client={detailsClient()} slug={detailedStore.slug} />)
    await screen.findByRole('heading', { level: 1, name: detailedStore.name })

    const second = screen.getByRole('button', { name: /show image 2: oak cabinets/i })
    await user.click(second)
    expect(second).toHaveAttribute('aria-pressed', 'true')
    const selectedImage = screen.getByRole('img', { name: /oak cabinets inside/i })
    expect(selectedImage).toBeVisible()
    expect(selectedImage).toHaveAttribute('srcset', expect.stringContaining('/480w/'))

    const enlarge = screen.getByRole('button', { name: /enlarge image: oak cabinets/i })
    await user.click(enlarge)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeVisible()
    expect(screen.getByRole('button', { name: /close enlarged image/i })).toHaveFocus()
    const enlargedImage = within(dialog).getByRole('img', { name: /oak cabinets inside/i })
    expect(enlargedImage).toHaveAttribute('srcset', expect.stringContaining('/480w/'))
    expect(enlargedImage).toHaveAttribute('srcset', expect.stringContaining('/800w/'))
    expect(enlargedImage).toHaveAttribute('srcset', expect.stringContaining('/1280w/'))
    expect(enlargedImage).toHaveAttribute('sizes', '(max-width: 800px) calc(100vw - 2rem), 1120px')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(enlarge).toHaveFocus())

    await user.click(enlarge)
    const reopenedDialog = screen.getByRole('dialog')
    fireEvent.error(within(reopenedDialog).getByRole('img', { name: /oak cabinets inside/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const missingImage = screen.getByRole('img', { name: /store image unavailable/i })
    expect(missingImage).toHaveTextContent(/photo unavailable/i)
    await waitFor(() => expect(second).toHaveFocus())
    expect(second).toHaveTextContent(/unavailable/i)
  })

  it('makes every photo reachable when a store has more than six', async () => {
    const manyPhotos = {
      ...detailedStore,
      media: Array.from({ length: 9 }, (_, index) => ({
        src: `/synthetic-stores/1280w/photo-${index + 1}.webp`,
        alt: `Synthetic store photo ${index + 1}`,
        kind: 'gallery' as const,
      })),
    }
    const user = userEvent.setup()
    render(<DetailsPage client={detailsClient(manyPhotos)} slug={manyPhotos.slug} />)
    await screen.findByRole('heading', { level: 1, name: manyPhotos.name })

    const ninth = screen.getByRole('button', { name: /show image 9: synthetic store photo 9/i })
    await user.click(ninth)
    expect(ninth).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /synthetic store photo 9/i })).toBeVisible()
  })

  it('reveals Add to Trip only after its backing package is enabled', async () => {
    const packageOne = render(
      <DetailsPage client={detailsClient()} slug={detailedStore.slug} stage="package-1" />,
    )
    await screen.findByRole('heading', { level: 1, name: detailedStore.name })
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
    packageOne.unmount()

    render(<DetailsPage client={detailsClient()} slug={detailedStore.slug} stage="package-5a" />)
    await screen.findByRole('heading', { level: 1, name: detailedStore.name })
    expect(screen.getByRole('link', { name: /add to trip/i })).toHaveAttribute(
      'href',
      `/trips/new?addStoreId=${detailedStore.id}`,
    )
  })

  it('states missing decision information instead of silently omitting it', async () => {
    const sparse = {
      ...detailedStore,
      description: null,
      phone: null,
      email: null,
      website: null,
      freshness: undefined,
      provenance: undefined,
      accessibility: undefined,
      hours: [],
      hoursExceptions: [],
      updates: [],
      media: [],
    }
    render(<DetailsPage client={detailsClient(sparse)} slug={sparse.slug} />)
    await screen.findByRole('heading', { level: 1, name: sparse.name })

    expect(screen.getByText(/store description has not been supplied/i)).toBeVisible()
    expect(screen.getByText(/regular hours are unavailable/i)).toBeVisible()
    expect(screen.getByText(/contact details have not been supplied/i)).toBeVisible()
    expect(screen.getByText(/accessibility information is unavailable/i)).toBeVisible()
    expect(screen.getByText(/has not published any updates/i)).toBeVisible()
    expect(screen.getByText(/source information unavailable/i)).toBeVisible()
    expect(screen.getByText(/verification date unavailable/i)).toBeVisible()
  })

  it('restores the exact Browse query, scroll position, and originating store focus', async () => {
    window.history.replaceState({}, '', '/stores?q=finch&area=topeka-ks')
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const browse = render(
      <BrowsePage client={detailsClient()} initialSearch={window.location.search} />,
    )
    const storeLink = await screen.findByRole('link', { name: detailedStore.name })
    fireEvent.click(storeLink)
    browse.unmount()

    window.history.replaceState({}, '', `/stores/${detailedStore.slug}`)
    const details = render(<DetailsPage client={detailsClient()} slug={detailedStore.slug} />)
    expect(await screen.findByRole('link', { name: /back to browse/i })).toHaveAttribute(
      'href',
      '/stores?q=finch&area=topeka-ks',
    )
    details.unmount()

    window.history.replaceState({}, '', '/stores?q=finch&area=topeka-ks')
    render(<BrowsePage client={detailsClient()} initialSearch={window.location.search} />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: detailedStore.name })).toHaveFocus(),
    )
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' })
    scrollTo.mockRestore()
  })
})
