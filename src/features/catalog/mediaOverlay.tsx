import type { CatalogMedia } from './types'

export const MEDIA_OVERLAY_SURFACE_CLASS = 'media-overlay-surface'
export const MEDIA_OVERLAY_CONTROL_CLASS = 'media-overlay-control'

function classNames(shared: string, local: string) {
  return `${shared} ${local}`
}

/**
 * MediaCaption anatomy/states: an optional caption followed by optional public
 * rights text on the shared opaque surface; null when both are absent.
 * Semantics: callers place it in a figure and it owns the figcaption. It has no
 * keyboard or focus behavior. Missing metadata recovers by rendering nothing;
 * image failure is owned by the calling media surface. Only CatalogMedia's
 * public caption/rights fields are read.
 */
export function MediaCaption({ media, className }: { media: CatalogMedia; className: string }) {
  const { caption, rightsLabel } = media
  if (!caption && !rightsLabel) return null

  return (
    <figcaption className={classNames(MEDIA_OVERLAY_SURFACE_CLASS, className)}>
      {caption && <span className="media-overlay__caption">{caption}</span>}
      {caption && rightsLabel ? ' · ' : ''}
      {rightsLabel && <span className="media-overlay__attribution">{rightsLabel}</span>}
    </figcaption>
  )
}

/**
 * MediaTileOverlay anatomy/states: persistent optional caption plus required
 * “View Photo” action on the shared opaque surface. It is a visual duplicate
 * hidden from accessibility APIs; the parent button must use mediaActionLabel.
 * The parent owns pointer/keyboard activation and focus. Missing captions retain
 * the action, while failed media is replaced by the caller's unavailable state.
 */
export function MediaTileOverlay({ media, className }: { media: CatalogMedia; className: string }) {
  return (
    <span className={classNames(MEDIA_OVERLAY_SURFACE_CLASS, className)} aria-hidden="true">
      {media.caption && <span className="store-photos__tile-caption">{media.caption}</span>}
      <span className="store-photos__tile-action">View Photo</span>
    </span>
  )
}

/**
 * MediaPosition anatomy/states: current one-based index plus total count on the
 * shared opaque surface, updated after modal navigation. Semantics: an atomic
 * polite status. It has no pointer, keyboard, or focus behavior; callers own
 * the labeled navigation controls and valid index/count. Empty or failed media
 * recovery belongs to the caller, which removes the status with the modal.
 */
export function MediaPosition({ index, count }: { index: number; count: number }) {
  return (
    <p
      className={`${MEDIA_OVERLAY_SURFACE_CLASS} media-overlay-position`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      Photo {index + 1} of {count}
    </p>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- shared accessible-name contract for this component family
export function mediaActionLabel(index: number, media: CatalogMedia) {
  const caption = media.caption ? ` Caption: ${media.caption}` : ''
  return `View photo ${index + 1}: ${media.alt}${caption}`
}
