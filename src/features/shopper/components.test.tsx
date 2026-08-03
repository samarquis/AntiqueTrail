import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { CorrectionPage, MemoryPage, NewSincePage, SavedPage, SaveStoreAction } from './components'
import type { ShopperPrivateClient } from './types'

function client(overrides: Partial<ShopperPrivateClient> = {}): ShopperPrivateClient {
  return {
    listSaved: vi.fn(async () => [
      { storeId: 'store-1', slug: 'oak', name: 'Oak Antiques', savedAt: '2026-01-01' },
    ]),
    toggleSave: vi.fn(async () => ({ saved: true })),
    getMemory: vi.fn(async () => null),
    upsertMemory: vi.fn(async (memory) => ({ ...memory, version: 1 })),
    deleteMemory: vi.fn(async () => ({
      undoToken: 'undo-memory-1',
      undoUntil: '2026-08-03T22:05:00Z',
    })),
    undoDeleteMemory: vi.fn(async () => ({
      storeId: 'store-1',
      rating: 5,
      note: 'Worth returning',
      lastVisitMonth: '2026-07',
      version: 2,
    })),
    listCatalogAreas: vi.fn(async () => [
      { id: 'area-topeka', slug: 'topeka-ks', label: 'Topeka' },
    ]),
    getNewSince: vi.fn(async () => ({
      area: { id: 'area-topeka', slug: 'topeka-ks', label: 'Topeka' },
      lastSeenAt: '2026-07-01T12:00:00Z',
      stores: [
        {
          storeId: 'store-new',
          slug: 'new-store',
          name: 'New Store',
          addedAt: '2026-07-03T12:00:00Z',
        },
      ],
    })),
    markCatalogSeen: vi.fn(async () => ({ seenAt: '2026-08-03T12:00:00Z' })),
    dismissNewStore: vi.fn(async () => undefined),
    submitCorrection: vi.fn(async () => ({ id: 'correction-1', state: 'submitted' as const })),
    getCorrection: vi.fn(async () => ({ id: 'correction-1', state: 'triaged' as const })),
    ...overrides,
  }
}

function renderPage(page: ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

describe('private shopper screens', () => {
  afterEach(() => cleanup())

  it('renders saved stores from an account-scoped client', async () => {
    renderPage(<SavedPage client={client()} />)
    expect(await screen.findByRole('link', { name: 'Oak Antiques' })).toHaveAttribute(
      'href',
      '/stores/oak',
    )
  })

  it('removes a saved store and can undo the removal', async () => {
    const user = userEvent.setup()
    const toggleSave = vi
      .fn<ShopperPrivateClient['toggleSave']>()
      .mockResolvedValueOnce({ saved: false })
      .mockResolvedValueOnce({ saved: true })
    renderPage(<SavedPage client={client({ toggleSave })} />)

    await user.click(await screen.findByRole('button', { name: 'Remove saved store' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Store removed')
    await user.click(screen.getByRole('button', { name: 'Undo removal' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Removal undone')
  })

  it('saves a store and offers an accessible Undo action', async () => {
    const user = userEvent.setup()
    const toggleSave = vi
      .fn<ShopperPrivateClient['toggleSave']>()
      .mockResolvedValueOnce({ saved: true })
      .mockResolvedValueOnce({ saved: false })

    renderPage(<SaveStoreAction storeId="store-1" client={client({ toggleSave })} />)
    await user.click(screen.getByRole('button', { name: 'Save store' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Store saved')
    await user.click(screen.getByRole('button', { name: 'Undo save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Save undone')
    expect(toggleSave).toHaveBeenNthCalledWith(1, 'store-1')
    expect(toggleSave).toHaveBeenNthCalledWith(2, 'store-1')
  })

  it('persists a private memory and restores it through deletion Undo', async () => {
    const user = userEvent.setup()
    const remove = vi.fn<ShopperPrivateClient['deleteMemory']>(async () => ({
      undoToken: 'undo-memory-1',
      undoUntil: '2026-08-03T22:05:00Z',
    }))
    const undo = vi.fn<ShopperPrivateClient['undoDeleteMemory']>(async () => ({
      storeId: '',
      rating: 5,
      note: null,
      lastVisitMonth: null,
      version: 2,
    }))
    const lifecycleClient = client({ deleteMemory: remove, undoDeleteMemory: undo })
    renderPage(<MemoryPage client={lifecycleClient} />)
    await user.selectOptions(await screen.findByLabelText(/rating/i), '5')
    await user.click(screen.getByRole('button', { name: /save private memory/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
    await user.click(screen.getByRole('button', { name: /delete memory/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted/i)
    await user.click(screen.getByRole('button', { name: 'Undo memory deletion' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/restored/i)
    expect(screen.getByLabelText(/rating/i)).toHaveValue('5')
    expect(remove).toHaveBeenCalledWith('')
    expect(undo).toHaveBeenCalledWith('', 'undo-memory-1')
  })

  it('loads New Since only after a shopper manually selects a coarse area', async () => {
    const user = userEvent.setup()
    const getNewSince = vi.fn<ShopperPrivateClient['getNewSince']>(async () => ({
      area: { id: 'area-topeka', slug: 'topeka-ks', label: 'Topeka' },
      lastSeenAt: '2026-07-01T12:00:00Z',
      stores: [
        {
          storeId: 'store-new',
          slug: 'new-store',
          name: 'New Store',
          addedAt: '2026-07-03T12:00:00Z',
        },
      ],
    }))
    const markCatalogSeen = vi.fn<ShopperPrivateClient['markCatalogSeen']>(async () => ({
      seenAt: '2026-08-03T12:00:00Z',
    }))
    const dismissNewStore = vi.fn<ShopperPrivateClient['dismissNewStore']>(async () => undefined)
    renderPage(<NewSincePage client={client({ getNewSince, markCatalogSeen, dismissNewStore })} />)

    expect(getNewSince).not.toHaveBeenCalled()
    await user.selectOptions(await screen.findByLabelText('Choose an area'), 'area-topeka')
    expect(await screen.findByRole('link', { name: 'New Store' })).toHaveAttribute(
      'href',
      '/stores/new-store',
    )
    expect(getNewSince).toHaveBeenCalledWith('area-topeka')
    await user.click(screen.getByRole('button', { name: 'Dismiss New Store' }))
    expect(dismissNewStore).toHaveBeenCalledWith('store-new')
    expect(screen.queryByRole('link', { name: 'New Store' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark Topeka as seen' }))
    expect(markCatalogSeen).toHaveBeenCalledWith('area-topeka')
    expect(await screen.findByRole('status')).toHaveTextContent('You are caught up in Topeka')
  })

  it('keeps an anonymous correction draft and refuses submission', async () => {
    const user = userEvent.setup()
    const submitCorrection = vi.fn()
    render(
      <MemoryRouter initialEntries={['/stores/oak/correction']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/stores/:slug/correction"
              element={<CorrectionPage client={client({ submitCorrection })} />}
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/description/i), 'Hours have changed')
    await user.click(screen.getByRole('button', { name: /submit correction/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/sign in to submit/i)
    expect(submitCorrection).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Hours have changed')).toBeInTheDocument()
    cleanup()
    render(
      <MemoryRouter initialEntries={['/stores/oak/correction']}>
        <AuthProvider>
          <Routes>
            <Route path="/stores/:slug/correction" element={<CorrectionPage client={client()} />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByDisplayValue('Hours have changed')).toBeInTheDocument()
  })
})
