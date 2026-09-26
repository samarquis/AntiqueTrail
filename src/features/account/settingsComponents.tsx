import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type AuthProviderAdapter } from '../auth'
import {
  GENERIC_ACCOUNT_SETTINGS_ERROR,
  type AccountSettingsClient,
  type UserSettings,
} from './settings'

const MAX_DISPLAY_NAME_LENGTH = 80
const MAX_LOCATION_ADDRESS_LENGTH = 320

export function UserSettingsPage({
  client,
  provider,
}: {
  client: AccountSettingsClient
  provider?: AuthProviderAdapter
}) {
  const { session, updateDisplayName } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({
    displayName: session?.displayName ?? null,
    locationAddress: null,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void client
      .getSettings()
      .then((next) => {
        if (!cancelled) {
          setSettings({
            displayName: next.displayName ?? session?.displayName ?? null,
            locationAddress: next.locationAddress,
          })
          setError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setError(GENERIC_ACCOUNT_SETTINGS_ERROR)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, session?.displayName])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const next = await client.updateSettings({
        displayName: settings.displayName?.trim() || null,
        locationAddress: settings.locationAddress?.trim() || null,
      })
      await provider?.updateDisplayName?.(next.displayName)
      setSettings(next)
      updateDisplayName(next.displayName)
      setSaved(true)
    } catch {
      setError(GENERIC_ACCOUNT_SETTINGS_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <section className="page-card account-settings" aria-labelledby="account-settings-heading">
        <p className="eyebrow">Your account</p>
        <h1 id="account-settings-heading">User settings</h1>
        <p>
          Keep your identity and trip preferences current. These settings stay private to your
          account.
        </p>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={(event) => void save(event)}>
          <label htmlFor="account-display-name">Display name</label>
          <input
            id="account-display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            value={settings.displayName ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, displayName: event.target.value }))
            }
            disabled={loading || saving}
          />
          <p className="form-help">Shown in your greeting. It does not control account access.</p>

          <label htmlFor="account-location-address">Starting address for location services</label>
          <textarea
            id="account-location-address"
            name="locationAddress"
            autoComplete="street-address"
            maxLength={MAX_LOCATION_ADDRESS_LENGTH}
            rows={3}
            value={settings.locationAddress ?? ''}
            onChange={(event) =>
              setSettings((current) => ({ ...current, locationAddress: event.target.value }))
            }
            disabled={loading || saving}
            aria-describedby="account-location-help"
          />
          <p id="account-location-help" className="form-help">
            Optional and stored privately. We use it only when you explicitly choose it as a
            starting point for trip planning; it is not shared with stores.
          </p>

          <button className="button" type="submit" disabled={loading || saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <p role="status">Settings saved.</p>}
        </form>
        <nav className="account-menu" aria-label="Account destinations">
          <Link to="/saved">Saved stores</Link>
          <Link to="/account">Account overview</Link>
        </nav>
      </section>
    </main>
  )
}
