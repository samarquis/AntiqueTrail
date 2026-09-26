import { useEffect, useMemo, useRef, useState } from 'react'
import { syntheticStores } from '../catalog/demoClient'
import type { CatalogStore } from '../catalog/types'
import './reviewMockup.css'

const heroImage = '/images/synthetic-stores/1280w/blue-finch-curios-gallery-aisle.webp'

function imageFor(store: CatalogStore) {
  return store.media.find((media) => media.kind === 'cover') ?? store.media[0]
}

function Icon({ name }: { name: 'arrow' | 'close' | 'map' | 'moon' | 'search' | 'sun' }) {
  if (name === 'search') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="10.8" cy="10.8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="m16 16 4.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }
  if (name === 'close') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="m6 6 12 12M18 6 6 18"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    )
  }
  if (name === 'map') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 21s6-5.25 6-11a6 6 0 1 0-12 0c0 5.75 6 11 6 11Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (name === 'sun') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2.5v2M12 19.5v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.5 12h2M19.5 12h2M4.7 19.3l1.4-1.4M17.9 6.1l1.4-1.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    )
  }
  if (name === 'moon') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M20 15.1A8.5 8.5 0 0 1 8.9 4 8.5 8.5 0 1 0 20 15.1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 12h13M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className={`review-reveal ${visible ? 'is-visible' : ''} ${className}`}>
      {children}
    </section>
  )
}

function ThemeSwitch() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try {
      localStorage.setItem('at-theme', next ? 'dark' : 'light')
    } catch {
      // Theme remains active for the current session when storage is unavailable.
    }
  }

  return (
    <button
      className="review-theme-toggle"
      type="button"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
      onClick={toggle}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
      <span>{dark ? 'Daylight' : 'Midnight'}</span>
    </button>
  )
}

function formatHours(store: CatalogStore) {
  const today = store.hours.find((day) => day.weekday === 5)
  if (!today || today.status === 'closed') return 'Closed today'
  const interval = today.intervals[0]
  return interval ? `Open today · ${interval.opensAt}–${interval.closesAt}` : 'Hours unavailable'
}

export function ReviewMockupPage() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogStore | null>(null)
  const [notice, setNotice] = useState('')
  const [headerVisible, setHeaderVisible] = useState(true)
  const lastScroll = useRef(0)
  const detailRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY
      setHeaderVisible(current < 80 || current < lastScroll.current || current < 20)
      lastScroll.current = current
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const stores = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    if (!value) return syntheticStores.slice(0, 6)
    return syntheticStores.filter((store) =>
      [store.name, store.town, ...store.categories.map((category) => category.label)].some(
        (field) => field.toLocaleLowerCase().includes(value),
      ),
    )
  }, [query])

  const showDetail = (store: CatalogStore) => {
    setSelected(store)
    window.setTimeout(
      () => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      40,
    )
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  return (
    <div className="review-mockup">
      <header className={`review-mockup__header ${headerVisible ? 'is-visible' : 'is-hidden'}`}>
        <a className="review-mockup__brand" href="#top" aria-label="Antique Trail home">
          <img src="/app-icon.svg" alt="" width="36" height="36" />
          <span>Antique Trail</span>
        </a>
        <nav aria-label="Prototype navigation">
          <a href="#stores">Stores</a>
          <a href="/trips">Trips</a>
          <a href="/more">Account</a>
        </nav>
        <div className="review-mockup__tools">
          <button
            className="review-icon-button"
            type="button"
            aria-label={searchOpen ? 'Close store search' : 'Search stores'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Icon name={searchOpen ? 'close' : 'search'} />
          </button>
          <ThemeSwitch />
        </div>
      </header>

      <main id="top">
        <section className="review-hero" aria-labelledby="review-hero-title">
          <img
            className="review-hero__image"
            src={heroImage}
            alt="A lamp-lit antique shop aisle with cabinets and curiosities."
          />
          <div className="review-hero__shade" />
          <div className="review-hero__content">
            <p className="review-kicker">A field guide to curious places</p>
            <h1 id="review-hero-title">Discover local antiques.</h1>
            <p>
              Make a day of the shops, stories, and one-of-a-kind finds waiting around the corner.
            </p>
            <a className="review-button review-button--light" href="#stores">
              Find a store near you
              <Icon name="arrow" />
            </a>
          </div>
          <p className="review-hero__caption">Fictional sample imagery · Antique Trail prototype</p>
        </section>

        <div className={`review-search ${searchOpen ? 'is-open' : ''}`} aria-hidden={!searchOpen}>
          <label htmlFor="review-search-input">Search the guide</label>
          <div className="review-search__input-wrap">
            <Icon name="search" />
            <input
              id="review-search-input"
              type="search"
              value={query}
              placeholder="Try a shop, town, or category"
              onChange={(event) => setQuery(event.target.value)}
              tabIndex={searchOpen ? 0 : -1}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')}>
                Clear
              </button>
            )}
          </div>
        </div>

        <Reveal className="review-stores">
          <div className="review-section-heading" id="stores">
            <div>
              <p className="review-kicker">Start nearby</p>
              <h2>Places worth the detour.</h2>
            </div>
            <p>
              {stores.length} nearby shop{stores.length === 1 ? '' : 's'} · Topeka, Kansas
            </p>
          </div>
          <div className="review-store-grid">
            {stores.map((store, index) => {
              const image = imageFor(store)
              return (
                <article
                  className={`review-store-card review-store-card--${index % 3}`}
                  key={store.id}
                >
                  <button
                    className="review-store-card__media"
                    type="button"
                    onClick={() => showDetail(store)}
                    aria-label={`View ${store.name}`}
                  >
                    {image && <img src={image.src} alt={image.alt} />}
                  </button>
                  <div className="review-store-card__body">
                    <div>
                      <p className="review-store-card__location">
                        <Icon name="map" /> {store.town}, {store.state}
                      </p>
                      <h3>{store.name}</h3>
                      <p>{store.summary}</p>
                    </div>
                    <div className="review-store-card__footer">
                      <span className="review-store-card__hours">{formatHours(store)}</span>
                      <button
                        className="review-text-button"
                        type="button"
                        onClick={() => showDetail(store)}
                      >
                        View <Icon name="arrow" />
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {stores.length === 0 && (
            <p className="review-empty" role="status">
              No shops match “{query}”. Try a different town or category.
            </p>
          )}
        </Reveal>

        <Reveal className="review-trail-note">
          <div className="review-trail-note__copy">
            <p className="review-kicker">Plan your Saturday</p>
            <h2>Good finds are better shared.</h2>
            <p>
              Save a few stops, compare hours, and shape an easy-going route with room for the
              unexpected.
            </p>
            <a className="review-button" href="/trips">
              Build a trip <Icon name="arrow" />
            </a>
          </div>
          <div className="review-trail-note__mark" aria-hidden="true">
            <span>AT</span>
            <small>
              Make room
              <br />
              for wonder
            </small>
          </div>
        </Reveal>

        {selected && (
          <Reveal className="review-detail">
            <section ref={detailRef} aria-labelledby="review-detail-title">
              <div className="review-detail__image-wrap">
                <img src={imageFor(selected)?.src} alt={imageFor(selected)?.alt ?? selected.name} />
                <span>Store detail · prototype</span>
              </div>
              <div className="review-detail__body">
                <div className="review-detail__heading">
                  <div>
                    <p className="review-kicker">
                      {selected.categories[0]?.label ?? 'Antique shop'}
                    </p>
                    <h2 id="review-detail-title">{selected.name}</h2>
                    <p className="review-detail__location">
                      <Icon name="map" /> {selected.address}, {selected.town}, {selected.state}
                    </p>
                  </div>
                  <button
                    className="review-icon-button review-icon-button--quiet"
                    type="button"
                    onClick={() => setSelected(null)}
                    aria-label="Close store detail"
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <p className="review-detail__story">
                  {selected.description} Follow the warm light, take your time, and leave room for
                  the piece you did not know you were looking for.
                </p>
                <div className="review-detail__facts">
                  <div>
                    <span>Today</span>
                    <strong>{formatHours(selected)}</strong>
                  </div>
                  <div>
                    <span>Freshness</span>
                    <strong>
                      {selected.freshness?.status === 'stale'
                        ? 'Verification overdue'
                        : 'Recently verified'}
                    </strong>
                  </div>
                </div>
                <div className="review-detail__actions">
                  <button
                    className="review-button"
                    type="button"
                    onClick={() => showNotice('Trip planning is ready to connect here.')}
                  >
                    Add to a trip <Icon name="arrow" />
                  </button>
                  <button
                    className="review-button review-button--outline"
                    type="button"
                    onClick={() => showNotice('A live store website would open here.')}
                  >
                    Visit site
                  </button>
                </div>
              </div>
            </section>
          </Reveal>
        )}
      </main>

      <footer className="review-mockup__footer">
        <span>Antique Trail</span>
        <span>Made for curious local explorers.</span>
        <a href="#top">
          Back to top <Icon name="arrow" />
        </a>
      </footer>

      <p className="review-toast" role="status" aria-live="polite" data-visible={Boolean(notice)}>
        {notice}
      </p>
    </div>
  )
}
