import type { AuthCallback } from './authBoundary'

let pendingCallback: AuthCallback | null = null
let exchangeKey: string | null = null
let exchangePromise: Promise<unknown> | null = null

/**
 * Runs before the application graph is imported. The credential is retained only in
 * this module's memory and the visible URL is replaced before React, network clients,
 * service-worker registration, analytics, or application rendering can start.
 */
export function preflightAuthCallback(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
  history: Pick<History, 'replaceState'> = window.history,
  documentRoot: Document = document,
): AuthCallback | null {
  if (location.pathname !== '/auth/callback') return null
  const params = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '')
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  pendingCallback =
    tokenHash && (type === 'verify' || type === 'recovery') ? { kind: type, tokenHash } : null
  exchangeKey = null
  exchangePromise = null

  history.replaceState(null, '', `${location.pathname}${location.search}`)
  ensureMeta(documentRoot, 'referrer', 'no-referrer')
  ensureMeta(documentRoot, 'cache-control', 'no-store')
  return pendingCallback
}

/** The callback credential is single-read as well as single-use. */
export function takePreflightAuthCallback(): AuthCallback | null {
  const callback = pendingCallback
  pendingCallback = null
  return callback
}

/** StrictMode-safe exchange latch: replacement effects attach to one provider call. */
export function exchangePreflightAuthCallback<T>(
  callback: AuthCallback,
  exchange: () => Promise<T>,
): Promise<T> {
  const key = `${callback.kind}:${callback.tokenHash}`
  if (exchangeKey === key && exchangePromise) return exchangePromise as Promise<T>
  exchangeKey = key
  exchangePromise = exchange().finally(() => {
    pendingCallback = null
  })
  return exchangePromise as Promise<T>
}

function ensureMeta(documentRoot: Document, name: string, content: string) {
  let meta = documentRoot.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!meta) {
    meta = documentRoot.createElement('meta')
    meta.name = name
    documentRoot.head.prepend(meta)
  }
  meta.content = content
}
