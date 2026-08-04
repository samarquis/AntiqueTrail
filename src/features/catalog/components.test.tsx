import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage, DetailsPage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient } from './types'

function client(): CatalogClient {
  return {
    list: vi.fn(async () => ({ stores: [syntheticStores[0]], generatedAt: '2026-08-04' })),
    details: vi.fn(async () => syntheticStores[0]),
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
})
