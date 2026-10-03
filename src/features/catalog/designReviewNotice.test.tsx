import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient, CatalogStore } from './types'

const noticeCopy =
  'Saving stores is paused for this public-test stage. Existing accounts can still sign in.'

function client(stores: CatalogStore[]): CatalogClient {
  const firstStore = stores[0] ?? syntheticStores[0]
  if (!firstStore) throw new Error('Missing catalog fixture store')
  return {
    list: vi.fn(async () => ({ stores, generatedAt: '2026-08-04' })),
    details: vi.fn(async () => firstStore),
    map: vi.fn(async () => ({ points: [], asOfUtc: '2026-08-04T12:00:00Z' })),
  }
}

function notice() {
  return <p role="status">{noticeCopy}</p>
}

afterEach(() => cleanup())

describe('catalog Browse notice placement', () => {
  it('renders one notice outside store action groups before 12 results', async () => {
    const stores = syntheticStores.slice(0, 12)
    expect(stores).toHaveLength(12)
    render(
      <BrowsePage
        client={client(stores)}
        browseNotice={notice()}
        renderPrivateActions={(store) => (
          <button type="button">Keep action for {store.name}</button>
        )}
      />,
    )

    const pauseNotice = await screen.findByText(noticeCopy, { exact: true })
    expect(pauseNotice).toHaveAttribute('role', 'status')
    const results = await screen.findByRole('heading', { name: '12 stores to explore' })
    const notices = screen
      .getAllByRole('status')
      .filter((item) => item.textContent?.trim() === noticeCopy)
    expect(notices).toHaveLength(1)
    expect(pauseNotice).toBeVisible()
    expect(
      pauseNotice.compareDocumentPosition(results) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    for (const store of stores) {
      const actions = screen.getByRole('region', { name: `Store actions for ${store.name}` })
      expect(within(actions).queryByText(noticeCopy)).not.toBeInTheDocument()
      expect(within(actions).getByRole('link', { name: `View store: ${store.name}` })).toBeVisible()
      expect(
        within(actions).getByRole('button', { name: `Keep action for ${store.name}` }),
      ).toBeVisible()
    }
  })

  it.each(['loading', 'error', 'empty'] as const)(
    'keeps the single notice before the %s state',
    async (state) => {
      const catalog = client([])
      if (state === 'loading') {
        catalog.list = vi.fn(() => new Promise<never>(() => undefined))
      } else if (state === 'error') {
        catalog.list = vi.fn(async () => {
          throw new Error('Directory service unavailable')
        })
      }
      render(<BrowsePage client={catalog} browseNotice={notice()} />)

      const pauseNotice = screen.getByText(noticeCopy, { exact: true })
      expect(pauseNotice).toHaveAttribute('role', 'status')
      const stateElement =
        state === 'loading'
          ? screen.getByRole('heading', { name: /finding stores/i })
          : state === 'error'
            ? await screen.findByRole('alert')
            : await screen.findByRole('heading', { name: /trail is quiet/i })
      expect(pauseNotice).toBeVisible()
      expect(
        pauseNotice.compareDocumentPosition(stateElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(
        screen.getAllByRole('status').filter((item) => item.textContent?.trim() === noticeCopy),
      ).toHaveLength(1)
    },
  )
})
