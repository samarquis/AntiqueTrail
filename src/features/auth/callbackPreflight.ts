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
  const search = new URLSearchParams(location.search)
  const oauthCode = search.get('code')
  const oauthError = search.get('error')
  if (oauthCode || oauthError) {
    const callback: AuthCallback = { kind: 'oauth' }
    if (oauthCode) callback.code = oauthCode
    if (oauthError) callback.oauthError = oauthError
    pendingCallback = callback
    // Only OAuth params are removed so a preserved returnTo query survives.
    for (const name of ['code', 'error', 'error_description', 'error_uri']) search.delete(name)
    const rest = search.toString()
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}`)
  } else {
    const params = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : '')
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    pendingCallback =
      tokenHash && (type === 'verify' || type === 'recovery') ? { kind: type, tokenHash } : null
    history.replaceState(null, '', `${location.pathname}${location.search}`)
  }
  exchangeKey = null
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
  const key =
    callback.kind === 'oauth'
      ? `oauth:${callback.code ?? callback.oauthError ?? 'error'}`
      : `${callback.kind}:${callback.tokenHash}`
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
