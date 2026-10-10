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

const storeId = '00000000-0000-4000-8000-000000000001'
const target = `/trips/new?addStoreId=${storeId}`

async function openDetails({
  marker = true,
  identity = 'anonymous',
  preview = false,
}: {
  marker?: boolean | 'absent'
  identity?: ReviewScenarioId
  preview?: boolean
} = {}) {
  // Synthetic clients supply data only. No reviewHarness is passed to App.
  const harness = await createReviewHarness({
    dev: true,
    mode: 'review',
    enabled: 'true',
    url: `http://127.0.0.1:4173/stores/blue-finch-curios?reviewAs=${identity}`,
  })
  if (!harness) throw new Error('Details session fixture failed to initialize')
  const runtime = {
    authStore: harness.authStore,
    sessionRegistry: harness.sessionRegistry,
    authProvider: createReviewHarnessAuthProvider(harness.state),
    ...(marker === true ? { configuredLocalShopperReview: true as const } : {}),
  }
  // AppRuntime intentionally types this marker as true-only; exercise runtime
  // rejection of an explicit false value without asserting it is valid provenance.
  if (marker === false) Reflect.set(runtime, 'configuredLocalShopperReview', false)
  render(
    <MemoryRouter
      initialEntries={[preview ? '/stores/the-market-at-macvicar' : '/stores/blue-finch-curios']}
    >
      <App
        clients={{
          ...createReviewHarnessClients(harness.scenario, harness.state),
          catalog: createReviewHarnessCatalogClient(harness.state),
        }}
        runtime={runtime}
      />
    </MemoryRouter>,
  )
  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: preview ? 'The Market at Macvicar' : 'Blue Finch Curios',
    }),
  ).toBeVisible()
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.sessionStorage.clear()
})

describe('configured Details Add to Trip entry', () => {
  it('shows anonymous entry in a configured production build and retains the store at sign-in', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    const user = userEvent.setup()
    await openDetails()
    const action = screen.getByRole('link', { name: 'Add to Trip', exact: true })
    expect(action).toHaveAttribute('href', target)
    await user.click(action)
    expect(await screen.findByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Create account', exact: true })).toHaveAttribute(
      'href',
      `/auth/register?returnTo=${encodeURIComponent(target)}`,
    )
  })

  it('shows configured Shopper entry and opens the existing chooser for that store', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    const user = userEvent.setup()
    await openDetails({ identity: 'shopper-a' })
    const action = screen.getByRole('link', { name: 'Add to Trip', exact: true })
    expect(action).toHaveAttribute('href', target)
    await user.click(action)
    expect(await screen.findByRole('heading', { name: 'Add to Trip', exact: true })).toBeVisible()
    expect(await screen.findByText(/This store is already on:/)).toBeVisible()
  })

  it.each(['absent', false] as const)('does not admit the %s marker', async (marker) => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    await openDetails({ marker })
    expect(screen.queryByRole('link', { name: 'Add to Trip', exact: true })).not.toBeInTheDocument()
  })

  it('public-test restriction wins over the configured marker', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    await openDetails()
    expect(screen.queryByRole('link', { name: 'Add to Trip', exact: true })).not.toBeInTheDocument()
  })

  it.each(['store-owner', 'representative', 'administrator'] as const)(
    'keeps configured %s on the public projection',
    async (identity) => {
      vi.stubEnv('DEV', false)
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      await openDetails({ identity })
      expect(screen.queryByRole('link', { name: 'Add to Trip', exact: true })).not.toBeInTheDocument()
    },
  )

  it('keeps the local catalog preview restricted despite the configured marker', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    const originalWindow = window
    vi.stubGlobal(
      'window',
      new Proxy(originalWindow, {
        get(target, property) {
          return property === 'location'
            ? { ...target.location, hostname: '127.0.0.1' }
            : Reflect.get(target, property, target)
        },
      }),
    )
    await openDetails({ preview: true })
    expect(
      screen.getByText('Local preview only. Save and store claim actions are unavailable.'),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Add to Trip', exact: true })).not.toBeInTheDocument()
  })
})
