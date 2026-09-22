import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
  it('uses the prototype visual direction without replacing live store data', async () => {
    render(<BrowsePage client={client()} />)

    expect(await screen.findByRole('heading', { name: 'Discover local antiques.' })).toBeVisible()
    expect(
      screen.getByRole('img', {
        name: 'A lamp-lit antique shop aisle with cabinets and curiosities.',
      }),
    ).toBeVisible()
    expect(screen.getByRole('main')).toHaveClass('catalog-browser--review')
    expect(screen.getByRole('link', { name: syntheticStores[0].name })).toHaveAttribute(
      'href',
      `/stores/${syntheticStores[0].slug}`,
    )
  })
})
