import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryAuthStore, type AuthSession } from '../features/auth'
import type { TripOfflineRuntime } from '../features/trips'
import App from './App'

describe('app shell', () => {
  afterEach(cleanup)
  it('renders the browse route with a skip-free accessible heading', () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /browse stores/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
  })

  it('wires private shopper actions into public catalog results', async () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findAllByRole('link', { name: /sign in to save store/i })).not.toHaveLength(
      0,
    )
    expect(screen.getAllByRole('link', { name: /sign in for private memory/i })).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /suggest a correction/i })).not.toHaveLength(0)
  })

  it('fails the unavailable admin boundary closed without a role bypass', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /review queue/i })).not.toBeInTheDocument()
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
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
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
    expect(screen.getByRole('heading', { name: /store portal/i })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update this store portal/i)
  })

  it('keeps External Testing Readiness unavailable until the human gates exist', async () => {
    render(
      <MemoryRouter initialEntries={['/external/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /external testing readiness/i }),
    ).not.toBeInTheDocument()
  })

  it('keeps public review entry unavailable before regional promotion', async () => {
    render(
      <MemoryRouter initialEntries={['/stores/oak-antiques/reviews']}>
        <App />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/not available in this release/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview review/i })).not.toBeInTheDocument()
  })

  it('returns not-found for the disabled public listing claim route', () => {
    render(
      <MemoryRouter initialEntries={['/partner/claim']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /claim a listing/i })).not.toBeInTheDocument()
  })

  it('uses the injected auth provider on the sign-in route', async () => {
    const user = userEvent.setup()
    const signIn = vi.fn(async () => ({ kind: 'error' as const }))
    render(
      <MemoryRouter initialEntries={['/auth/sign-in']}>
        <App
          runtime={{
            authProvider: {
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
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(offline.prepareSignOut).toHaveBeenCalledWith('shopper-a')
    expect(screen.getByRole('alert')).toHaveTextContent(/offline change.*permanently lost/i)
    expect(offline.purgeAccount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /sign out and discard/i }))
    expect(offline.purgeAccount).toHaveBeenCalledWith('shopper-a', 'confirmed_logout')
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
})
