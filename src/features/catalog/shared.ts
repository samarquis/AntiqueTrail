const BROWSE_RETURN_KEY = 'antique-trail:browse-return'

export function catalogAppHref(path: string, base = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  return `${normalizedBase}${path.replace(/^\/+/, '')}`
}

interface BrowseReturnState {
  href: string
  scrollY: number
  storeId: string
  savedAt: number
}

export function responsiveCatalogImage(src: string, sizes: string) {
  if (!src.includes('/1280w/') || !src.endsWith('.webp')) return { sizes }
  return {
    srcSet: [480, 800, 1280]
      .map((width) => `${src.replace('/1280w/', `/${width}w/`)} ${width}w`)
      .join(', '),
    sizes,
  }
}

export function readBrowseReturn(): BrowseReturnState | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(BROWSE_RETURN_KEY) ?? 'null',
    ) as Partial<BrowseReturnState> | null
    if (
      !parsed ||
      typeof parsed.href !== 'string' ||
      !/^\/stores(?:\?|$)/u.test(parsed.href) ||
      typeof parsed.scrollY !== 'number' ||
      !Number.isFinite(parsed.scrollY) ||
      typeof parsed.storeId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > 30 * 60_000
    )
      return null
    return parsed as BrowseReturnState
  } catch {
    return null
  }
}

export function rememberBrowseReturn(storeId: string) {
  if (typeof window === 'undefined') return
  const href = `${window.location.pathname}${window.location.search}`
  if (!/^\/stores(?:\?|$)/u.test(href)) return
  window.sessionStorage.setItem(
    BROWSE_RETURN_KEY,
    JSON.stringify({ href, scrollY: window.scrollY, storeId, savedAt: Date.now() }),
  )
}

export function clearBrowseReturn() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(BROWSE_RETURN_KEY)
}
