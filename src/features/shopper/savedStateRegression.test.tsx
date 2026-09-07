import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SaveStoreAction } from './components'
import type { ShopperPrivateClient } from './types'

describe('saved-state regression', () => {
  afterEach(() => cleanup())

  it('uses the current account saved state for ordinary catalog actions', async () => {
    const getSaveState = vi.fn(async () => ({ saved: true }))
    const client = {
      getSaveState,
      setSave: vi.fn(async () => ({ saved: true })),
    } as unknown as ShopperPrivateClient
    render(
      <MemoryRouter>
        <SaveStoreAction storeId="store-1" client={client} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Remove saved store' })).toBeEnabled()
    expect(getSaveState).toHaveBeenCalledWith('store-1')
  })
})
