import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryAuthStore, type AuthSession } from '../features/auth'
import * as auth from '../features/auth'
import { unavailableAccountSettingsClient } from '../features/account/settings'
import {
  createTripOfflineRuntime,
  InMemoryOfflineDatabase,
  type TripOfflineRuntime,
} from '../features/trips'
import type { PartnerAdminClient } from '../features/partners'
import { createAccessibleCatalogMapAdapter, demoCatalogClient } from '../features/catalog'
import { unavailableReviewClient } from '../features/reviews'
import { unavailablePortalClient } from '../features/portal'
import { unavailableShopperClient } from '../features/shopper'
import type { DurableReadinessClient } from '../features/readiness'
import type { BillingClient, CommercialResearchConfig } from '../features/billing'
import App from './App'
import { createReviewHarness } from '../review-harness/harness'
import {
  createReviewHarnessAuthProvider,
  createReviewHarnessClients,
} from '../review-harness/clients'

describe('portal authorization continuity', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function fixture() {
    const session: AuthSession = {
      userId: 'representative-1',
      accessToken: 'synthetic-memory-token',
      expiresAt: Date.now() + 60_000,
      role: 'Representative',
      mfaRequired: false,
      mfaVerified: true,
      displayName: 'Original Name',
      email: 'synthetic@example.invalid',
      emailVerified: true,
      provider: 'email',
      passwordAuthenticatedAt: '2026-10-04T00:00:00Z',
      mfaEnrolled: true,
      mfaVerifiedAt: '2026-10-04T00:00:00Z',
      accountState: 'active',
      deletionDueAt: '2026-10-11T00:00:00Z',
    }
    const authStore = new InMemoryAuthStore()
    authStore.setSession(session)
    let finishSettings!: (value: {
      displayName: string
      locationAddress: null
      version: number
    }) => void
    const getSettings = vi.fn(
      () =>
        new Promise<{ displayName: string; locationAddress: null; version: number }>((resolve) => {
          finishSettings = resolve
        }),
    )
    const getHours = vi.fn(async () => ({
      timeZone: 'America/Chicago',
      version: 1,
      weekly: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
        (label, index) => ({
          weekday: index + 1,
          label,
          isClosed: false,
          intervals: [{ opensAt: '10:00', closesAt: '18:00' }],
        }),
      ),
      holidays: [],
    }))
    const getHome = vi.fn(async () => ({
      store: {
        id: 'store-1',
        name: 'Synthetic Store',
        listingState: 'active' as const,
        timeZone: 'America/Chicago',
      },
      freshness: { state: 'verified' as const, label: 'Verified' },
      provenance: {
        sourceLabel: 'Representative',
        verifiedBy: 'Synthetic Admin',
        verifiedAt: '2026-10-04',
        ownerConfirmed: true,
      },
      pendingChanges: [],
    }))
    const saveHours = vi.fn(async (value: Awaited<ReturnType<typeof getHours>>) => ({
      ...value,
      version: value.version + 1,
    }))
    const registry = {
      registerCurrentSession: vi.fn(async () => undefined),
      isActive: vi.fn(async () => true),
      revoke: vi.fn(async () => undefined),
    }
    let portal = { ...unavailablePortalClient, getHome, getHours, saveHours }
    const originalPortal = portal
    let navigate!: ReturnType<typeof useNavigate>
    let locationKey = ''
    function NavigationControl() {
      navigate = useNavigate()
      locationKey = useLocation().key
      return null
    }
    const tripOffline = createTripOfflineRuntime({ database: new InMemoryOfflineDatabase() })
    const tree = () => (
      <MemoryRouter initialEntries={['/store-portal/hours']}>
        <NavigationControl />
        <App
          runtime={{ authStore, sessionRegistry: registry, tripOffline }}
          clients={{
            portal,
            accountSettings: { ...unavailableAccountSettingsClient, getSettings },
          }}
        />
      </MemoryRouter>
    )
    const view = render(tree())
    let controlledSession: AuthSession | null = session
    let controlling = false
    function replaceSession(next: AuthSession | null) {
      if (!controlling) {
        const actualUseAuth = auth.useAuth
        vi.spyOn(auth, 'useAuth').mockImplementation(() => ({
          ...actualUseAuth(),
          session: controlledSession,
        }))
        controlling = true
      }
      controlledSession = next
      view.rerender(tree())
    }
    return {
      session,
      authStore,
      registry,
      getHome,
      getHours,
      saveHours,
      replaceSession,
      locationKey: () => locationKey,
      historyBack: () => navigate(-1),
      finishSettings: (value: { displayName: string; locationAddress: null }) =>
        finishSettings({ ...value, version: 1 }),
      replaceClient: (getHome: typeof portal.getHome) => {
        portal = { ...portal, getHome }
        view.rerender(tree())
      },
      restoreClient: () => {
        portal = originalPortal
        view.rerender(tree())
      },
    }
  }

  it('retains the mounted hours draft when deferred display-name hydration completes', async () => {
    const item = fixture()
    const original = (await screen.findAllByLabelText('First closing'))[0]
    fireEvent.change(original, { target: { value: '19:45' } })
    expect(original).toHaveValue('19:45')
    const reads = { hours: item.getHours.mock.calls.length, home: item.getHome.mock.calls.length }
    await act(async () => item.finishSettings({ displayName: 'Saved Name', locationAddress: null }))
    await waitFor(() => expect(item.authStore.getSession()?.displayName).toBe('Saved Name'))
    const after = (await screen.findAllByLabelText('First closing'))[0]
    expect(after).toBe(original)
    expect(after).toHaveValue('19:45')
    expect(item.getHours).toHaveBeenCalledTimes(reads.hours)
    expect(item.getHome).toHaveBeenCalledTimes(reads.home)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save hours' }))
    expect(item.saveHours.mock.calls[0][0].weekly[0].intervals[0].closesAt).toBe('19:45')
  })

  it('preserves the mounted draft when only display-only email changes', async () => {
    const item = fixture()
    const original = (await screen.findAllByLabelText('First closing'))[0]
    fireEvent.change(original, { target: { value: '19:45' } })
    const reads = { home: item.getHome.mock.calls.length, hours: item.getHours.mock.calls.length }
    item.replaceSession({ ...item.session, email: 'changed@example.invalid' })
    expect(screen.getAllByLabelText('First closing')[0]).toBe(original)
    expect(original).toHaveValue('19:45')
    expect(item.getHome).toHaveBeenCalledTimes(reads.home)
    expect(item.getHours).toHaveBeenCalledTimes(reads.hours)
  })

  it.each<[keyof AuthSession, AuthSession[keyof AuthSession]]>([
    ['userId', 'another-user'],
    ['emailVerified', false],
    ['provider', 'google'],
    ['role', 'Shopper'],
    ['accessToken', 'different-token'],
    ['expiresAt', Date.now() + 120_000],
    ['mfaRequired', true],
    ['mfaVerified', false],
    ['passwordAuthenticatedAt', '2026-10-04T00:01:00Z'],
    ['mfaEnrolled', false],
    ['mfaVerifiedAt', '2026-10-04T00:01:00Z'],
    ['accountState', 'deletion_scheduled'],
    ['deletionDueAt', '2026-10-12T00:00:00Z'],
  ])('invalidates portal proof when security field %s changes', async (field, value) => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    const reads = item.getHome.mock.calls.length
    let deny!: (error: Error) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          deny = reject
        }),
    )
    item.replaceSession({ ...item.session, [field]: value })
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
    await waitFor(() => expect(item.getHome).toHaveBeenCalledTimes(reads + 1))
    await act(async () => deny(new Error('Denied')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
  })

  it.each<keyof AuthSession>([
    'emailVerified',
    'provider',
    'passwordAuthenticatedAt',
    'mfaEnrolled',
    'mfaVerifiedAt',
    'accountState',
    'deletionDueAt',
  ])('invalidates proof when optional security field %s becomes missing', async (field) => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    const next = { ...item.session }
    delete next[field]
    item.getHome.mockImplementationOnce(() => new Promise(() => undefined))
    item.replaceSession(next)
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
  })

  it('invalidates a cleared session and ignores a stale approval after denial', async () => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    let approve!: (home: Awaited<ReturnType<typeof item.getHome>>) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          approve = resolve
        }),
    )
    item.replaceSession({ ...item.session, accessToken: 'first-refresh' })
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
    item.getHome.mockRejectedValueOnce(new Error('Session cleared'))
    item.replaceSession(null)
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
    await act(async () => approve(await item.getHome()))
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/access is unavailable/i)
  })

  it('invalidates the old portal client while its replacement is pending and denied', async () => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    let deny!: (error: Error) => void
    const replacement = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof item.getHome>>>((_resolve, reject) => {
          deny = reject
        }),
    )
    item.replaceClient(replacement)
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
    await act(async () => deny(new Error('Denied replacement client')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
  })

  it.each([
    ['changed token', 'denied'],
    ['cleared session', 'denied'],
    ['changed token', 'allowed'],
    ['cleared session', 'allowed'],
  ] as const)(
    'requires fresh authorization after %s returns to copied A (%s)',
    async (transition, outcome) => {
      const item = fixture()
      await screen.findAllByLabelText('First closing')
      type Home = Awaited<ReturnType<typeof item.getHome>>
      const home = await item.getHome()
      const reads = item.getHome.mock.calls.length
      let finishB!: (home: Home) => void
      let approveA!: (home: Home) => void
      let denyA!: (error: Error) => void
      item.getHome.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishB = resolve
          }),
      )
      item.replaceSession(
        transition === 'cleared session'
          ? null
          : { ...item.session, accessToken: 'different-token' },
      )
      expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
      await waitFor(() => expect(item.getHome).toHaveBeenCalledTimes(reads + 1))
      item.getHome.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            approveA = resolve
            denyA = reject
          }),
      )
      item.replaceSession({ ...item.session })
      expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
      await waitFor(() => expect(item.getHome).toHaveBeenCalledTimes(reads + 2))
      await act(async () => finishB(home))
      expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
      expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
      if (outcome === 'denied') {
        await act(async () => denyA(new Error('Current A denied')))
        expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
        expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
        expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
      } else {
        await act(async () => approveA(home))
        expect((await screen.findAllByLabelText('First closing'))[0]).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save hours' })).toBeInTheDocument()
      }
    },
  )

  it('requires fresh authorization when the exact original portal client returns', async () => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    type Home = Awaited<ReturnType<typeof item.getHome>>
    const home = await item.getHome()
    let finishB!: (home: Home) => void
    const replacement = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof item.getHome>>>((resolve) => {
          finishB = resolve
        }),
    )
    item.replaceClient(replacement)
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    await waitFor(() => expect(replacement).toHaveBeenCalledOnce())
    let denyA!: (error: Error) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          denyA = reject
        }),
    )
    item.restoreClient()
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
    await act(async () => finishB(home))
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    await act(async () => denyA(new Error('Returned client denied')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
  })

  it('requires fresh authorization when history returns to the original location key', async () => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    const originalKey = item.locationKey()
    type Home = Awaited<ReturnType<typeof item.getHome>>
    const home = await item.getHome()
    let finishB!: (home: Home) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishB = resolve
        }),
    )
    await userEvent.setup().click(screen.getByRole('link', { name: 'Pending changes' }))
    expect(item.locationKey()).not.toBe(originalKey)
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    let denyA!: (error: Error) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          denyA = reject
        }),
    )
    await act(async () => item.historyBack())
    expect(item.locationKey()).toBe(originalKey)
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
    await act(async () => finishB(home))
    expect(screen.queryAllByLabelText('First closing')).toHaveLength(0)
    await act(async () => denyA(new Error('Returned route denied')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByRole('button', { name: 'Save hours' })).not.toBeInTheDocument()
  })

  it('rechecks the next portal route and hides private controls before denial', async () => {
    const item = fixture()
    await screen.findAllByLabelText('First closing')
    let deny!: (error: Error) => void
    item.getHome.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          deny = reject
        }),
    )
    await userEvent.setup().click(screen.getByRole('link', { name: 'Pending changes' }))
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
    await act(async () => deny(new Error('Revoked exact scope')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
  })

  it('removes the workspace when the existing session expiry timer fires', async () => {
    vi.useFakeTimers()
    const item = fixture()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getAllByLabelText('First closing')).not.toHaveLength(0)
    item.getHome.mockRejectedValue(new Error('Expired session'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_001)
    })
    expect(item.authStore.getSession()).toBeNull()
    expect(item.registry.revoke).toHaveBeenCalledWith(expect.anything(), 'session_expired')
    expect(screen.getByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
  })

  it('removes the workspace when the existing registry validation detects revocation', async () => {
    vi.useFakeTimers()
    const item = fixture()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getAllByLabelText('First closing')).not.toHaveLength(0)
    item.registry.isActive.mockResolvedValue(false)
    item.getHome.mockRejectedValue(new Error('Inactive session'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(item.authStore.getSession()).toBeNull()
    expect(item.registry.revoke).toHaveBeenCalledWith(expect.anything(), 'session_revoked')
    expect(screen.getByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByLabelText('First closing')).not.toBeInTheDocument()
  })
})

describe('app shell', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
    vi.unstubAllEnvs()
  })
  it('renders the browse route with a skip-free accessible heading', () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /discover local antiques/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toHaveTextContent(
      'BrowseSaved stores Requires sign-inMore',
    )
    expect(screen.getByRole('heading', { name: /discover local antiques/i })).toHaveFocus()
  })

  it('keeps public-test shopper navigation and shows one saving notice on Browse', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-1',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })

    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: /primary navigation/i })
    expect(screen.getAllByRole('link', { name: /browse|saved stores|more/i })).toHaveLength(3)
    expect(navigation).toHaveTextContent('BrowseSaved storesMore')
    expect(screen.queryByRole('link', { name: /my trip/i })).not.toBeInTheDocument()
    expect(navigation).not.toHaveTextContent(/create account/i)

    const stores = await screen.findAllByRole('article')
    expect(stores).toHaveLength(12)
    const noticeCopy =
      'Saving stores is paused for this public-test stage. Existing accounts can still sign in.'
    const notices = screen
      .getAllByRole('status')
      .filter((notice) => notice.textContent?.trim() === noticeCopy)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toBeVisible()
    for (const store of stores) {
      const actions = within(store).getByRole('region', { name: /store actions for/i })
      expect(within(actions).queryByText(noticeCopy)).not.toBeInTheDocument()
      expect(within(actions).getByRole('link', { name: /view store/i })).toBeVisible()
    }
  })

  it('blocks direct trip routes in the public test without removing local review fixtures', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    const publicView = render(
      <MemoryRouter initialEntries={['/trips']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { name: 'Private account actions are paused' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My trips' })).not.toBeInTheDocument()
    publicView.unmount()

    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/trips?reviewAs=shopper-a&reviewState=success',
    })
    expect(harness).not.toBeNull()
    render(
      <MemoryRouter initialEntries={['/trips?reviewAs=shopper-a&reviewState=success']}>
        <App
          clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
          runtime={{
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
  })

  it('opens the stable More menu and focuses its page heading', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: 'More' }))

    expect(screen.getByRole('heading', { name: 'More' })).toHaveFocus()
    expect(
      screen.getByText('Find account settings, installation help, and self-service guidance.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /more destinations/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /account & privacy/i })).toHaveAttribute(
      'href',
      '/account/privacy',
    )
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute(
      'href',
      '/auth/register',
    )
    expect(screen.getByRole('link', { name: /install/i })).toHaveAttribute('href', '/install')
    expect(screen.getByRole('link', { name: /help/i })).toHaveAttribute('href', '/help')
    expect(
      screen.queryByRole('link', { name: /trip|private history|shared with me/i }),
    ).not.toBeInTheDocument()
  })

  describe('My trips in More', () => {
    afterEach(() => {
      cleanup()
      vi.unstubAllEnvs()
    })

    function sessionStore(role: AuthSession['role']) {
      const authStore = new InMemoryAuthStore()
      authStore.setSession({
        userId: 'more-session',
        accessToken: 'memory-only-token',
        expiresAt: Date.now() + 60_000,
        role,
        mfaRequired: false,
        mfaEnrolled: false,
        mfaVerified: false,
      })
      return authStore
    }

    it('shows My trips for a configured-local Shopper without changing primary navigation', () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      render(
        <MemoryRouter initialEntries={['/more']}>
          <App
            runtime={{
              authStore: sessionStore('Shopper'),
              configuredLocalShopperReview: true,
            }}
          />
        </MemoryRouter>,
      )

      expect(screen.getByRole('link', { name: 'My trips' })).toHaveAttribute('href', '/trips')
      expect(
        within(screen.getByRole('navigation', { name: 'Primary navigation' }))
          .getAllByRole('link')
          .map((link) => link.textContent?.trim()),
      ).toEqual(['Browse', 'Saved stores', 'More'])
    })

    it('shows My trips for the selected in-memory Shopper fixture', async () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      const url = '/more?reviewAs=shopper-a&reviewState=success'
      const harness = await createReviewHarness({
        dev: true,
        mode: 'review',
        enabled: 'true',
        url: `http://127.0.0.1:4173${url}`,
      })
      expect(harness).not.toBeNull()

      render(
        <MemoryRouter initialEntries={[url]}>
          <App
            clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
            runtime={{
              authStore: harness!.authStore,
              sessionRegistry: harness!.sessionRegistry,
              authProvider: createReviewHarnessAuthProvider(harness!.state),
              reviewHarness: harness!,
            }}
          />
        </MemoryRouter>,
      )

      expect(await screen.findByRole('link', { name: 'My trips' })).toHaveAttribute(
        'href',
        '/trips',
      )
    })

    it('hides My trips when a Shopper has neither local admission', () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      render(
        <MemoryRouter initialEntries={['/more']}>
          <App runtime={{ authStore: sessionStore('Shopper') }} />
        </MemoryRouter>,
      )

      expect(screen.queryByRole('link', { name: 'My trips' })).not.toBeInTheDocument()
    })

    it.each(['Store Owner', 'Representative', 'Administrator'] as const)(
      'hides My trips for %s even when configured-local admission is present',
      (role) => {
        vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
        render(
          <MemoryRouter initialEntries={['/more']}>
            <App
              runtime={{
                authStore: sessionStore(role),
                configuredLocalShopperReview: true,
              }}
            />
          </MemoryRouter>,
        )

        expect(screen.queryByRole('link', { name: 'My trips' })).not.toBeInTheDocument()
      },
    )

    it('hides My trips in catalog-only public mode even with configured-local admission', () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
      render(
        <MemoryRouter initialEntries={['/more']}>
          <App
            runtime={{
              authStore: sessionStore('Shopper'),
              configuredLocalShopperReview: true,
            }}
          />
        </MemoryRouter>,
      )

      expect(screen.queryByRole('link', { name: 'My trips' })).not.toBeInTheDocument()
    })
  })

  it('provides actionable public help without inventing a support channel', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Help' })).toHaveFocus()
    expect(
      screen.getByText(
        'Use these public routes. No staffed support channel is published right now.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Correct store information' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
    expect(screen.getByRole('heading', { name: 'Recover account access' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start account recovery' })).toHaveAttribute(
      'href',
      '/auth/recovery',
    )
    expect(
      screen.queryByText(/@|email us\b|response time|business days|contact support/i),
    ).toBeNull()
  })

  it('links signed-in shoppers to private account settings', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-settings',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaEnrolled: false,
      mfaVerified: false,
    })
    render(
      <MemoryRouter initialEntries={['/more']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'User settings' })).toHaveAttribute(
      'href',
      '/account/settings',
    )
  })

  it('greets a signed-in shopper by display name', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-1',
      displayName: 'Avery',
      email: 'avery@example.test',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaEnrolled: false,
      mfaVerified: false,
    })
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Welcome, Avery')).toBeInTheDocument()
  })

  it('shows only the authorized role entry in a representative More menu', async () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'representative-1',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Representative',
      mfaRequired: true,
      mfaEnrolled: true,
      mfaVerified: true,
    })
    render(
      <MemoryRouter initialEntries={['/more']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Store Portal' })).toHaveAttribute(
      'href',
      '/store-portal',
    )
    expect(
      screen.queryByRole('link', { name: /account & privacy|trip|private history/i }),
    ).not.toBeInTheDocument()
  })

  it('focuses the final private destination after lifecycle hydration', async () => {
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/saved?reviewAs=shopper-a&reviewState=success',
    })
    expect(harness).not.toBeNull()
    render(
      <MemoryRouter initialEntries={['/saved?reviewAs=shopper-a&reviewState=success']}>
        <App
          clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
          runtime={{
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /saved stores/i })).toHaveFocus()
  })

  it('advances review export reauthentication to the request action', async () => {
    const user = userEvent.setup()
    const harness = await createReviewHarness({
      dev: true,
      mode: 'review',
      enabled: 'true',
      url: 'http://127.0.0.1:4173/account/export?reviewAs=shopper-a&reviewState=success',
    })
    expect(harness).not.toBeNull()
    render(
      <MemoryRouter initialEntries={['/account/export?reviewAs=shopper-a&reviewState=success']}>
        <App
          clients={createReviewHarnessClients(harness!.scenario, harness!.state)}
          runtime={{
            authStore: harness!.authStore,
            sessionRegistry: harness!.sessionRegistry,
            authProvider: createReviewHarnessAuthProvider(harness!.state),
          }}
        />
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/email/i), 'shopper-a@local.invalid')
    await user.type(screen.getByLabelText(/^password$/i), 'synthetic-password')
    await user.click(screen.getByRole('button', { name: /confirm password/i }))
    expect(await screen.findByRole('button', { name: /request export/i })).toHaveFocus()
  })

  it('wires private shopper actions into public catalog results', async () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      await screen.findAllByRole('link', { name: /save .*requires sign-in/i }),
    ).not.toHaveLength(0)
    expect(
      screen.queryByRole('link', { name: /private memory|suggest a correction/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /add to trip/i })).not.toBeInTheDocument()
  })

  it('keeps correction reporting on Store Details without deferred private actions', async () => {
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: /blue finch curios/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /suggest a correction/i })).toHaveAttribute(
      'href',
      '/stores/blue-finch-curios/correction',
    )
    expect(
      screen.getByRole('link', { name: /save blue finch curios.*requires sign-in/i }),
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: /private memory|add to trip/i }),
    ).not.toBeInTheDocument()
  })

  it('explains draft-only corrections in public Help and the store listing', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const help = render(
      <MemoryRouter initialEntries={['/help']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(
        /correction drafts are available during this public-test stage, but you cannot submit them/i,
      ),
    ).toBeVisible()
    help.unmount()

    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /blue finch curios/i })).toBeVisible()
    expect(screen.getByRole('link', { name: /draft a correction/i })).toHaveAttribute(
      'href',
      '/stores/blue-finch-curios/correction',
    )
    expect(screen.getByText(/drafts are available.*submission is unavailable/i)).toBeVisible()
  })

  it('keeps direct public-test correction routes draft-only for signed-in shoppers', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    const submitCorrection = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios/correction']}>
        <App
          clients={{ shopper: { ...unavailableShopperClient, submitCorrection } }}
          runtime={{ authStore }}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Suggest a correction' })).toBeVisible()
    expect(
      screen.getByText(/prepare a correction draft.*submission is unavailable.*browser tab/i),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: /sign in to submit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit correction/i })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Description'), 'Weekend hours changed')
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem('antique-trail:correction-draft:blue-finch-curios'),
      ).toContain('Weekend hours changed'),
    )
    fireEvent.submit(screen.getByLabelText('Description').closest('form') as HTMLFormElement)
    expect(submitCorrection).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: /cancel and return to this store/i }))
    expect(await screen.findByRole('heading', { name: /blue finch curios/i })).toBeVisible()
    await user.click(screen.getByRole('link', { name: /draft a correction/i }))
    expect(await screen.findByLabelText('Description')).toHaveValue('Weekend hours changed')
  })

  it('warns when the browser tab cannot retain a public-test correction draft', async () => {
    vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
    const setItem = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    const submitCorrection = vi.fn()
    const user = userEvent.setup()

    try {
      render(
        <MemoryRouter initialEntries={['/stores/blue-finch-curios/correction']}>
          <App clients={{ shopper: { ...unavailableShopperClient, submitCorrection } }} />
        </MemoryRouter>,
      )
      const description = await screen.findByLabelText('Description')
      await user.type(description, 'Weekend hours changed')

      expect(screen.getByRole('alert')).toHaveTextContent(/could not save your draft/i)
      expect(description).toHaveValue('Weekend hours changed')
      fireEvent.submit(description.closest('form') as HTMLFormElement)
      expect(submitCorrection).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
    }
  })

  it('composes an injected accessible map without replacing the browse list', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            map: createAccessibleCatalogMapAdapter({
              capability: 'available',
              attribution: 'Approved synthetic map',
              bounds: { north: 39.2, south: 38.9, east: -95.5, west: -95.9 },
            }),
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /blue finch curios/i })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /show map/i }))
    expect(await screen.findAllByRole('region', { name: /store map/i })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  })

  it('fails the unavailable admin boundary closed without a role bypass', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /discover local antiques/i })).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /review queue/i })).not.toBeInTheDocument()
  })

  it('keeps direct Administrator routes under exactly Review, Access, and More', () => {
    render(
      <MemoryRouter initialEntries={['/admin/more']}>
        <App
          runtime={{
            adminSession: {
              userId: 'admin-1',
              role: 'Administrator',
              mfaEnrolled: true,
              mfaVerified: true,
              recentAuthAt: Date.now(),
              sessionActive: true,
            },
          }}
        />
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: /primary navigation/i })
    expect(navigation).toHaveTextContent('ReviewAccessMore')
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Access' })).toHaveAttribute('href', '/admin/access')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/admin/more')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: 'More' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /administrator more destinations/i }),
    ).toHaveTextContent(/Support.*Readiness.*View Audit.*Evidence.*Communities.*System status/s)
  })

  it('keeps partner administration closed without authoritative recent-auth evidence', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /discover local antiques/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /partner administration/i }),
    ).not.toBeInTheDocument()
  })

  it('opens exact partner administration for an injected active MFA recent-auth session', () => {
    const partnerAdmin: PartnerAdminClient = {
      getCase: vi.fn(),
      listStoreTeam: vi.fn(),
      revokeStoreTeamAccess: vi.fn(),
      decide: vi.fn(),
      issueSyntheticInvitation: vi.fn(),
      verifySignal: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App
          clients={{ partnerAdmin }}
          runtime={{
            adminSession: {
              userId: 'admin-1',
              role: 'Administrator',
              mfaEnrolled: true,
              mfaVerified: true,
              recentAuthAt: Date.now(),
              sessionActive: true,
            },
          }}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /partner administration/i })).toBeInTheDocument()
  })

  it('exposes server-owned readiness status only through the authenticated admin boundary', async () => {
    const readiness: DurableReadinessClient = {
      getStatus: vi.fn(async (runId) => ({
        runId,
        state: 'frozen' as const,
        frozenDigest: 'sha256:frozen',
        blockers: ['provider_e'],
        calculatedAt: '2026-08-05T00:00:00Z',
        receiptId: null,
      })),
      requestSigningChallenge: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/admin/readiness/run-1']}>
        <App
          clients={{ readiness }}
          runtime={{
            adminSession: {
              userId: 'admin-1',
              role: 'Administrator',
              mfaEnrolled: true,
              mfaVerified: true,
              recentAuthAt: Date.now(),
              sessionActive: true,
            },
          }}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /readiness status/i })).toBeVisible()
    expect(screen.getByRole('region', { name: /readiness blockers/i })).toHaveTextContent(
      'provider_e',
    )
    expect(readiness.getStatus).toHaveBeenCalledWith('run-1')
  })

  it('opens partner administration from the real AuthContext session metadata', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'admin-2',
      accessToken: 'memory-only-token',
      expiresAt: Date.now() + 60_000,
      role: 'Administrator',
      mfaRequired: true,
      mfaEnrolled: true,
      mfaVerified: true,
      passwordAuthenticatedAt: new Date().toISOString(),
      mfaVerifiedAt: new Date().toISOString(),
    })
    render(
      <MemoryRouter initialEntries={['/admin/partners']}>
        <App
          runtime={{
            authStore,
            sessionRegistry: {
              registerCurrentSession: vi.fn(),
              isActive: vi.fn(async () => true),
              revoke: vi.fn(),
            },
          }}
        />
      </MemoryRouter>,
    )
    return screen.findByRole('heading', { name: /partner administration/i })
  })

  it('exposes partner onboarding routes while keeping provider access gated', async () => {
    render(
      <MemoryRouter initialEntries={['/partner/verify']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /create and verify account/i })).toBeInTheDocument()
    expect(
      screen.getByText(/provider email verification is intentionally disabled/i),
    ).toBeInTheDocument()
  })

  it('keeps Internal Alpha readiness unavailable until an approved test account exists', async () => {
    render(
      <MemoryRouter initialEntries={['/alpha/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /discover local antiques/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /synthetic internal alpha/i }),
    ).not.toBeInTheDocument()
  })

  it('exposes Store Portal home while keeping privileged reads unavailable by default', async () => {
    render(
      <MemoryRouter initialEntries={['/store-portal']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /store portal unavailable/i }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
  })

  it('wires the injected durable Store Portal client into portal routes', async () => {
    const getHome = vi.fn(async () => ({
      store: {
        id: 'store-1',
        name: 'Oak Antiques',
        listingState: 'active' as const,
        timeZone: 'America/Chicago',
      },
      freshness: { state: 'verified' as const, label: 'Verified' },
      provenance: {
        sourceLabel: 'Representative',
        verifiedBy: 'Administrator',
        verifiedAt: '2026-08-01T00:00:00Z',
        ownerConfirmed: true,
      },
      pendingChanges: [],
    }))
    render(
      <MemoryRouter initialEntries={['/store-portal']}>
        <App clients={{ portal: { ...unavailablePortalClient, getHome } }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Oak Antiques')).toBeVisible()
    expect(getHome).toHaveBeenCalledTimes(2)
  })

  it('removes the scoped workspace when the next route check denies the same session', async () => {
    const user = userEvent.setup()
    const getHome = vi.fn(async () => ({
      store: {
        id: 'store-1',
        name: 'Private scope',
        listingState: 'active' as const,
        timeZone: 'America/Chicago',
      },
      freshness: { state: 'verified' as const, label: 'Verified' },
      provenance: {
        sourceLabel: 'Representative',
        verifiedBy: 'Administrator',
        verifiedAt: '2026-08-01T00:00:00Z',
        ownerConfirmed: true,
      },
      pendingChanges: [],
    }))
    render(
      <MemoryRouter initialEntries={['/store-portal']}>
        <App clients={{ portal: { ...unavailablePortalClient, getHome } }} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Private scope')).toBeVisible()
    getHome.mockRejectedValue(new Error('revoked'))
    await user.click(screen.getByRole('link', { name: 'Pending changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/access is unavailable/i)
    expect(screen.queryByText('Private scope')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps External Testing Readiness unavailable until the human gates exist', async () => {
    render(
      <MemoryRouter initialEntries={['/external/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /discover local antiques/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /external testing readiness/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps public review entry unavailable before regional promotion', async () => {
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios/reviews']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/not available in this release/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview review/i })).not.toBeInTheDocument()
  })

  it('keeps commercial research absent unless the protected artifact is configured', () => {
    render(
      <MemoryRouter initialEntries={['/research/photo-tiers/authorization-1']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.queryByText(/exact research offer/i)).not.toBeInTheDocument()
  })

  it('opens only the authenticated exact-config commercial research route', async () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'research-participant',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: false,
    })
    const config: CommercialResearchConfig = {
      version: 7,
      state: 'approved_inactive',
      digest: 'a'.repeat(64),
      galleryPriceCents: 1200,
      fullGalleryPriceCents: 1900,
      currency: 'USD',
      taxMode: 'Tax is calculated at checkout.',
      firstChargeRule: 'First charge follows Checkout confirmation.',
      renewalRule: 'Renews monthly until canceled.',
      cancelAnytimeRule: 'Cancel anytime through the self-serve customer portal.',
      refundWindowRule: 'Request a full refund within 48 hours of a charge; no other refunds.',
      upgradeProrationRule: 'Upgrades take effect immediately with prorated charges.',
      downgradeRule:
        'Downgrades take effect at renewal with no partial refund; the last scheduled downgrade wins.',
      failedPaymentGraceRule:
        'Failed payment has a 14-day grace period, then automatically downgrades to Free.',
      hiddenPhotoDeletionRule:
        'Photos over the Free limit hide at downgrade and delete after a 30-day grace period.',
      refundPolicyVersion: 'refund-v1',
      supportPolicyVersion: 'support-v1',
      termsVersion: 'terms-v1',
      privacyVersion: 'privacy-v1',
      fullGalleryLimitsVersion: 'limits-v1',
      fullGalleryLimits: {
        acceptedFileTypes: ['image/jpeg'],
        maxFileBytes: 10_000_000,
        maxWidthPixels: 6000,
        maxHeightPixels: 6000,
        uploadRateRule: 'Up to 20 uploads per hour.',
        quotaOutageRule: 'Uploads pause during outages.',
        moderationAbuseRule: 'Every photo remains moderated.',
        reasonRecoveryAppealRule: 'A reason, recovery step, and appeal path are provided.',
        paidServiceRemedy: 'Service failures receive the published remedy.',
      },
    }
    const billing: BillingClient = {
      getCapability: vi.fn(),
      startCheckout: vi.fn(),
      recordPaidTierConsent: vi.fn(),
      openPortal: vi.fn(),
      getCommercialResearchConfig: vi.fn(async () => config),
      recordCommercialResearchAttempt: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/research/photo-tiers/authorization-1']}>
        <App
          clients={{ billing }}
          runtime={{
            authStore,
            commercialResearch: {
              artifactDigest: 'b'.repeat(64),
              questionVersion: 'questions-v1',
            },
          }}
        />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /compare optional photo capacity/i }),
    ).toBeVisible()
    expect(billing.getCommercialResearchConfig).toHaveBeenCalledWith('authorization-1')
    expect(billing.startCheckout).not.toHaveBeenCalled()
    expect(billing.openPortal).not.toHaveBeenCalled()
  })

  it('resolves a public store slug before calling the injected durable review client', async () => {
    const getStoreReviews = vi.fn(async () => ({
      storeId: 'unused',
      aggregate: { average: 0, count: 0 },
      reviews: [],
      ownReview: null,
    }))
    const getEligibility = vi.fn(async () => ({
      verifiedEmail: true,
      ageAttested: true,
      requestId: '00000000-0000-4000-8000-000000000003',
      completedVisit: true,
      manualVisitAttested: false,
      activeReviewExists: false,
      ownStoreConflict: false,
      accountDeletionScheduled: false,
      rateLimited: false,
    }))
    render(
      <MemoryRouter initialEntries={['/stores/blue-finch-curios/reviews']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            reviews: {
              ...unavailableReviewClient,
              getCapability: async () => ({
                stage: 'regional_public_mvp',
                enabled: true,
                source: 'server',
              }),
              getStoreReviews,
              getEligibility,
            },
          }}
        />
      </MemoryRouter>,
    )
    const storeId = '00000000-0000-4000-8000-000000000001'
    expect(await screen.findByText(/no approved reviews yet/i)).toBeVisible()
    expect(getStoreReviews).toHaveBeenCalledWith(storeId)
    expect(getEligibility).toHaveBeenCalledWith(storeId)
  })

  it.each(['/for-stores', '/partner/claim'])(
    'does not claim a catalog-only policy while loading availability for %s',
    (route) => {
      render(
        <MemoryRouter initialEntries={[route]}>
          <App
            clients={{
              ownerIntakeAvailability: {
                getAvailability: () => new Promise<never>(() => {}),
              },
            }}
          />
        </MemoryRouter>,
      )
      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', {
          name: 'Owner intake is not available in this public test',
        }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('form')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /apply|claim|submit application/i }),
      ).not.toBeInTheDocument()
    },
  )

  it.each(['/for-stores', '/partner/claim'])(
    'does not claim a catalog-only policy when availability lookup rejects for %s',
    async (route) => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={[route]}>
            <App
              clients={{
                ownerIntakeAvailability: {
                  getAvailability: async () => {
                    throw new Error('Lookup failed')
                  },
                },
              }}
            />
          </MemoryRouter>,
        )
      })
      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
      expect(
        screen.queryByRole('heading', {
          name: 'Owner intake is not available in this public test',
        }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('form')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /apply|claim|submit application/i }),
      ).not.toBeInTheDocument()
    },
  )

  it('hides partner claims when claimsAvailable is false and the other flags are true', async () => {
    render(
      <MemoryRouter initialEntries={['/partner/claim']}>
        <App
          clients={{
            ownerIntakeAvailability: {
              getAvailability: async () => ({
                routeVisible: true,
                intakeAvailable: true,
                claimsAvailable: false,
              }),
            },
          }}
        />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Owner intake is not available in this public test',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /apply|claim|submit application/i }),
    ).not.toBeInTheDocument()
  })

  it('hides owner acquisition when routeVisible is false and the other flags are true', async () => {
    render(
      <MemoryRouter initialEntries={['/for-stores']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            ownerIntakeAvailability: {
              getAvailability: async () => ({
                routeVisible: false,
                intakeAvailable: true,
                claimsAvailable: true,
              }),
            },
          }}
        />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Owner intake is not available in this public test',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The current public test supports browsing the store catalog only. Owner applications and partner claims are not available.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse stores' })).toHaveAttribute('href', '/stores')
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /apply|claim|submit application/i }),
    ).not.toBeInTheDocument()
  })

  it('uses server-owned availability for the normal owner search branch', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/for-stores']}>
        <App
          clients={{
            catalog: demoCatalogClient,
            ownerIntakeAvailability: {
              getAvailability: async () => ({
                routeVisible: true,
                intakeAvailable: true,
                claimsAvailable: true,
              }),
            },
          }}
        />
      </MemoryRouter>,
    )

    await user.click((await screen.findAllByRole('button', { name: 'Add or claim my store' }))[0])
    await user.type(screen.getByLabelText('Public store name'), 'Blue')
    await user.click(screen.getByRole('button', { name: 'Search stores' }))

    expect(
      await screen.findByRole('link', { name: /claim blue finch curios/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my store is missing/i })).toBeInTheDocument()
  })

  it('uses the injected auth provider on the sign-in route', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => ({ kind: 'error' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/sign-in']}>
        <App
          runtime={{
            authProvider: {
              oauthProviders: { google: false, facebook: false },
              signIn,
              sendRecovery: vi.fn(),
              verifyMfa: vi.fn(),
              signOut: vi.fn(),
            },
          }}
        />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/email/i), 'shopper@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret-password')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(signIn).toHaveBeenCalledWith('shopper@example.com', 'secret-password')
  })

  it('wires authenticated sign-out to the trip offline purge runtime', async () => {
    const user = userEvent.setup()
    const authStore = new InMemoryAuthStore()
    const session: AuthSession = {
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    }
    authStore.setSession(session)
    const offline: TripOfflineRuntime = {
      installId: 'test-install',
      deviceKeyId: 'test-device-key',
      start: vi.fn(),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: true, pendingCount: 1 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App runtime={{ authStore, tripOffline: offline }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /your account/i })).toHaveFocus()
    const controls = screen.getByRole('navigation', { name: /account controls/i })
    expect(controls).toHaveTextContent(
      'Privacy choicesExport my dataDelete my accountPrivate history',
    )
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(offline.prepareSignOut).toHaveBeenCalledWith('shopper-a')
    expect(screen.getByRole('alert')).toHaveTextContent(/offline change.*permanently lost/i)
    expect(offline.purgeAccount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /sign out and discard/i }))
    expect(offline.purgeAccount).toHaveBeenCalledWith('shopper-a', 'confirmed_logout')
  })

  it('shows the canonical account identity and routes deliberate account switching', async () => {
    const user = userEvent.setup()
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      email: 'shopper-a@example.test',
      emailVerified: true,
      provider: 'google',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
      mfaEnrolled: true,
    })
    const offline: TripOfflineRuntime = {
      installId: 'test-install',
      deviceKeyId: 'test-device-key',
      start: vi.fn(),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: false, pendingCount: 0 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App runtime={{ authStore, tripOffline: offline }} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/shopper-a@example\.test/)).toBeInTheDocument()
    expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /use a different account/i }))

    expect(offline.prepareSignOut).toHaveBeenCalledWith('shopper-a')
    expect(
      await screen.findByRole('heading', { name: /use a different account/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Signed out securely. No private data remains visible.'),
    ).toBeInTheDocument()
    expect(offline.purgeAccount).toHaveBeenCalledWith('shopper-a', 'confirmed_logout')
  })

  it('keeps the current account and offline work when switching is cancelled', async () => {
    const user = userEvent.setup()
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      email: 'shopper-a@example.test',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    const offline: TripOfflineRuntime = {
      installId: 'test-install',
      deviceKeyId: 'test-device-key',
      start: vi.fn(),
      recover: vi.fn(async () => ({ state: 'absent' as const })),
      prepareSignOut: vi.fn(async () => ({ requiresConfirmation: true, pendingCount: 2 })),
      purgeAccount: vi.fn(async () => undefined),
    }
    render(
      <MemoryRouter initialEntries={['/account']}>
        <App runtime={{ authStore, tripOffline: offline }} />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /use a different account/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/2 offline changes/i)
    await user.click(screen.getByRole('button', { name: /keep working/i }))
    expect(screen.getByText(/shopper-a@example\.test/)).toBeInTheDocument()
    expect(offline.purgeAccount).not.toHaveBeenCalled()
  })

  it('exposes Check My Day as a provider-blocked authenticated route until R-01', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })
    render(
      <MemoryRouter initialEntries={['/trips/trip-1/check-my-day']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /check my day/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/not available yet/i)
  })

  describe('configured-local shopper trip entry', () => {
    afterEach(() => {
      cleanup()
      vi.unstubAllEnvs()
    })

    it('shows the existing Details chooser only when local trip entry is admitted', async () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      const admitted = render(
        <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
          <App
            clients={{ catalog: demoCatalogClient }}
            runtime={{ configuredLocalShopperReview: true }}
          />
        </MemoryRouter>,
      )
      const addToTrip = await screen.findByRole('link', { name: /^Add to Trip$/ })
      expect(addToTrip).toHaveAttribute(
        'href',
        '/trips/new?addStoreId=00000000-0000-4000-8000-000000000001',
      )
      admitted.unmount()

      render(
        <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
          <App clients={{ catalog: demoCatalogClient }} />
        </MemoryRouter>,
      )
      await screen.findByRole('heading', { name: 'Blue Finch Curios' })
      expect(screen.queryByRole('link', { name: /^Add to Trip$/ })).toBeNull()
    })

    it('routes the admitted Details chooser through the session guard', async () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'false')
      const user = userEvent.setup()
      function CurrentLocation() {
        const location = useLocation()
        return (
          <output data-testid="current-location">
            {`${location.pathname}${location.search}`}
          </output>
        )
      }
      render(
        <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
          <CurrentLocation />
          <App
            clients={{ catalog: demoCatalogClient }}
            runtime={{ configuredLocalShopperReview: true }}
          />
        </MemoryRouter>,
      )

      const addToTrip = await screen.findByRole('link', { name: /^Add to Trip$/ })
      const tripPath = '/trips/new?addStoreId=00000000-0000-4000-8000-000000000001'
      expect(addToTrip).toHaveAttribute('href', tripPath)
      await user.click(addToTrip)
      await waitFor(() =>
        expect(screen.getByTestId('current-location')).toHaveTextContent(
          `/auth/sign-in?returnTo=${encodeURIComponent(tripPath)}`,
        ),
      )
    })

    it('keeps the Details chooser hidden in catalog-only public mode', async () => {
      vi.stubEnv('VITE_PUBLIC_TEST_CATALOG_ONLY', 'true')
      render(
        <MemoryRouter initialEntries={['/stores/blue-finch-curios']}>
          <App
            clients={{ catalog: demoCatalogClient }}
            runtime={{ configuredLocalShopperReview: true }}
          />
        </MemoryRouter>,
      )
      await screen.findByRole('heading', { name: 'Blue Finch Curios' })
      expect(screen.queryByRole('link', { name: /^Add to Trip$/ })).toBeNull()
    })
  })
})
