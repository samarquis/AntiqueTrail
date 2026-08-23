import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState, LoadingState } from './states'
import {
  catalogAppHref,
  readBrowseReturn,
  responsiveCatalogImage,
} from './shared'
import type { CatalogClient, CatalogStore } from './types'

type PhotoSlot =
  | { kind: 'feature'; index: number; side: 'left' | 'right' }
  | { kind: 'tile'; index: number }

/**
 * Production store photo gallery (`/stores/:slug/photos`), locked to DESIGN.md
 * "Store photo gallery page" variant D: editorial header, asymmetric grid,
 * up to two full-bleed parallax features, reading-progress bar, lightbox.
 */
export function StorePhotosPage({ client, slug }: { client: CatalogClient; slug: string }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'success'; store: CatalogStore }
    | { kind: 'error'; message?: string }
    | { kind: 'not-found' }
  >({ kind: 'loading' })
  const load = useCallback(() => {
    setState({ kind: 'loading' })
    client
      .details(slug)
      .then((store) => setState(store ? { kind: 'success', store } : { kind: 'not-found' }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof Error ? error.message : 'Catalog unavailable. Please try again.',
        }),
      )
  }, [client, slug])
  useEffect(() => {
    load()
  }, [load])

  if (state.kind === 'loading')
    return (
      <main>
        <LoadingState />
      </main>
    )
  if (state.kind === 'error')
    return (
      <main>
        <ErrorState message={state.message ?? 'Catalog unavailable.'} onRetry={load} />
      </main>
    )
  if (state.kind === 'not-found')
    return (
      <main>
        <h1>Store not found</h1>
        <p>That store is not available in the catalog.</p>
        <a href={catalogAppHref(readBrowseReturn()?.href ?? '/stores')}>Back to stores</a>
      </main>
    )
  return <StorePhotosView store={state.store} />
}

/** Cover leads as the first feature; a second joins mid-page from five photos up. */
function buildLayout(count: number): PhotoSlot[] {
  if (count < 1) return []
  const featured = new Set<number>([0])
  const slots: PhotoSlot[] = [{ kind: 'feature', index: 0, side: 'right' }]
  if (count >= 5) {
    featured.add(Math.ceil(count / 2))
    slots.push({ kind: 'feature', index: Math.ceil(count / 2), side: 'left' })
  }
  for (let index = 0; index < count; index += 1) {
    if (!featured.has(index)) slots.push({ kind: 'tile', index })
  }
  return slots
}

function StorePhotosView({ store }: { store: CatalogStore }) {
  const media = store.media
  const detailsHref = catalogAppHref(`/stores/${encodeURIComponent(store.slug)}`)
  const backLabel = `Back to ${store.name}`
  const layout = useMemo(() => buildLayout(media.length), [media.length])

  const pageRef = useRef<HTMLElement>(null)
  const featureRefs = useRef<Array<HTMLElement | null>>([])

  const [failed, setFailed] = useState<Set<number>>(() => new Set())
  const markFailed = useCallback((index: number) => {
    setFailed((current) => {
      if (current.has(index)) return current
      const next = new Set(current)
      next.add(index)
      return next
    })
  }, [])

  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const openerRef = useRef<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const prevButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const lightboxIndex = openIndex !== null && !failed.has(openIndex) ? openIndex : null
  const lightboxPhoto = lightboxIndex !== null ? media[lightboxIndex] : undefined

  useEffect(() => {
    if (lightboxIndex !== null) closeButtonRef.current?.focus()
  }, [lightboxIndex])

  const closeLightbox = useCallback(() => {
    const returning = openerRef.current
    setOpenIndex(null)
    requestAnimationFrame(() => {
      const root = pageRef.current
      const opener =
        returning !== null && root
          ? root.querySelector<HTMLButtonElement>(`button[data-photo-index="${returning}"]`)
          : null
      if (opener && !opener.disabled) opener.focus()
      else root?.querySelector<HTMLAnchorElement>('a.store-photos__back')?.focus()
    })
  }, [])

  const step = useCallback(
    (direction: 1 | -1) => {
      setOpenIndex((current) => {
        if (current === null || media.length < 2) return current
        for (let offset = 1; offset <= media.length; offset += 1) {
          const candidate = (current + direction * offset + media.length) % media.length
          if (!failed.has(candidate)) return candidate
        }
        return current
      })
    },
    [failed, media.length],
  )

  // Reveal-on-scroll: tiles start hidden only while the observer is active, so
  // content stays fully visible without JavaScript or with reduced motion.
  const [revealArmed, setRevealArmed] = useState(false)
  useEffect(() => {
    const root = pageRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setRevealArmed(true)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    for (const tile of root.querySelectorAll('.store-photos__tile')) observer.observe(tile)
    return () => observer.disconnect()
  }, [layout])

  // Gentle scroll parallax on feature images; skipped entirely for reduced motion.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = () => {
      frame = 0
      for (const section of featureRefs.current) {
        if (!section) continue
        const rect = section.getBoundingClientRect()
        const drift = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight
        const image = section.querySelector('img')
        if (image instanceof HTMLElement) {
          image.style.setProperty('--store-photos-drift', `${(drift * 4).toFixed(2)}%`)
        }
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [layout])

  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const update = () => {
      const doc = document.documentElement
      const remaining = doc.scrollHeight - window.innerHeight
      setProgress(remaining > 0 ? Math.min(1, Math.max(0, window.scrollY / remaining)) : 0)
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  if (media.length === 0) {
    return (
      <main className="store-photos">
        <a className="store-photos__back" href={detailsHref}>
          <span aria-hidden="true">←</span> {backLabel}
        </a>
        <h1>{store.name}</h1>
        <p className="honesty-note">This store has not published any photos yet.</p>
        <p>
          <a href={detailsHref}>Visit store details</a>
        </p>
      </main>
    )
  }

  let tileRun = 0

  return (
    <main ref={pageRef} className={`store-photos${revealArmed ? ' store-photos--reveal' : ''}`}>
      <div className="store-photos__progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      {lightboxPhoto && lightboxIndex !== null && (
        <div
          className="store-photos__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Enlarged store photo: ${lightboxPhoto.alt}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeLightbox()
            if (event.key === 'ArrowLeft') step(-1)
            if (event.key === 'ArrowRight') step(1)
            if (event.key === 'Tab') {
              const focusable = [
                closeButtonRef.current,
                prevButtonRef.current,
                nextButtonRef.current,
              ].filter((element): element is HTMLButtonElement => element !== null)
              const first = focusable[0]
              const last = focusable[focusable.length - 1]
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
              }
            }
          }}
        >
          <button
            ref={closeButtonRef}
            type="button"
            className="store-photos__lightbox-close"
            onClick={closeLightbox}
          >
            Close enlarged photo
          </button>
          {media.length > 1 && (
            <>
              <button
                ref={prevButtonRef}
                type="button"
                className="store-photos__lightbox-nav store-photos__lightbox-nav--prev"
                aria-label="Previous photo"
                onClick={() => step(-1)}
              >
                ‹
              </button>
              <button
                ref={nextButtonRef}
                type="button"
                className="store-photos__lightbox-nav store-photos__lightbox-nav--next"
                aria-label="Next photo"
                onClick={() => step(1)}
              >
                ›
              </button>
            </>
          )}
          <figure className="store-photos__lightbox-figure">
            <img
              src={lightboxPhoto.src}
              {...responsiveCatalogImage(
                lightboxPhoto.src,
                '(max-width: 800px) calc(100vw - 2rem), 1120px',
              )}
              alt={lightboxPhoto.alt}
              onError={() => {
                markFailed(lightboxIndex)
                closeLightbox()
              }}
            />
            {(lightboxPhoto.caption || lightboxPhoto.rightsLabel) && (
              <figcaption className="store-photos__lightbox-caption">
                {lightboxPhoto.caption}
                {lightboxPhoto.caption && lightboxPhoto.rightsLabel ? ' · ' : ''}
                {lightboxPhoto.rightsLabel}
              </figcaption>
            )}
          </figure>
        </div>
      )}

      <header className="store-photos__header">
        <a className="store-photos__back" href={detailsHref}>
          <span aria-hidden="true">←</span> {backLabel}
        </a>
        <h1>{store.name}</h1>
        <p className="store-photos__location">
          {store.town}, {store.state}
        </p>
        <p className="store-photos__count">
          {media.length} {media.length === 1 ? 'photo' : 'photos'}
        </p>
      </header>

      <section className="store-photos__body" aria-labelledby="store-photos-heading">
        <h2 id="store-photos-heading" className="sr-only">
          Store photos
        </h2>
        {layout.map((slot) => {
          const item = media[slot.index]
          if (slot.kind === 'feature') {
            const order =
              slot.side === 'right'
                ? 0
                : layout.filter(
                    (candidate) =>
                      candidate.kind === 'feature' &&
                      candidate.side === 'right' &&
                      candidate.index < slot.index,
                  ).length
            return (
              <figure
                key={`feature-${slot.index}`}
                ref={(element) => {
                  featureRefs.current[order] = element
                }}
                className={`store-photos__feature store-photos__feature--${slot.side}`}
              >
                {failed.has(slot.index) ? (
                  <div className="store-photos__missing" role="img" aria-label="Photo unavailable">
                    <strong aria-hidden="true">{store.name.slice(0, 1)}</strong>
                    <span>Photo unavailable</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={item.src}
                      {...responsiveCatalogImage(item.src, '100vw')}
                      alt={item.alt}
                      onError={() => markFailed(slot.index)}
                    />
                    {(item.caption || item.rightsLabel) && (
                      <figcaption className="store-photos__feature-caption">
                        {item.caption}
                        {item.caption && item.rightsLabel ? ' · ' : ''}
                        {item.rightsLabel}
                      </figcaption>
                    )}
                  </>
                )}
              </figure>
            )
          }
          const sizeClass = ['store-photos__tile--tall', '', 'store-photos__tile--wide'][
            tileRun % 3
          ]
          tileRun += 1
          return (
            <button
              key={`tile-${slot.index}`}
              type="button"
              data-photo-index={slot.index}
              className={`store-photos__tile${sizeClass ? ` ${sizeClass}` : ''}`}
              aria-label={
                failed.has(slot.index)
                  ? `Photo ${slot.index + 1}: unavailable`
                  : `View photo ${slot.index + 1}: ${item.alt}`
              }
              disabled={failed.has(slot.index)}
              onClick={() => {
                openerRef.current = slot.index
                setOpenIndex(slot.index)
              }}
            >
              {failed.has(slot.index) ? (
                <span className="store-photos__tile-unavailable">Unavailable</span>
              ) : (
                <>
                  <img
                    src={item.src}
                    {...responsiveCatalogImage(item.src, '(max-width: 800px) 60vw, 30vw')}
                    alt=""
                    onError={() => markFailed(slot.index)}
                  />
                  <span className="store-photos__tile-overlay" aria-hidden="true">
                    {item.caption && (
                      <span className="store-photos__tile-caption">{item.caption}</span>
                    )}
                    <span className="store-photos__tile-action">View Photo</span>
                  </span>
                </>
              )}
            </button>
          )
        })}
      </section>
    </main>
  )
}
