import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { GENERIC_SHOPPER_ERROR, unavailableShopperClient } from './shopperClient'
import type {
  CorrectionDraft,
  CorrectionStatus,
  PrivateActionState,
  PrivateStoreMemory,
  SavedStore,
  ShopperPrivateClient,
} from './types'

function ShopperCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="shopper-heading">
        <p className="eyebrow">Private shopper tools</p>
        <h1 id="shopper-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function GenericError() {
  return <p role="alert">{GENERIC_SHOPPER_ERROR}</p>
}

// Correction text is safe to retain only in this in-memory tab while JIT auth completes.
const correctionDraftCache = new Map<string, CorrectionDraft>()

export function SavedPage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const [stores, setStores] = useState<SavedStore[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .listSaved()
      .then((result) => {
        if (!cancelled) setStores(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  if (error)
    return (
      <ShopperCard
        title="Saved stores unavailable"
        description="Your private saved stores are temporarily unavailable."
      >
        <GenericError />
      </ShopperCard>
    )
  if (!stores)
    return (
      <ShopperCard title="Saved stores" description="Only you can see stores you save.">
        <p role="status">Loading…</p>
      </ShopperCard>
    )
  return (
    <ShopperCard title="Saved stores" description="Only you can see stores you save.">
      {stores.length ? (
        <ul aria-label="Saved stores">
          {stores.map((store) => (
            <li key={store.storeId}>
              <Link to={`/stores/${encodeURIComponent(store.slug)}`}>{store.name}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">You have no saved stores yet.</p>
      )}
    </ShopperCard>
  )
}

export function HistoryPage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const [memories, setMemories] = useState<PrivateStoreMemory[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .listSaved()
      .then(async (stores) => Promise.all(stores.map((store) => client.getMemory(store.storeId))))
      .then((result) => {
        if (!cancelled)
          setMemories(result.filter((item): item is PrivateStoreMemory => item !== null))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])
  return (
    <ShopperCard
      title="Your private history"
      description="Ratings, notes, and visit memories belong only to your account."
    >
      {error ? (
        <GenericError />
      ) : memories === null ? (
        <p role="status">Loading…</p>
      ) : memories.length ? (
        <ul aria-label="Private store memories">
          {memories.map((memory) => (
            <li key={memory.storeId}>
              {memory.rating ? `${memory.rating}/5` : 'No rating'}
              {memory.note ? ` — ${memory.note}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">No private memories yet.</p>
      )}
    </ShopperCard>
  )
}

export function MemoryPage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const { slug = '' } = useParams()
  const [memory, setMemory] = useState<PrivateStoreMemory>({
    storeId: slug,
    rating: null,
    note: null,
    lastVisitMonth: null,
    version: 0,
  })
  const [state, setState] = useState<PrivateActionState>('loading')
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getMemory(slug)
      .then((result) => {
        if (!cancelled && result) setMemory(result)
        if (!cancelled) setState('updated')
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setState('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, slug])
  async function save(event: FormEvent) {
    event.preventDefault()
    setState('loading')
    setError(false)
    try {
      const result = await client.upsertMemory(memory)
      setMemory(result)
      setState('saved')
    } catch {
      setError(true)
      setState('error')
    }
  }
  async function remove() {
    setState('delete-pending')
    try {
      await client.deleteMemory(slug)
      setState('deleted')
    } catch {
      setError(true)
      setState('error')
    }
  }
  if (error && state === 'loading')
    return (
      <ShopperCard
        title="Private memory unavailable"
        description="We could not load your private store memory."
      >
        <GenericError />
      </ShopperCard>
    )
  return (
    <ShopperCard
      title="Private store memory"
      description="Your rating, note, and visit month are visible only to you."
    >
      {state === 'deleted' ? (
        <p role="status">Private memory deleted.</p>
      ) : (
        <form onSubmit={save}>
          <label htmlFor="memory-rating">Rating</label>
          <select
            id="memory-rating"
            value={memory.rating ?? ''}
            onChange={(event) =>
              setMemory({
                ...memory,
                rating: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating} / 5
              </option>
            ))}
          </select>
          <label htmlFor="memory-note">Private note</label>
          <textarea
            id="memory-note"
            maxLength={2000}
            value={memory.note ?? ''}
            onChange={(event) => setMemory({ ...memory, note: event.target.value || null })}
          />
          <label htmlFor="memory-month">Visit month</label>
          <input
            id="memory-month"
            type="month"
            value={memory.lastVisitMonth ?? ''}
            onChange={(event) =>
              setMemory({ ...memory, lastVisitMonth: event.target.value || null })
            }
          />
          {error && <GenericError />}
          <button className="button" type="submit" disabled={state === 'loading'}>
            {state === 'loading' ? 'Saving…' : 'Save private memory'}
          </button>
          <button type="button" onClick={() => void remove()} disabled={state === 'delete-pending'}>
            {state === 'delete-pending' ? 'Deleting…' : 'Delete memory'}
          </button>
          {state === 'saved' && <p role="status">Private memory saved.</p>}
        </form>
      )}
    </ShopperCard>
  )
}

export function CorrectionPage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const location = useLocation()
  const [draft, setDraft] = useState<CorrectionDraft>(
    () =>
      correctionDraftCache.get(slug) ?? {
        storeId: slug,
        type: 'hours',
        description: '',
      },
  )
  const [result, setResult] = useState<CorrectionStatus | null>(null)
  const [error, setError] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!session) {
      correctionDraftCache.set(slug, draft)
      setError(true)
      return
    }
    setError(false)
    try {
      setResult(await client.submitCorrection(draft))
      correctionDraftCache.delete(slug)
    } catch {
      setError(true)
    }
  }
  return (
    <ShopperCard
      title="Suggest a correction"
      description="Draft anonymously, then sign in to submit. We show only your own reason-neutral status."
    >
      {result ? (
        <p role="status">Correction submitted. Status: {result.state}.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="correction-type">What needs correction?</label>
          <select
            id="correction-type"
            value={draft.type}
            onChange={(event) =>
              setDraft({ ...draft, type: event.target.value as CorrectionDraft['type'] })
            }
          >
            <option value="identity">Store identity</option>
            <option value="hours">Hours</option>
            <option value="contact">Contact</option>
            <option value="categories">Categories</option>
            <option value="other">Other</option>
          </select>
          <label htmlFor="correction-description">Description</label>
          <textarea
            id="correction-description"
            required
            maxLength={2000}
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          {error && (
            <p role="alert">
              {session
                ? GENERIC_SHOPPER_ERROR
                : 'Sign in to submit this correction. Your draft stays on this device.'}
            </p>
          )}
          {!session && (
            <p>
              <Link
                to={`/auth/sign-in?returnTo=${encodeURIComponent(location.pathname)}`}
                state={{ correctionDraft: draft }}
              >
                Sign in to submit this correction
              </Link>
            </p>
          )}
          <button className="button" type="submit">
            Submit correction
          </button>
        </form>
      )}
    </ShopperCard>
  )
}

export function CorrectionStatusPage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const { correctionId = '' } = useParams()
  const [status, setStatus] = useState<CorrectionStatus | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    client
      .getCorrection(correctionId)
      .then((result) => {
        if (!cancelled) setStatus(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, correctionId])
  return (
    <ShopperCard
      title="Correction status"
      description="Only your own reason-neutral status is shown."
    >
      {error ? (
        <GenericError />
      ) : status ? (
        <p role="status">Correction status: {status.state}.</p>
      ) : (
        <p role="status">Loading…</p>
      )}
    </ShopperCard>
  )
}
