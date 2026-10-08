import { useState } from 'react'
import { catalogAppHref } from './shared'
import type { CatalogStore } from './types'

const storeSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function createPublicStoreUrl(
  slug: string,
  applicationBase: string,
  currentHref: string,
): string | null {
  if (slug.length > 96 || !storeSlugPattern.test(slug)) return null

  try {
    const current = new URL(currentHref)
    if (current.protocol !== 'http:' && current.protocol !== 'https:') return null

    const suffix = `/stores/${encodeURIComponent(slug)}`
    const target = new URL(catalogAppHref(suffix, applicationBase), current.origin)
    if (
      target.origin !== current.origin ||
      target.username ||
      target.password ||
      !target.pathname.endsWith(suffix)
    ) {
      return null
    }

    target.search = ''
    target.hash = ''
    return target.href
  } catch {
    return null
  }
}

function isShareCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

export function StoreShareControl({ store }: { store: Pick<CatalogStore, 'name' | 'slug'> }) {
  const publicUrl =
    typeof window === 'undefined'
      ? null
      : createPublicStoreUrl(store.slug, import.meta.env.BASE_URL, window.location.href)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const [feedback, setFeedback] = useState<{ role: 'alert' | 'status'; text: string } | null>(null)
  const [showCopyFallback, setShowCopyFallback] = useState(false)
  const [showPublicUrl, setShowPublicUrl] = useState(false)
  const [pending, setPending] = useState(false)

  if (!publicUrl) return null

  const copyLink = async () => {
    setFeedback(null)
    setPending(true)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable')
      await navigator.clipboard.writeText(publicUrl)
      setShowPublicUrl(false)
      setFeedback({ role: 'status', text: 'Public link copied.' })
    } catch {
      setShowPublicUrl(true)
      setFeedback({
        role: 'alert',
        text: 'Clipboard access is unavailable. Select the public link to copy it.',
      })
    } finally {
      setPending(false)
    }
  }

  const shareStore = async () => {
    if (!canShare) {
      await copyLink()
      return
    }

    setFeedback(null)
    setShowCopyFallback(false)
    setPending(true)
    try {
      await navigator.share({ title: store.name, url: publicUrl })
    } catch (error) {
      if (isShareCancellation(error)) return
      setShowCopyFallback(true)
      setFeedback({ role: 'alert', text: 'Sharing failed. You can copy the public link instead.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <section aria-label="Share this store">
      <button
        className="button button--secondary"
        type="button"
        disabled={pending}
        onClick={shareStore}
      >
        {canShare ? 'Share store' : 'Copy link'}
      </button>
      {canShare && showCopyFallback && (
        <button
          className="button button--secondary"
          type="button"
          disabled={pending}
          onClick={copyLink}
        >
          Copy link
        </button>
      )}
      {feedback && <p role={feedback.role}>{feedback.text}</p>}
      {showPublicUrl && (
        <input
          aria-label="Public store link"
          className="button button--secondary"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          style={{ flex: '1 1 18rem', minWidth: 0, textAlign: 'start' }}
          type="text"
          value={publicUrl}
        />
      )}
    </section>
  )
}
