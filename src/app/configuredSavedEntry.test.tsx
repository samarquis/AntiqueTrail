import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createReviewHarness } from '../review-harness/harness'
import { createReviewHarnessAuthProvider, createReviewHarnessClients } from '../review-harness/clients'
import { unavailableShopperClient } from '../features/shopper'

const storeId = '00000000-0000-4000-8000-000000001001'
async function setup(marker: boolean, signedIn = true) {
  const harness = await createReviewHarness({ dev: true, mode: 'review', enabled: 'true', url: 'http://127.0.0.1:4173/saved?reviewAs=shopper-a&reviewState=success' })
  if (!harness) throw new Error('Synthetic session fixture failed to initialize')
  if (!signedIn) harness.authStore.clearSession()
  const shopper = { ...unavailableShopperClient, listSaved: vi.fn(async () => [{ storeId, slug: 'not-the-stable-id', name: 'Clockwork Cabinet', savedAt: '2026-10-10' }]) }
  const runtime = {
    authStore: harness.authStore,
    sessionRegistry: harness.sessionRegistry,
    authProvider: signedIn ? createReviewHarnessAuthProvider(harness.state) : undefined,
    ...(marker ? { configuredLocalShopperReview: true as const } : {}),
  }
  render(<MemoryRouter initialEntries={['/saved']}><App clients={{ ...createReviewHarnessClients(harness.scenario, harness.state), shopper }} runtime={runtime} /></MemoryRouter>)
  return shopper
}
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.sessionStorage.clear() })
describe('App configured Saved entry', () => {
  it('passes configured provenance to the rendered signed-in Saved row', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    await setup(true)
    await screen.findByRole('link', { name: 'Clockwork Cabinet' })
    expect(screen.getByRole('link', { name: /add to trip/i })).toHaveAttribute('href', `/trips/new?addStoreId=${storeId}&returnTo=%2Fsaved`)
  })
  it('does not grant entry to an ordinary signed-in runtime', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    await setup(false)
    await screen.findByRole('link', { name: 'Clockwork Cabinet' })
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
  })
  it('public-test restriction wins over an explicit marker', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const shopper = await setup(true)
    expect(await screen.findByRole('heading', { name: 'Private account actions are paused' })).toBeVisible()
    expect(shopper.listSaved).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
  })
  it('marker does not bypass the private session guard', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    const shopper = await setup(true, false)
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeVisible()
    expect(shopper.listSaved).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
  })
})

