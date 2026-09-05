import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export const promotionLabels = {
  flyer: 'Flyer placement',
  owner_card: 'Owner-card distribution',
  co_brand: 'Logo and co-brand use',
  social: 'One voluntary social post',
}
type Channel = keyof typeof promotionLabels
type Permission = {
  channel: Channel
  consented: boolean
  version: number
  removalRequested: boolean
}
const unavailable = 'Promotion permissions are unavailable. Please try again.'

export function createPromotionClient(
  rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>,
) {
  return {
    async list(): Promise<Permission[]> {
      const data = await rpc('promotion_channels', {})
      if (!Array.isArray(data) || data.length !== 4) throw new Error(unavailable)
      const result = data.map((value: unknown): Permission => {
        if (!value || typeof value !== 'object') throw new Error(unavailable)
        const p = Object.fromEntries(Object.entries(value))
        if (
          (p.channel !== 'flyer' &&
            p.channel !== 'owner_card' &&
            p.channel !== 'co_brand' &&
            p.channel !== 'social') ||
          typeof p.consented !== 'boolean' ||
          typeof p.removalRequested !== 'boolean' ||
          typeof p.version !== 'number' ||
          !Number.isSafeInteger(p.version) ||
          p.version < 0
        )
          throw new Error(unavailable)
        return {
          channel: p.channel,
          consented: p.consented,
          version: p.version,
          removalRequested: p.removalRequested,
        }
      })
      if (new Set(result.map((p) => p.channel)).size !== 4) throw new Error(unavailable)
      return result
    },
    async set(permission: Permission, consented: boolean) {
      const data = await rpc('promotion_channel_command', {
        p_channel: permission.channel,
        p_operation: consented ? 'consent' : 'withdraw',
        p_version: permission.version,
        p_generic_owner_card: false,
      })
      if (!data || typeof data !== 'object' || !('allowed' in data) || data.allowed !== true)
        throw new Error(unavailable)
    },
  }
}
export const unavailablePromotionClient = createPromotionClient(async () => {
  throw new Error(unavailable)
})
export type PromotionClient = ReturnType<typeof createPromotionClient>

export function PromotionPage({
  client = unavailablePromotionClient,
}: {
  client?: PromotionClient
}) {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let current = true
    setBusy(true)
    setPermissions([])
    client
      .list()
      .then((data) => {
        if (current) setPermissions(data)
      })
      .catch(() => {
        if (current) {
          setMessage(unavailable)
          setError(true)
        }
      })
      .finally(() => {
        if (current) setBusy(false)
      })
    return () => {
      current = false
    }
  }, [client])
  async function change(permission: Permission, consented: boolean) {
    setBusy(true)
    setError(false)
    setMessage('')
    try {
      await client.set(permission, consented)
      setPermissions(await client.list())
      setMessage(
        consented
          ? 'Permission saved for this channel only.'
          : 'Permission withdrawn. Stop future use and reprinting; remove remaining materials.',
      )
    } catch {
      setPermissions([])
      setError(true)
      setMessage(unavailable)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="promotion-page">
      <section className="page-card" aria-labelledby="promotion-heading">
        <p className="eyebrow">Store Portal</p>
        <h1 id="promotion-heading">Promotion permissions</h1>
        <p className="lede">Do Not Distribute. Promotion is not activated.</p>
        <p>
          Each permission is voluntary and applies only to this store and channel. It does not
          authorize another channel, payment, ranking, or endorsement.
        </p>
        <p>
          You can withdraw permission while distribution is paused. Withdrawal stops future use and
          reprinting and requests removal of remaining materials.
        </p>
        {busy && <p role="status">Loading promotion permissions…</p>}
        {message && <p role={error ? 'alert' : 'status'}>{message}</p>}
        {permissions.map((p) => (
          <section key={p.channel} aria-label={promotionLabels[p.channel]}>
            <h2>{promotionLabels[p.channel]}</h2>
            <p>{p.consented ? 'Permission recorded' : 'No current permission'}</p>
            {p.removalRequested && <p>Removal of remaining materials requested.</p>}
            <button type="button" disabled={busy} onClick={() => void change(p, !p.consented)}>
              {p.consented ? 'Withdraw permission' : 'Give permission'}:{' '}
              {promotionLabels[p.channel]}
            </button>
          </section>
        ))}
        <p>
          <Link to="/store-portal">Back to Store Portal</Link>
        </p>
      </section>
    </main>
  )
}
