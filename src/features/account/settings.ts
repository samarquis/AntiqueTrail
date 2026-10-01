export interface UserSettings {
  displayName: string | null
  locationAddress: string | null
}

export interface AccountSettingsClient {
  getSettings(): Promise<UserSettings>
  updateSettings(input: UserSettings): Promise<UserSettings>
}

export interface AccountSettingsRpcTransport {
  rpc(
    name: 'account_get_settings' | 'account_update_settings',
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>
}

export const GENERIC_ACCOUNT_SETTINGS_ERROR =
  "We couldn't update your account settings. Please try again."

function parseSettings(value: unknown): UserSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const displayName = typeof record.displayName === 'string' ? record.displayName : null
  const locationAddress = typeof record.locationAddress === 'string' ? record.locationAddress : null
  return { displayName, locationAddress }
}

export function createAccountSettingsClient(
  transport: AccountSettingsRpcTransport,
): AccountSettingsClient {
  async function call(
    name: 'account_get_settings' | 'account_update_settings',
    args: Readonly<Record<string, unknown>>,
  ): Promise<UserSettings> {
    const result = await transport.rpc(name, args)
    if (result.error) throw result.error
    return parseSettings(result.data)
  }

  return {
    getSettings: () => call('account_get_settings', {}),
    updateSettings: (input) =>
      call('account_update_settings', {
        p_display_name: input.displayName,
        p_location_address: input.locationAddress,
      }),
  }
}

export const unavailableAccountSettingsClient: AccountSettingsClient = {
  async getSettings() {
    throw new Error(GENERIC_ACCOUNT_SETTINGS_ERROR)
  },
  async updateSettings() {
    throw new Error(GENERIC_ACCOUNT_SETTINGS_ERROR)
  },
}
