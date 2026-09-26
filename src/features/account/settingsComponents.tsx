import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import {
  GENERIC_ACCOUNT_SETTINGS_ERROR,
  AccountSettingsConflict,
  type AccountSettingsClient,
  type UserSettings,
} from './settings'

const MAX_DISPLAY_NAME_LENGTH = 80
const MAX_LOCATION_ADDRESS_LENGTH = 320

export function UserSettingsPage({ client }: { client: AccountSettingsClient }) {
  const { updateDisplayName } = useAuth()
  const [settings, setSettings] = useState<UserSettings>({
    displayName: null,
    locationAddress: null,
    version: 0,
  })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const attempt = useRef<{ payload: string; key: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(false)
    void client
      .getSettings()
      .then((next) => {
        if (!cancelled) {
          setSettings(next)
          attempt.current = null
          setError(null)
          setLoaded(true)
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
  }, [client, loadAttempt])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loaded || saving) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const input = {
        displayName: settings.displayName?.trim() || null,
        locationAddress: settings.locationAddress?.trim() || null,
        version: settings.version,
      }
      const payload = JSON.stringify(input)
      if (attempt.current?.payload !== payload)
        attempt.current = { payload, key: crypto.randomUUID() }
      const next = await client.updateSettings({ ...input, idempotencyKey: attempt.current.key })
      attempt.current = null
      setSettings(next)
      updateDisplayName(next.displayName)
      setSaved(true)
    } catch (cause) {
      if (cause instanceof AccountSettingsConflict) {
        setLoaded(false)
        setError(cause.message)
      } else setError(GENERIC_ACCOUNT_SETTINGS_ERROR)
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
        {loading && (
          <p id="account-settings-loading" role="status" aria-label="Loading account settings">
            Loading settings…
          </p>
        )}
        {error && (
          <p id="account-settings-error" role="alert">
            {error}
          </p>
        )}
        {!loaded && !loading && error && (
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            Retry loading settings
          </button>
        )}
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
            disabled={!loaded || loading || saving}
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
            disabled={!loaded || loading || saving}
            aria-describedby="account-location-help"
          />
          <p id="account-location-help" className="form-help privacy-consequence">
            Optional and stored privately. We use it only when you explicitly choose it as a
            starting point for trip planning; it is not shared with stores.
          </p>

          <button
            className="button"
            type="submit"
            disabled={!loaded || loading || saving}
            aria-describedby={
              loading ? 'account-settings-loading' : !loaded ? 'account-settings-error' : undefined
            }
          >
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
