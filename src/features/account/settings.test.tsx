import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, InMemoryAuthStore, type AuthSession } from '../auth'
import { createAccountSettingsClient, type AccountSettingsClient } from './settings'
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

function renderPage(client: AccountSettingsClient) {
  const store = new InMemoryAuthStore()
  store.setSession({ ...session, expiresAt: Date.now() + 60_000 })
  return render(
    <MemoryRouter initialEntries={['/account/settings']}>
      <AuthProvider authStore={store}>
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
      })),
      updateSettings: vi.fn(),
    }

    renderPage(client)

    expect(await screen.findByDisplayValue('Avery Shopper')).toBeInTheDocument()
    expect(screen.getByDisplayValue('123 Main Street, Topeka, KS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /saved stores/i })).toHaveAttribute('href', '/saved')
    expect(screen.getByText(/stored privately/i)).toBeInTheDocument()
  })

  it('saves the edited name and starting address', async () => {
    const user = userEvent.setup()
    const client: AccountSettingsClient = {
      getSettings: vi.fn(async () => ({ displayName: 'Loaded Name', locationAddress: null })),
      updateSettings: vi.fn(async (input) => input),
    }

    renderPage(client)
    await screen.findByDisplayValue('Loaded Name')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save settings/i })).toBeEnabled(),
    )
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Avery' } })
    fireEvent.change(screen.getByLabelText(/starting address/i), {
      target: { value: '123 Main Street, Topeka, KS' },
    })
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(client.updateSettings).toHaveBeenCalledWith({
      displayName: 'Avery',
      locationAddress: '123 Main Street, Topeka, KS',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i)
  })
})

describe('createAccountSettingsClient', () => {
  it('uses the private account RPCs with the expected wire shape', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'account_get_settings'
          ? { displayName: 'Avery', locationAddress: null }
          : { displayName: 'Avery', locationAddress: '123 Main Street' },
      error: null,
    }))
    const client = createAccountSettingsClient({ rpc })

    await expect(client.getSettings()).resolves.toEqual({
      displayName: 'Avery',
      locationAddress: null,
    })
    await expect(
      client.updateSettings({ displayName: 'Avery', locationAddress: '123 Main Street' }),
    ).resolves.toEqual({ displayName: 'Avery', locationAddress: '123 Main Street' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'account_get_settings', {})
    expect(rpc).toHaveBeenNthCalledWith(2, 'account_update_settings', {
      p_display_name: 'Avery',
      p_location_address: '123 Main Street',
    })
  })
})
