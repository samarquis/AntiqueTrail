import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SavedPage, unavailableShopperClient } from './index'

const stores = [
  { storeId: '00000000-0000-4000-8000-000000001001', slug: 'different-public-slug', name: 'Clockwork Cabinet', savedAt: '2026-10-10' },
  { storeId: '00000000-0000-4000-8000-000000001002', slug: 'second-public-slug', name: 'Prairie Patina', savedAt: '2026-10-10' },
]
function setup(allowAddToTrip?: boolean) {
  const client = { ...unavailableShopperClient, listSaved: vi.fn(async () => stores) }
  const props = { client, ...(allowAddToTrip === undefined ? {} : { allowAddToTrip }) }
  render(<MemoryRouter><SavedPage {...props} /></MemoryRouter>)
}
afterEach(cleanup)
describe('Saved row trip entry', () => {
  it('uses each stable store ID and exact Saved return target when admitted', async () => {
    setup(true)
    await screen.findByRole('link', { name: stores[0].name })
    const rows = within(screen.getByRole('list', { name: 'Saved stores' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    for (const [index, row] of rows.entries()) {
      expect(within(row).getByRole('link', { name: /add to trip/i })).toHaveAttribute('href', `/trips/new?addStoreId=${stores[index].storeId}&returnTo=%2Fsaved`)
      expect(within(row).getByRole('link', { name: stores[index].name })).toHaveAttribute('href', `/stores/${stores[index].slug}`)
    }
  })
  it.each([undefined, false])('keeps entry absent without explicit admission: %s', async (allowed) => {
    setup(allowed)
    await screen.findByRole('link', { name: stores[0].name })
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
  })
})
