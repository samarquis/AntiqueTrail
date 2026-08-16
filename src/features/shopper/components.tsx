import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
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

function GenericError({ message = GENERIC_SHOPPER_ERROR }: { message?: string }) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => errorRef.current?.focus(), [])
  return (
    <p ref={errorRef} role="alert" tabIndex={-1}>
      {message}
    </p>
  )
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const markOnline = () => setOnline(true)
    const markOffline = () => setOnline(false)
    window.addEventListener('online', markOnline)
    window.addEventListener('offline', markOffline)
    return () => {
      window.removeEventListener('online', markOnline)
      window.removeEventListener('offline', markOffline)
    }
  }, [])
  return online
}

function OfflineNotice() {
  return (
    <p role="status">You are offline. Private changes are paused until your connection returns.</p>
  )
}

function privateDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(date)
}

function StoreRecordCard({
  name,
  slug,
  areaLabel,
  timestampLabel,
  timestamp,
  sourceLabel,
  children,
}: {
  name: string
  slug: string
  areaLabel?: string
  timestampLabel: string
  timestamp: string
  sourceLabel: string
  children: ReactNode
}) {
  return (
    <li className="shopper-store-card">
      <div
        className="shopper-store-card__placeholder"
        role="img"
        aria-label={`No store photo is included in this private ${name} record.`}
      >
        <span aria-hidden="true">AT</span>
        <small>Photo on store details</small>
      </div>
      <div className="shopper-store-card__body">
        <p className="eyebrow">{areaLabel ?? 'Your saved trail'}</p>
        <h2>
          <Link to={`/stores/${encodeURIComponent(slug)}`}>{name}</Link>
        </h2>
        <dl className="shopper-store-card__facts">
          <div>
            <dt>Area</dt>
            <dd>{areaLabel ?? 'Open store details for area'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>Open store details for categories</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>Check current hours before you go</dd>
          </div>
          <div>
            <dt>{timestampLabel}</dt>
            <dd>{privateDate(timestamp)}</dd>
          </div>
          <div>
            <dt>Record source</dt>
            <dd>{sourceLabel}</dd>
          </div>
        </dl>
        <p className="shopper-store-card__freshness">
          Listing freshness and verification are shown on store details.
        </p>
        <div className="shopper-store-card__actions">{children}</div>
      </div>
    </li>
  )
}

export function SaveStoreAction({
  storeId,
  initialSaved,
  client = unavailableShopperClient,
}: {
  storeId: string
  initialSaved?: boolean
  client?: ShopperPrivateClient
}) {
  const online = useOnlineStatus()
  const [saved, setSaved] = useState<boolean | null>(initialSaved ?? null)
  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'save-undone' | 'removed' | 'remove-undone' | 'error'
  >('idle')

  useEffect(() => {
    if (initialSaved !== undefined) return
    let cancelled = false
    client
      .getSaveState(storeId)
      .then((result) => {
        if (!cancelled) setSaved(result.saved)
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSaved, storeId])

  async function toggle() {
    if (saved === null || state === 'saving' || !online) return
    const wasSaved = saved
    const requested = !wasSaved
    setState('saving')
    try {
      const result = await client.setSave(storeId, requested)
      setSaved(result.saved)
      if (result.saved !== requested) {
        setState('error')
      } else if (wasSaved) {
        setState(state === 'saved' ? 'save-undone' : 'removed')
      } else {
        setState(state === 'removed' ? 'remove-undone' : 'saved')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <section aria-label="Private save action">
      {!online && <OfflineNotice />}
      <button
        className="button"
        type="button"
        disabled={state === 'saving' || saved === null || !online}
        onClick={toggle}
      >
        {saved === null
          ? 'Checking saved state…'
          : state === 'saving'
            ? 'Saving…'
            : !online
              ? 'Save unavailable offline'
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

// Correction text is safe to retain only in this browser tab while JIT auth completes.
const correctionDraftStorageKey = (slug: string) => `antique-trail:correction-draft:${slug}`

function readCorrectionDraft(slug: string): CorrectionDraft | null {
  try {
    const raw = window.sessionStorage.getItem(correctionDraftStorageKey(slug))
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<CorrectionDraft>
    if (
      typeof draft.storeId !== 'string' ||
      !['identity', 'contact', 'hours', 'categories', 'other'].includes(String(draft.type)) ||
      typeof draft.description !== 'string'
    )
      return null
    return {
      storeId: draft.storeId,
      type: draft.type as CorrectionDraft['type'],
      description: draft.description,
      publicSourceUrl:
        typeof draft.publicSourceUrl === 'string' ? draft.publicSourceUrl : undefined,
    }
  } catch {
    return null
  }
}

function rememberCorrectionDraft(slug: string, draft: CorrectionDraft) {
  window.sessionStorage.setItem(correctionDraftStorageKey(slug), JSON.stringify(draft))
}

function forgetCorrectionDraft(slug: string) {
  window.sessionStorage.removeItem(correctionDraftStorageKey(slug))
}
const JIT_PRIVATE_ACTION_KEY = 'antique-trail:jit-private-action:v1'

interface JitSaveIntent {
  kind: 'save-store'
  storeId: string
  returnTo: string
  expiresAt: number
  /** Present only while recovering an interrupted, already-claimed intent. */
  claimedByUserId?: string
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
      parsed.expiresAt <= Date.now() ||
      (parsed.claimedByUserId !== undefined && typeof parsed.claimedByUserId !== 'string')
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
  const resumePromiseRef = useRef<Promise<{ saved: boolean }> | null>(null)
  const returnTo = `${location.pathname}${location.search}`

  useEffect(() => {
    const intent = readJitSaveIntent()
    const inFlight = resumePromiseRef.current
    if (inFlight) {
      let cancelled = false
      inFlight
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
    }
    if (!intent || intent.storeId !== storeId || intent.returnTo !== returnTo) return
    // Returning to the exact source route without a session is the explicit
    // "Cancel and return without saving" path. Consume the intent so a later
    // sign-in cannot replay it.
    if (!session) {
      window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
      return
    }
    // A recovered/claimed intent is bound to the account that first claimed it.
    // Never replay it after an account switch.
    if (intent.claimedByUserId && intent.claimedByUserId !== session.userId) {
      window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
      return
    }
    window.sessionStorage.removeItem(JIT_PRIVATE_ACTION_KEY)
    let cancelled = false
    setResumeState('saving')
    const request = client.setSave(storeId, true)
    resumePromiseRef.current = request
    request
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
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(false)
    setStores(null)
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
  }, [client, reload])
  if (error)
    return (
      <ShopperCard
        title="Saved stores unavailable"
        description="Your private saved stores are temporarily unavailable."
      >
        <GenericError />
        <button className="button" type="button" onClick={() => setReload((value) => value + 1)}>
          Try saved stores again
        </button>
      </ShopperCard>
    )
  if (!stores)
    return (
      <ShopperCard title="Saved stores" description="Only you can see stores you save.">
        <p role="status">Loading…</p>
      </ShopperCard>
    )
  return (
    <ShopperCard
      title="Saved stores"
      description="Only this signed-in shopper can see or change these saved stores."
    >
      {stores.length ? (
        <ul className="shopper-store-list" aria-label="Saved stores">
          {stores.map((store) => (
            <StoreRecordCard
              key={store.storeId}
              name={store.name}
              slug={store.slug}
              timestampLabel="Saved"
              timestamp={store.savedAt}
              sourceLabel="Your private saved-store record"
            >
              <SaveStoreAction storeId={store.storeId} initialSaved client={client} />
            </StoreRecordCard>
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
  const online = useOnlineStatus()
  const requestSequence = useRef(0)
  const [areas, setAreas] = useState<CatalogAreaChoice[] | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [result, setResult] = useState<NewSinceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [caughtUp, setCaughtUp] = useState(false)
  const [error, setError] = useState(false)
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null)
  const [markingSeen, setMarkingSeen] = useState(false)

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
    const request = ++requestSequence.current
    setSelectedAreaId(areaId)
    setResult(null)
    setCaughtUp(false)
    setError(false)
    if (!areaId || !online) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const nextResult = await client.getNewSince(areaId)
      if (request === requestSequence.current) setResult(nextResult)
    } catch {
      if (request === requestSequence.current) setError(true)
    } finally {
      if (request === requestSequence.current) setLoading(false)
    }
  }

  async function dismiss(storeId: string) {
    if (pendingDismiss || !online) return
    setPendingDismiss(storeId)
    setError(false)
    try {
      await client.dismissNewStore(storeId)
      setResult((current) =>
        current
          ? { ...current, stores: current.stores.filter((store) => store.storeId !== storeId) }
          : current,
      )
    } catch {
      setError(true)
    } finally {
      setPendingDismiss(null)
    }
  }

  async function markSeen() {
    if (!result || markingSeen || !online) return
    setMarkingSeen(true)
    setError(false)
    try {
      await client.markCatalogSeen(result.area.id)
      setCaughtUp(true)
    } catch {
      setError(true)
    } finally {
      setMarkingSeen(false)
    }
  }

  return (
    <ShopperCard
      title="New since your last visit"
      description="Choose an area yourself. Antique Trail does not use background location or send notifications."
    >
      {!online && <OfflineNotice />}
      <label htmlFor="new-since-area">Choose an area</label>
      <select
        id="new-since-area"
        value={selectedAreaId}
        disabled={areas === null || !online}
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
            <ul className="shopper-store-list" aria-label={`New stores in ${result.area.label}`}>
              {result.stores.map((store) => (
                <StoreRecordCard
                  key={store.storeId}
                  name={store.name}
                  slug={store.slug}
                  areaLabel={result.area.label}
                  timestampLabel="Added to catalog"
                  timestamp={store.addedAt}
                  sourceLabel="Account-scoped catalog change record"
                >
                  <button
                    type="button"
                    disabled={pendingDismiss !== null || !online}
                    onClick={() => void dismiss(store.storeId)}
                  >
                    {pendingDismiss === store.storeId
                      ? `Dismissing ${store.name}…`
                      : `Dismiss ${store.name}`}
                  </button>
                </StoreRecordCard>
              ))}
            </ul>
          ) : (
            <p role="status">No new stores in this area.</p>
          )}
          <button
            className="button"
            type="button"
            disabled={markingSeen || !online}
            onClick={() => void markSeen()}
          >
            {markingSeen
              ? `Marking ${result.area.label} as seen…`
              : `Mark ${result.area.label} as seen`}
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
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(false)
    setMemories(null)
    client
      .listMemories()
      .then((result) => {
        if (!cancelled) setMemories(result)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, reload])
  return (
    <ShopperCard
      title="Your private history"
      description="Ratings, notes, and visit memories belong only to this signed-in shopper account."
    >
      {error ? (
        <>
          <GenericError />
          <button className="button" type="button" onClick={() => setReload((value) => value + 1)}>
            Try private history again
          </button>
        </>
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
  storeId,
  client = unavailableShopperClient,
}: {
  storeId: string
  client?: ShopperPrivateClient
}) {
  const online = useOnlineStatus()
  const [memory, setMemory] = useState<PrivateStoreMemory>({
    storeId,
    rating: null,
    note: null,
    lastVisitMonth: null,
    version: 0,
  })
  const [state, setState] = useState<PrivateActionState>('loading')
  const [deleteReceipt, setDeleteReceipt] = useState<PrivateDeleteReceipt | null>(null)
  const [error, setError] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const keepMemoryRef = useRef<HTMLButtonElement>(null)
  const wasConfirmingDelete = useRef(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setHasLoaded(false)
    setError(false)
    setLoadFailed(false)
    setState('loading')
    client
      .getMemory(storeId)
      .then((result) => {
        if (!cancelled && result) setMemory(result)
        if (!cancelled) {
          setState('updated')
          setHasLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoadFailed(true)
          setState('error')
          setHasLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, reload, storeId])
  useEffect(() => {
    if (confirmDelete) keepMemoryRef.current?.focus()
    else if (wasConfirmingDelete.current) deleteTriggerRef.current?.focus()
    wasConfirmingDelete.current = confirmDelete
  }, [confirmDelete])
  async function save(event: FormEvent) {
    event.preventDefault()
    if (state === 'loading' || !online) return
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
    if (state === 'delete-pending' || !online) return
    setState('delete-pending')
    setError(false)
    try {
      setDeleteReceipt(await client.deleteMemory(storeId))
      setConfirmDelete(false)
      setState('deleted')
    } catch {
      setError(true)
      setState('error')
    }
  }
  async function undoRemove() {
    if (!deleteReceipt || state === 'loading' || !online) return
    setState('loading')
    setError(false)
    try {
      setMemory(await client.undoDeleteMemory(storeId, deleteReceipt.undoToken))
      setDeleteReceipt(null)
      setState('undone')
    } catch {
      setError(true)
      setState('error')
    }
  }
  if (!hasLoaded)
    return (
      <ShopperCard
        title="Private store memory"
        description="Your rating, note, and visit month are visible only to you."
      >
        <p role="status">Loading private memory…</p>
      </ShopperCard>
    )
  if (loadFailed)
    return (
      <ShopperCard
        title="Private memory unavailable"
        description="We could not load your private store memory."
      >
        <GenericError />
        <button className="button" type="button" onClick={() => setReload((value) => value + 1)}>
          Try private memory again
        </button>
      </ShopperCard>
    )
  return (
    <ShopperCard
      title="Private store memory"
      description="Your rating, note, and visit month are visible only to you."
    >
      {!online && <OfflineNotice />}
      {state === 'deleted' ? (
        <div>
          <p role="status">Private memory deleted.</p>
          <button
            className="button"
            type="button"
            disabled={!online}
            onClick={() => void undoRemove()}
          >
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
          <button className="button" type="submit" disabled={state === 'loading' || !online}>
            {state === 'loading' ? 'Saving…' : 'Save private memory'}
          </button>
          {confirmDelete ? (
            <fieldset>
              <legend>Delete this private memory?</legend>
              <p id="memory-delete-consequence">
                The memory disappears immediately. You can undo for a short time.
              </p>
              <div className="memory-delete-actions">
                <button
                  ref={keepMemoryRef}
                  className="button button--secondary"
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep memory
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  aria-describedby="memory-delete-consequence"
                  disabled={state === 'delete-pending' || !online}
                  onClick={() => void remove()}
                >
                  {state === 'delete-pending' ? 'Deleting…' : 'Yes, delete memory'}
                </button>
              </div>
            </fieldset>
          ) : (
            <button
              ref={deleteTriggerRef}
              type="button"
              disabled={!online}
              onClick={() => setConfirmDelete(true)}
            >
              Delete memory
            </button>
          )}
          {state === 'saved' && <p role="status">Private memory saved.</p>}
          {state === 'undone' && <p role="status">Private memory restored.</p>}
        </form>
      )}
    </ShopperCard>
  )
}

export function CorrectionPage({
  storeId,
  client = unavailableShopperClient,
}: {
  storeId: string
  client?: ShopperPrivateClient
}) {
  const online = useOnlineStatus()
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const location = useLocation()
  const [draft, setDraft] = useState<CorrectionDraft>(
    () =>
      readCorrectionDraft(slug) ?? {
        storeId,
        type: 'hours',
        description: '',
      },
  )
  const [result, setResult] = useState<CorrectionStatus | null>(null)
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting || !online) return
    if (!draft.description.trim()) {
      setError(true)
      return
    }
    if (!session) {
      rememberCorrectionDraft(slug, draft)
      setError(true)
      return
    }
    setError(false)
    setSubmitting(true)
    try {
      setResult(
        await client.submitCorrection({
          ...draft,
          description: draft.description.trim(),
          publicSourceUrl: draft.publicSourceUrl?.trim() || undefined,
        }),
      )
      forgetCorrectionDraft(slug)
    } catch {
      setError(true)
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <ShopperCard
      title="Suggest a correction"
      description="Draft anonymously, then sign in to submit. We show only your own reason-neutral status."
    >
      {!online && <OfflineNotice />}
      {result ? (
        <div>
          <p role="status">Correction submitted. Status: {result.state}.</p>
          <Link to={`/corrections/${encodeURIComponent(result.id)}`}>Track this correction</Link>
        </div>
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
          <p>{draft.description.length} of 2,000 characters</p>
          <label htmlFor="correction-source">Public source URL (optional)</label>
          <input
            id="correction-source"
            type="url"
            inputMode="url"
            value={draft.publicSourceUrl ?? ''}
            onChange={(event) =>
              setDraft({ ...draft, publicSourceUrl: event.target.value || undefined })
            }
          />
          {error && (
            <GenericError
              message={
                !draft.description.trim()
                  ? 'Describe what needs correction before submitting.'
                  : session
                    ? GENERIC_SHOPPER_ERROR
                    : 'Sign in to submit this correction. Your draft stays in this browser tab.'
              }
            />
          )}
          {!session && (
            <p>
              <Link
                to={`/auth/sign-in?returnTo=${encodeURIComponent(location.pathname)}`}
                state={{ correctionDraft: draft }}
                onClick={() => rememberCorrectionDraft(slug, draft)}
              >
                Sign in to submit this correction
              </Link>
            </p>
          )}
          <button className="button" type="submit" disabled={submitting || !online}>
            {submitting ? 'Submitting correction…' : 'Submit correction'}
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
  const online = useOnlineStatus()
  const { correctionId = '' } = useParams()
  const [status, setStatus] = useState<CorrectionStatus | null>(null)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(false)
    setLoaded(false)
    client
      .getCorrection(correctionId)
      .then((result) => {
        if (!cancelled) {
          setStatus(result)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, correctionId, reload])
  return (
    <ShopperCard
      title="Correction status"
      description="Only your own reason-neutral status is shown."
    >
      {!online && <OfflineNotice />}
      {error ? (
        <>
          <GenericError />
          <button
            className="button"
            type="button"
            disabled={!online}
            onClick={() => setReload((value) => value + 1)}
          >
            Try correction status again
          </button>
        </>
      ) : status ? (
        <p role="status">Correction status: {status.state}.</p>
      ) : loaded ? (
        <p role="status">
          This correction is not available. It may belong to another shopper account.
        </p>
      ) : (
        <p role="status">Loading correction status…</p>
      )}
    </ShopperCard>
  )
}
