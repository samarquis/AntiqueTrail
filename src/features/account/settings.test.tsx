import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import {
  AuthProvider,
  InMemoryAuthStore,
  type AuthProviderAdapter,
  type AuthSession,
} from '../auth'
import {
  createAccountSettingsClient,
  GENERIC_ACCOUNT_SETTINGS_ERROR,
  AccountSettingsConflict,
  type AccountSettingsClient,
  type UserSettings,
} from './settings'
import { UserSettingsPage } from './settingsComponents'

const session: AuthSession = {
  userId: 'user-1',
  displayName: 'Avery Shopper',
  email: 'avery@example.com',
  accessToken: 'test-token',
  expiresAt: 0,
  role: 'Shopper',
  mfaRequired: false,
  mfaVerified: true,
}

function renderPage(client: AccountSettingsClient, provider?: AuthProviderAdapter) {
  const store = new InMemoryAuthStore()
  store.setSession({ ...session, expiresAt: Date.now() + 60_000 })
  return render(
    <MemoryRouter initialEntries={['/account/settings']}>
      <AuthProvider authStore={store} provider={provider}>
        <UserSettingsPage client={client} />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('UserSettingsPage', () => {
  afterEach(cleanup)

  it('loads private settings and links to saved stores', async () => {
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({
        displayName: 'Avery Shopper',
        locationAddress: '123 Main Street, Topeka, KS',
        version: 1,
      })),
      updateSettings: vi.fn(),
    }

    renderPage(client)

    expect(await screen.findByDisplayValue('Avery Shopper')).toBeInTheDocument()
    expect(screen.getByText('123 Main Street, Topeka, KS')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /address/i })).not.toBeInTheDocument()
    expect(
      screen.queryByText(/trip preferences|trip planning|starting point/i),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /saved stores/i })).toHaveAttribute('href', '/saved')
    expect(screen.getByText(/stored privately/i)).toHaveClass('privacy-consequence')
  })

  it('explains why settings controls are disabled during the initial load', () => {
    const client: AccountSettingsClient = {
      getSettings: vi.fn(() => new Promise<UserSettings>(() => undefined)),
      updateSettings: vi.fn(),
    }

    renderPage(client)

    const loadingStatus = screen.getByRole('status', { name: /loading account settings/i })
    expect(loadingStatus).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save settings/i })).toHaveAttribute(
      'aria-describedby',
      loadingStatus.id,
    )
  })
  it('keeps saving disabled after a failed read and retries before editing', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({
        displayName: 'Saved Name',
        locationAddress: 'Saved Address',
        version: 1,
      }),
      updateSettings: vi.fn(),
    }
    renderPage(client)
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('button', { name: 'Save settings' }).closest('form')!)
    expect(client.updateSettings).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry loading settings' }))
    await screen.findByText('Saved Address')
    expect(screen.getByLabelText('Display name')).toHaveValue('Saved Name')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
  })

  it('saves the edited name while preserving an existing private address', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({
        displayName: 'Loaded Name',
        locationAddress: '123 Main Street, Topeka, KS',
        version: 1,
      })),
      updateSettings: vi.fn(async (input) => input),
    }

    renderPage(client)
    await screen.findByDisplayValue('Loaded Name')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled(),
    )
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Avery' } })
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(client.updateSettings).toHaveBeenCalledWith({
      displayName: 'Avery',
      locationAddress: '123 Main Street, Topeka, KS',
      version: 1,
      idempotencyKey: expect.any(String),
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })

  it('does not change provider identity when the settings write fails', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({
        displayName: 'Loaded Name',
        locationAddress: null,
        version: 1,
      })),
      updateSettings: vi.fn(async () => {
        throw new Error('settings unavailable')
      }),
    }
    const provider: AuthProviderAdapter = {
      oauthProviders: { google: false, facebook: false },
      signIn: vi.fn(async () => ({ kind: 'error' as const })),
      sendRecovery: vi.fn(async () => undefined),
      verifyMfa: vi.fn(async () => null),
      signOut: vi.fn(async () => undefined),
      updateDisplayName: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('rollback unavailable')),
    }

    renderPage(client, provider)
    await screen.findByDisplayValue('Loaded Name')
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Avery' } })
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ACCOUNT_SETTINGS_ERROR)
    expect(client.updateSettings).toHaveBeenCalled()
    expect(provider.updateDisplayName).not.toHaveBeenCalled()
  })
  it('reuses the attempt key after an ambiguous failure and requires reload on conflict', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({
        displayName: 'Loaded Name',
        locationAddress: 'Saved Address',
        version: 3,
      })),
      updateSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('response lost'))
        .mockRejectedValueOnce(new AccountSettingsConflict(4)),
    }
    renderPage(client)
    await screen.findByDisplayValue('Loaded Name')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed.*reload/i)
    const calls = vi.mocked(client.updateSettings).mock.calls
    expect(calls[0][0].idempotencyKey).toMatch(/^[a-f0-9-]{36}$/)
    expect(calls[1][0]).toEqual(calls[0][0])
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry loading settings' })).toBeVisible()
    expect(screen.getByText('Saved Address')).toBeInTheDocument()
  })

  it('offers no address entry or clearing when no address is saved', async () => {
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({ displayName: 'Avery', locationAddress: null, version: 1 })),
      updateSettings: vi.fn(),
    }
    renderPage(client)
    await screen.findByDisplayValue('Avery')
    expect(screen.queryByRole('textbox', { name: /address/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /clear saved address/i })).not.toBeInTheDocument()
  })

  it('retains the saved address after a failed clear and clears it on a successful retry', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({
        displayName: 'Avery',
        locationAddress: 'Saved Address',
        version: 2,
      })),
      updateSettings: vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({
        displayName: 'Avery',
        locationAddress: null,
        version: 3,
      }),
    }
    renderPage(client)
    await screen.findByText('Saved Address')
    await user.click(screen.getByRole('checkbox', { name: /clear saved address/i }))
    expect(client.updateSettings).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByRole('alert')
    expect(screen.getByText('Saved Address')).toBeInTheDocument()
    expect(client.updateSettings).toHaveBeenCalledWith({
      displayName: 'Avery',
      locationAddress: null,
      version: 2,
      idempotencyKey: expect.any(String),
    })
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings saved.')
    expect(screen.queryByText('Saved Address')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /clear saved address/i })).not.toBeInTheDocument()
    expect(vi.mocked(client.updateSettings).mock.calls[1][0]).toEqual(
      vi.mocked(client.updateSettings).mock.calls[0][0],
    )
  })
})

describe('createAccountSettingsClient', () => {
  it('uses the private account RPCs with the expected wire shape', async () => {
    let saved = false
    const rpc = vi.fn(async (name: string) => {
      if (name === 'account_update_settings') saved = true
      return {
        data:
          name === 'account_update_settings'
            ? { state: 'saved', version: 4 }
            : !saved
              ? { displayName: 'Avery', locationAddress: null, version: 3 }
              : { displayName: 'Avery', locationAddress: '123 Main Street', version: 4 },
        error: null,
      }
    })
    const client = createAccountSettingsClient({ rpc })

    await expect(client.getSettings()).resolves.toEqual({
      displayName: 'Avery',
      locationAddress: null,
      version: 3,
    })
    await expect(
      client.updateSettings({
        displayName: 'Avery',
        locationAddress: '123 Main Street',
        version: 3,
        idempotencyKey: 'attempt-1',
      }),
    ).resolves.toEqual({ displayName: 'Avery', locationAddress: '123 Main Street', version: 4 })
    expect(rpc).toHaveBeenNthCalledWith(1, 'account_get_settings', {})
    expect(rpc).toHaveBeenNthCalledWith(2, 'account_update_settings', {
      p_display_name: 'Avery',
      p_location_address: '123 Main Street',
      p_expected_version: 3,
      p_idempotency_key: 'attempt-1',
    })
    expect(rpc).toHaveBeenNthCalledWith(3, 'account_get_settings', {})
  })
  it('rejects a read with no authoritative version', async () => {
    const client = createAccountSettingsClient({
      rpc: async () => ({ data: { displayName: 'Name', locationAddress: null }, error: null }),
    })
    await expect(client.getSettings()).rejects.toThrow(GENERIC_ACCOUNT_SETTINGS_ERROR)
  })
  it('rejects partial settings instead of treating an unknown address as cleared', async () => {
    const client = createAccountSettingsClient({
      rpc: async () => ({ data: { displayName: 'Name', version: 1 }, error: null }),
    })
    await expect(client.getSettings()).rejects.toThrow(GENERIC_ACCOUNT_SETTINGS_ERROR)
  })
  it.each([
    { displayName: 'Old Name', locationAddress: 'Old Address', version: 2 },
    { displayName: 'Current Name', locationAddress: null, version: 3 },
  ])(
    'reconciles a lost-response replay with current settings at version $version',
    async (current) => {
      let responseLost = true
      const client = createAccountSettingsClient({
        rpc: async (name) => {
          if (name === 'account_update_settings' && responseLost) {
            responseLost = false
            throw new Error('response lost after commit')
          }
          return {
            data: name === 'account_update_settings' ? { state: 'saved', version: 2 } : current,
            error: null,
          }
        },
      })
      const attempt = {
        displayName: 'Old Name',
        locationAddress: 'Old Address',
        version: 1,
        idempotencyKey: 'replay',
      }
      await expect(client.updateSettings(attempt)).rejects.toThrow('response lost after commit')
      await expect(client.updateSettings(attempt)).resolves.toEqual(current)
    },
  )
  it('reports a stale-write conflict instead of parsing it as empty settings', async () => {
    const client = createAccountSettingsClient({
      rpc: async () => ({ data: { state: 'conflict', latest: { version: 4 } }, error: null }),
    })
    await expect(
      client.updateSettings({
        displayName: 'Name',
        locationAddress: null,
        version: 3,
        idempotencyKey: 'attempt-1',
      }),
    ).rejects.toThrow(/changed.*reload/i)
  })
})
