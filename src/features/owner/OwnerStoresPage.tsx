import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OwnerTeamPanel } from './OwnerTeamPanel'
import {
  OWNER_ACCESS_ERROR,
  ownerTeamRoleLabel,
  type OwnerClient,
  type OwnerStore,
} from './ownerClient'

export function OwnerStoresPage({ client }: { client: OwnerClient }) {
  const navigate = useNavigate()
  const [stores, setStores] = useState<OwnerStore[] | null>(null)
  const [pending, setPending] = useState(true)
  const [denied, setDenied] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    const requests = generation
    const request = ++generation.current
    setPending(true)
    setStores(null)
    setDenied(false)
    client.listStores().then(
      (next) => {
        if (request === generation.current) {
          setStores(next)
          setPending(false)
        }
      },
      () => {
        if (request === generation.current) {
          setDenied(true)
          setPending(false)
        }
      },
    )
    return () => {
      requests.current++
    }
  }, [client, attempt])
  async function select(storeId: string) {
    const request = ++generation.current
    setPending(true)
    try {
      await client.selectStore(storeId)
      if (request === generation.current) navigate('/store-portal')
    } catch {
      if (request === generation.current) {
        setStores(null)
        setDenied(true)
        setPending(false)
      }
    }
  }
  return (
    <main>
      <section className="page-card" aria-labelledby="owner-stores-heading">
        <h1 id="owner-stores-heading">Your store workspace</h1>
        <p>Choose a store you can access. Each workspace role applies to one store.</p>
        {pending && <p role="status">Checking store access…</p>}
        {denied && (
          <>
            <p role="alert">{OWNER_ACCESS_ERROR} Sign in with MFA, then check access again.</p>
            <button className="button" onClick={() => setAttempt((value) => value + 1)}>
              Check access again
            </button>
          </>
        )}
        {stores && (
          <ul>
            {stores.map((store) => (
              <li key={store.storeId}>
                <h2>{store.name}</h2>
                <p>{ownerTeamRoleLabel[store.role]}</p>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => void select(store.storeId)}
                >
                  Open {store.name}
                </button>
                <OwnerTeamPanel store={store} client={client} />
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/account">Back to your account</Link>
        </p>
      </section>
    </main>
  )
}
