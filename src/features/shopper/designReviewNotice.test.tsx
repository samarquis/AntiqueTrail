import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import { CatalogPrivateActions } from './components'
import { unavailableShopperClient } from './shopperClient'

const noticeCopy =
  'Saving stores is paused for this public-test stage. Existing accounts can still sign in.'

function renderActions(context: 'browse' | 'details', stage: 'true' | 'false') {
  vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', stage)
  const getSaveState = vi.fn(unavailableShopperClient.getSaveState)
  const setSave = vi.fn(unavailableShopperClient.setSave)
  render(
    <MemoryRouter initialEntries={['/stores/oak']}>
      <AuthProvider>
        <CatalogPrivateActions
          storeId="store-1"
          storeName="Oak Antiques"
          slug="oak"
          context={context}
          client={{ ...unavailableShopperClient, getSaveState, setSave }}
        />
      </AuthProvider>
    </MemoryRouter>,
  )
  return { getSaveState, setSave }
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.sessionStorage.clear()
})

describe('public-test Browse notice boundary', () => {
  it('suppresses the per-card paused notice and makes no private calls on Browse', () => {
    const client = renderActions('browse', 'true')

    expect(screen.queryByText(noticeCopy, { exact: true })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /save|create account|submit/i }),
    ).not.toBeInTheDocument()
    expect(client.getSaveState).not.toHaveBeenCalled()
    expect(client.setSave).not.toHaveBeenCalled()
  })

  it('preserves the paused notice and draft-only correction guidance on Details', () => {
    renderActions('details', 'true')

    const notice = screen.getByText(noticeCopy, { exact: true })
    expect(notice).toHaveAttribute('role', 'status')
    expect(notice).toBeVisible()
    expect(screen.getByRole('link', { name: 'Draft a correction' })).toHaveAttribute(
      'href',
      '/stores/oak/correction',
    )
    expect(
      screen.getByText(
        'Drafts are available, but submission is unavailable during this public-test stage.',
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /save|create account|submit/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps anonymous just-in-time Save when catalog-only mode is off', () => {
    const client = renderActions('browse', 'false')

    expect(screen.getByRole('link', { name: /save oak antiques.*requires sign-in/i })).toBeVisible()
    expect(screen.queryByText(noticeCopy, { exact: true })).not.toBeInTheDocument()
    expect(client.getSaveState).not.toHaveBeenCalled()
    expect(client.setSave).not.toHaveBeenCalled()
  })
})
