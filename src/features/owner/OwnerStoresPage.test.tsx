import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerStoresPage } from './OwnerStoresPage'
import type { OwnerClient } from './ownerClient'

const stores = [{ storeId: '00000000-0000-4000-8000-000000001001', name: 'Clockwork Cabinet' }]
function show(client: OwnerClient) {
  render(
    <MemoryRouter initialEntries={['/owner/stores']}>
      <Routes>
        <Route path="/owner/stores" element={<OwnerStoresPage client={client} />} />
        <Route path="/store-portal" element={<h1>Selected store portal</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}
describe('Store Owner workspace entry', () => {
  afterEach(cleanup)
  it('lists approved stores and enters the portal only after server selection', async () => {
    const client = {
      listStores: vi.fn().mockResolvedValue(stores),
      selectStore: vi.fn().mockResolvedValue(undefined),
    }
    show(client)
    const button = await screen.findByRole('button', { name: 'Open Clockwork Cabinet' })
    await userEvent.click(button)
    expect(client.selectStore).toHaveBeenCalledWith(stores[0].storeId)
    expect(
      await screen.findByRole('heading', { name: 'Selected store portal' }),
    ).toBeInTheDocument()
  })
  it('shows reason-neutral denial and recovers with a fresh authorized list', async () => {
    const client = {
      listStores: vi.fn().mockRejectedValueOnce(new Error('revoked')).mockResolvedValueOnce(stores),
      selectStore: vi.fn(),
    }
    show(client)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store workspace access is unavailable.',
    )
    expect(screen.queryByText('revoked')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check access again' }))
    expect(
      await screen.findByRole('button', { name: 'Open Clockwork Cabinet' }),
    ).toBeInTheDocument()
  })
  it('removes stale choices when selection is revoked', async () => {
    show({
      listStores: vi.fn().mockResolvedValue(stores),
      selectStore: vi.fn().mockRejectedValue(new Error('revoked')),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Open Clockwork Cabinet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Store workspace access is unavailable.',
    )
    expect(screen.queryByRole('button', { name: 'Open Clockwork Cabinet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Selected store portal' })).not.toBeInTheDocument()
  })
})
