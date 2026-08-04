import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { GENERIC_SHOPPER_ERROR, unavailableShopperClient } from './shopperClient'
import type {
  CatalogAreaChoice,
  CorrectionDraft,
  CorrectionStatus,
  NewSinceResult,
  PrivateDeleteReceipt,
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

export function SaveStoreAction({
  storeId,
  initialSaved = false,
  client = unavailableShopperClient,
}: {
  storeId: string
  initialSaved?: boolean
  client?: ShopperPrivateClient
}) {
  const [saved, setSaved] = useState(initialSaved)
  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'save-undone' | 'removed' | 'remove-undone' | 'error'
  >('idle')

  async function toggle() {
    const wasSaved = saved
    setState('saving')
    try {
      const result = await client.toggleSave(storeId)
      setSaved(result.saved)
      if (wasSaved && !result.saved) {
        setState(state === 'saved' ? 'save-undone' : 'removed')
      } else if (!wasSaved && result.saved) {
        setState(state === 'removed' ? 'remove-undone' : 'saved')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <section aria-label="Private save action">
      <button className="button" type="button" disabled={state === 'saving'} onClick={toggle}>
        {state === 'saving'
          ? 'Saving…'
          : state === 'removed'
            ? 'Undo removal'
            : saved
              ? state === 'saved'
                ? 'Undo save'
                : 'Remove saved store'
              : 'Save store'}
      </button>
      {state === 'saved' && <p role="status">Store saved. Undo is available.</p>}
      {state === 'save-undone' && <p role="status">Save undone.</p>}
      {state === 'removed' && <p role="status">Store removed. Undo is available.</p>}
      {state === 'remove-undone' && <p role="status">Removal undone.</p>}
      {state === 'error' && <GenericError />}
    </section>
  )
}

// Correction text is safe to retain only in this in-memory tab while JIT auth completes.
const correctionDraftCache = new Map<string, CorrectionDraft>()
const JIT_PRIVATE_ACTION_KEY = 'antique-trail:jit-private-action:v1'

interface JitSaveIntent {
  kind: 'save-store'
  storeId: string
  returnTo: string
  expiresAt: number
}

function readJitSaveIntent(): JitSaveIntent | null {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(JIT_PRIVATE_ACTION_KEY) ?? 'null',
    ) as Partial<JitSaveIntent> | null
    if (
      parsed?.kind !== 'save-store' ||
      typeof parsed.storeId !== 'string' ||
      typeof parsed.returnTo !== 'string' ||
      !parsed.returnTo.startsWith('/') ||
      parsed.returnTo.startsWith('//') ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
      return null
    }
    return parsed as JitSaveIntent
  } catch {
    window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
    return null
  }
}

function rememberJitSaveIntent(storeId: string, returnTo: string) {
  const intent: JitSaveIntent = {
    kind: 'save-store',
    storeId,
    returnTo,
    expiresAt: Date.now() + 30 * 60_000,
  }
  window.sessionStorage.setItem(JIT_PRIVATE_ACTION_KEY, JSON.stringify(intent))
}

/** Public-catalog action group that safely resumes a Save after JIT sign-in/MFA. */
export function CatalogPrivateActions({
  storeId,
  slug,
  client = unavailableShopperClient,
}: {
  storeId: string
  slug: string
  client?: ShopperPrivateClient
}) {
  const { session } = useAuth()
  const location = useLocation()
  const [resumedSaved, setResumedSaved] = useState(false)
  const [resumeState, setResumeState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const returnTo = `${location.pathname}${location.search}`

  useEffect(() => {
    if (!session) return
    const intent = readJitSaveIntent()
    if (!intent || intent.storeId !== storeId || intent.returnTo !== returnTo) return
    window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
    let cancelled = false
    setResumeState('saving')
    client
      .toggleSave(storeId)
      .then((result) => {
        if (cancelled) return
        if (!result.saved) throw new Error('save_not_applied')
        setResumedSaved(true)
        setResumeState('saved')
      })
      .catch(() => {
        if (!cancelled) setResumeState('error')
      })
    return () => {
      cancelled = true
    }
  }, [client, returnTo, session, storeId])

  const memoryPath = `/stores/${encodeURIComponent(slug)}/memory`
  const correctionPath = `/stores/${encodeURIComponent(slug)}/correction`
  if (!session)
    return (
      <nav aria-label="Private store actions">
        <Link
          to={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          onClick={() => rememberJitSaveIntent(storeId, returnTo)}
        >
          Sign in to save store
        </Link>{' '}
        <Link to={`/auth/sign-in?returnTo=${encodeURIComponent(memoryPath)}`}>
          Sign in for private memory
        </Link>{' '}
        <Link to={correctionPath}>Suggest a correction</Link>
      </nav>
    )

  return (
    <section aria-label="Private store actions">
      <SaveStoreAction
        key={resumedSaved ? 'resumed-saved' : 'ordinary-save'}
        storeId={storeId}
        initialSaved={resumedSaved}
        client={client}
      />
      {resumeState === 'saving' && <p role="status">Finishing your saved-store action…</p>}
      {resumeState === 'saved' && <p role="status">Store saved after sign-in.</p>}
      {resumeState === 'error' && <GenericError />}
      <p>
        <Link to={memoryPath}>Private memory</Link> ·{' '}
        <Link to={correctionPath}>Suggest a correction</Link>
      </p>
    </section>
  )
}

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
              <SaveStoreAction storeId={store.storeId} initialSaved client={client} />
            </li>
          ))}
        </ul>
      ) : (
        <p role="status">You have no saved stores yet.</p>
      )}
    </ShopperCard>
  )
}

export function NewSincePage({
  client = unavailableShopperClient,
}: {
  client?: ShopperPrivateClient
}) {
  const [areas, setAreas] = useState<CatalogAreaChoice[] | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [result, setResult] = useState<NewSinceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [caughtUp, setCaughtUp] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    client
      .listCatalogAreas()
      .then((choices) => {
        if (!cancelled) setAreas(choices)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client])

  async function chooseArea(areaId: string) {
    setSelectedAreaId(areaId)
    setResult(null)
    setCaughtUp(false)
    setError(false)
    if (!areaId) return
    setLoading(true)
    try {
      setResult(await client.getNewSince(areaId))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function dismiss(storeId: string) {
    try {
      await client.dismissNewStore(storeId)
      setResult((current) =>
        current
          ? { ...current, stores: current.stores.filter((store) => store.storeId !== storeId) }
          : current,
      )
    } catch {
      setError(true)
    }
  }

  async function markSeen() {
    if (!result) return
    try {
      await client.markCatalogSeen(result.area.id)
      setCaughtUp(true)
    } catch {
      setError(true)
    }
  }

  return (
    <ShopperCard
      title="New since your last visit"
      description="Choose an area yourself. Antique Trail does not use background location or send notifications."
    >
      <label htmlFor="new-since-area">Choose an area</label>
      <select
        id="new-since-area"
        value={selectedAreaId}
        disabled={areas === null}
        onChange={(event) => void chooseArea(event.target.value)}
      >
        <option value="">Select an area</option>
        {areas?.map((area) => (
          <option key={area.id} value={area.id}>
            {area.label}
          </option>
        ))}
      </select>
      {areas === null && !error && <p role="status">Loading areas…</p>}
      {loading && <p role="status">Checking for new stores…</p>}
      {error && <GenericError />}
      {result && !caughtUp && (
        <>
          <p>
            {result.lastSeenAt
              ? `Showing stores added after your last visit to ${result.area.label}.`
              : `Showing recently added stores in ${result.area.label}.`}
          </p>
          {result.stores.length ? (
            <ul aria-label={`New stores in ${result.area.label}`}>
              {result.stores.map((store) => (
                <li key={store.storeId}>
                  <Link to={`/stores/${encodeURIComponent(store.slug)}`}>{store.name}</Link>{' '}
                  <button type="button" onClick={() => void dismiss(store.storeId)}>
                    Dismiss {store.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">No new stores in this area.</p>
          )}
          <button className="button" type="button" onClick={() => void markSeen()}>
            Mark {result.area.label} as seen
          </button>
        </>
      )}
      {result && caughtUp && <p role="status">You are caught up in {result.area.label}.</p>}
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
  const [deleteReceipt, setDeleteReceipt] = useState<PrivateDeleteReceipt | null>(null)
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
      setDeleteReceipt(await client.deleteMemory(slug))
      setState('deleted')
    } catch {
      setError(true)
      setState('error')
    }
  }
  async function undoRemove() {
    if (!deleteReceipt) return
    setState('loading')
    setError(false)
    try {
      setMemory(await client.undoDeleteMemory(slug, deleteReceipt.undoToken))
      setDeleteReceipt(null)
      setState('undone')
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
        <div>
          <p role="status">Private memory deleted.</p>
          <button className="button" type="button" onClick={() => void undoRemove()}>
            Undo memory deletion
          </button>
        </div>
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
          {state === 'undone' && <p role="status">Private memory restored.</p>}
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
