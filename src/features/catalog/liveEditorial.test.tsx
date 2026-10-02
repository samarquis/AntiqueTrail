import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowsePage } from './components'
import { syntheticStores } from './demoClient'
import type { CatalogClient } from './types'

function client(): CatalogClient {
  return {
    list: vi.fn(async () => ({ stores: [syntheticStores[0]], generatedAt: '2026-08-04' })),
    details: vi.fn(async () => syntheticStores[0]),
  }
}

describe('live Browse editorial surface', () => {
  afterEach(cleanup)

  it('uses the prototype visual direction without replacing live store data', async () => {
    render(<BrowsePage client={client()} />)

    expect(await screen.findByRole('heading', { name: 'Discover local antiques.' })).toBeVisible()
    expect(
      screen.getByRole('img', {
        name: 'A lamp-lit antique shop aisle with cabinets and curiosities.',
      }),
    ).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Search stores' })).toBeVisible()
    expect(await screen.findByRole('link', { name: syntheticStores[0].name })).toHaveAttribute(
      'href',
      `/stores/${syntheticStores[0].slug}`,
    )
  })

  it('keeps active-filter feedback inside the search controls', async () => {
    render(<BrowsePage client={client()} initialSearch="?q=Blue+Finch" />)

    const search = screen.getByRole('search')
    expect(await within(search).findByRole('status')).toHaveTextContent(
      'Filters are active. Open Filters to review or clear them.',
    )
  })
})
