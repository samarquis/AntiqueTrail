export interface UserSettings {
  displayName: string | null
  locationAddress: string | null
  version: number
}

export interface AccountSettingsClient {
  getSettings(): Promise<UserSettings>
  updateSettings(input: UserSettings & { idempotencyKey: string }): Promise<UserSettings>
}

export interface AccountSettingsRpcTransport {
  rpc(
    name: 'account_get_settings' | 'account_update_settings',
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: { message?: string } | null }>
}

export const GENERIC_ACCOUNT_SETTINGS_ERROR =
  "We couldn't update your account settings. Please try again."

export class AccountSettingsConflict extends Error {
  constructor(readonly currentVersion: number) {
    super('Your settings changed in another session. Please reload settings before saving.')
  }
}

function parseSettings(value: unknown): UserSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (record.state === 'conflict') {
    const latest = record.latest as Record<string, unknown> | undefined
    if (Number.isSafeInteger(latest?.version) && Number(latest?.version) > 0)
      throw new AccountSettingsConflict(Number(latest?.version))
  }
  if (!Number.isSafeInteger(record.version) || Number(record.version) <= 0)
    throw new Error(GENERIC_ACCOUNT_SETTINGS_ERROR)
  if (
    (record.displayName !== null && typeof record.displayName !== 'string') ||
    (record.locationAddress !== null && typeof record.locationAddress !== 'string')
  )
    throw new Error(GENERIC_ACCOUNT_SETTINGS_ERROR)
  const displayName = typeof record.displayName === 'string' ? record.displayName : null
  const locationAddress = typeof record.locationAddress === 'string' ? record.locationAddress : null
  return { displayName, locationAddress, version: Number(record.version) }
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
    async updateSettings(input) {
      await call('account_update_settings', {
        p_display_name: input.displayName,
        p_location_address: input.locationAddress,
        p_expected_version: input.version,
        p_idempotency_key: input.idempotencyKey,
      })
      // A retry receipt can precede another tab's newer write. Display current values.
      return call('account_get_settings', {})
    },
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
