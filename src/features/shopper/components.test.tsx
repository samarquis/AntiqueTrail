import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { InMemoryAuthStore, toAuthSession } from '../auth/authClient'
import { CorrectionPage, MemoryPage, SavedPage } from './components'
import type { ShopperPrivateClient } from './types'

function client(overrides: Partial<ShopperPrivateClient> = {}): ShopperPrivateClient {
  return {
    listSaved: vi.fn(async () => [
      { storeId: 'store-1', slug: 'oak', name: 'Oak Antiques', savedAt: '2026-01-01' },
    ]),
    toggleSave: vi.fn(async () => ({ saved: true })),
    getMemory: vi.fn(async () => null),
    upsertMemory: vi.fn(async (memory) => ({ ...memory, version: 1 })),
    deleteMemory: vi.fn(async () => undefined),
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

  it('persists a private memory and supports deletion', async () => {
    const user = userEvent.setup()
    const remove = vi.fn(async () => undefined)
    const lifecycleClient = client({ deleteMemory: remove })
    renderPage(<MemoryPage client={lifecycleClient} />)
    await user.selectOptions(await screen.findByLabelText(/rating/i), '5')
    await user.click(screen.getByRole('button', { name: /save private memory/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
    await user.click(screen.getByRole('button', { name: /delete memory/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted/i)
    expect(remove).toHaveBeenCalledWith('')
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
  })
})
