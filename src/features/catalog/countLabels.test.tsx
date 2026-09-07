import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage, DetailsPage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient } from './types'

function catalogClient(stores = syntheticStores): CatalogClient {
  return {
    list: vi.fn(async () => ({ stores })),
    details: vi.fn(async () => stores[0] ?? null),
  }
}

describe('catalog count labels', () => {
  afterEach(cleanup)

  it.each([
    [[], 'No stores are available yet.'],
    [[syntheticStores[0]], '1 store to explore'],
    [[syntheticStores[0], syntheticStores[1]], '2 stores to explore'],
  ])('uses the correct store wording for %s result(s)', async (stores, expected) => {
    render(<BrowsePage client={catalogClient(stores)} />)
    expect(await screen.findByText(expected)).toBeVisible()
  })

  it('uses singular photo wording while preserving the gallery destination', async () => {
    const store = { ...syntheticStores[0], media: [syntheticStores[0].media[0]] }
    render(<DetailsPage client={catalogClient([store])} slug={store.slug} />)

    const link = await screen.findByRole('link', { name: 'See all 1 photo' })
    expect(link).toHaveAttribute('href', `/stores/${store.slug}/photos`)
  })

  it('retains plural photo wording and count', async () => {
    render(
      <DetailsPage client={catalogClient([syntheticStores[0]])} slug={syntheticStores[0].slug} />,
    )
    expect(await screen.findByRole('link', { name: /see all \d+ photos/i })).toBeVisible()
  })
})
