import { matchPath } from 'react-router-dom'

export type AdminRouteParentId = 'review' | 'access' | 'more'
export type AdminRouteId =
  | 'reviewQueue'
  | 'accessSafety'
  | 'more'
  | 'partners'
  | 'reviews'
  | 'readiness'
  | 'beta'

export interface AdminRouteDefinition {
  id: AdminRouteId
  path: string
  parentId: AdminRouteParentId
}

export interface AdminRouteParent {
  id: AdminRouteParentId
  label: 'Review' | 'Access' | 'More'
  destination: string
}

/** The single mounted-route matrix consumed by routing, navigation, and tests. */
export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [
  { id: 'reviewQueue', path: '/admin', parentId: 'review' },
  { id: 'accessSafety', path: '/admin/access', parentId: 'access' },
  { id: 'more', path: '/admin/more', parentId: 'more' },
  { id: 'partners', path: '/admin/partners', parentId: 'review' },
  { id: 'reviews', path: '/admin/reviews', parentId: 'review' },
  { id: 'readiness', path: '/admin/readiness/:runId', parentId: 'more' },
  { id: 'beta', path: '/admin/beta/:cohortId', parentId: 'more' },
]

/** Every mounted Administrator route belongs to exactly one of these parents. */
export const ADMIN_ROUTE_PARENTS: readonly AdminRouteParent[] = [
  { id: 'review', label: 'Review', destination: '/admin' },
  { id: 'access', label: 'Access', destination: '/admin/access' },
  { id: 'more', label: 'More', destination: '/admin/more' },
]

export function adminRouteParent(pathname: string): AdminRouteParent | null {
  const routes = ADMIN_ROUTES.filter((route) =>
    matchPath({ path: route.path, end: true }, pathname),
  )
  if (routes.length !== 1) return null
  return ADMIN_ROUTE_PARENTS.find((parent) => parent.id === routes[0].parentId) ?? null
}
