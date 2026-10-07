import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createReviewHarness } from '../review-harness/harness'
import {
  createReviewHarnessAuthProvider,
  createReviewHarnessCatalogClient,
  createReviewHarnessClients,
} from '../review-harness/clients'
import type { ReviewScenarioId } from '../review-harness/types'

describe('local Details to Add to Trip connection', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  async function openDetails(
    identity: ReviewScenarioId = 'shopper-a',
    selected = true,
    signedOut = false,
  ) {
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: `http://localhost/stores/blue-finch-curios?reviewAs=${identity}`,
    })
    if (signedOut) harness!.authStore.clearSession()
    const user = userEvent.setup()
    const clients = {
      catalog: createReviewHarnessCatalogClient(harness!.state),
      ...createReviewHarnessClients(harness!.scenario, harness!.state),
    }
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
        <App
          clients={clients}
          runtime={{
            reviewHarness: selected ? harness! : undefined,
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Blue Finch Curios' }),
    ).toBeVisible()
    return { user, harness: harness!, clients }
  }

  it('opens the existing chooser from the visible store action with the same store', async () => {
    const { user } = await openDetails()
    await user.click(screen.getByRole('link', { name: 'Add to Trip' }))
    expect(await screen.findByRole('heading', { name: 'Add to Trip' })).toBeVisible()
    expect(await screen.findByText(/This store is already on:/)).toBeVisible()
  })

  it('preserves the exact store through anonymous sign-in entry and cancels without a private write', async () => {
    const { user } = await openDetails('anonymous')
    await user.click(screen.getByRole('link', { name: 'Add to Trip' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/auth/register?returnTo=%2Ftrips%2Fnew%3FaddStoreId%3D00000000-0000-4000-8000-000000000001',
    )
    await user.click(screen.getByRole('link', { name: 'Cancel and return without saving' }))
    expect(await screen.findByRole('heading', { name: /Discover local antiques/i })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Add to Trip' })).not.toBeInTheDocument()
  })

  it.each(['store-owner', 'representative', 'administrator'] as const)(
    'keeps %s on the public store projection',
    async (identity) => {
      await openDetails(identity)
      expect(screen.queryByRole('link', { name: 'Add to Trip' })).not.toBeInTheDocument()
    },
  )

  it('keeps ordinary composition restricted even in development', async () => {
    await openDetails('shopper-a', false)
    expect(screen.queryByRole('link', { name: 'Add to Trip' })).not.toBeInTheDocument()
  })

  it('leaves existing trip data unchanged when selected-shopper authentication is cancelled', async () => {
    const { user, clients } = await openDetails('shopper-a', true, true)
    const originalTrips = await clients.trips!.list()
    await user.click(screen.getByRole('link', { name: 'Add to Trip' }))
    await user.click(await screen.findByRole('link', { name: 'Cancel and return without saving' }))
    expect(await screen.findByRole('heading', { name: /Discover local antiques/i })).toBeVisible()
    expect(await clients.trips!.list()).toEqual(originalTrips)
  })

  it('keeps catalog-only public exposure restricted even with a review runtime', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    await openDetails()
    expect(screen.queryByRole('link', { name: 'Add to Trip' })).not.toBeInTheDocument()
  })

  it('keeps production restricted even with a review runtime', async () => {
    vi.stubEnv('DEV', false)
    await openDetails()
    expect(screen.queryByRole('link', { name: 'Add to Trip' })).not.toBeInTheDocument()
  })

  it('keeps a non-loopback host restricted', async () => {
    const originalWindow = window
    vi.stubGlobal(
      'window',
      new Proxy(originalWindow, {
        get(target, property) {
          return property === 'location'
            ? { ...target.location, hostname: 'example.invalid' }
            : Reflect.get(target, property, target)
        },
      }),
    )
    await openDetails()
    expect(screen.queryByRole('link', { name: 'Add to Trip' })).not.toBeInTheDocument()
  })
})
