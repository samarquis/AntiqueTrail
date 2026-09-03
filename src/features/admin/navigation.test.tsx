import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminPrimaryNavigation } from './navigation'
import { ADMIN_ROUTES, ADMIN_ROUTE_PARENTS, adminRouteParent } from './routes'

describe('Administrator route-parent registry', () => {
  afterEach(cleanup)

  it('defines only Review, Access, and More in the required order', () => {
    expect(
      ADMIN_ROUTE_PARENTS.map(({ id, label, destination }) => ({ id, label, destination })),
    ).toEqual([
      { id: 'review', label: 'Review', destination: '/admin' },
      { id: 'access', label: 'Access', destination: '/admin/access' },
      { id: 'more', label: 'More', destination: '/admin/more' },
    ])
  })

  it.each(ADMIN_ROUTES)('gives mounted route $id exactly one $parentId parent', (route) => {
    const pathname = route.path.replace(':runId', 'run-1').replace(':cohortId', 'cohort-1')
    expect(adminRouteParent(pathname)?.id).toBe(route.parentId)
  })

  it('does not classify an unmounted Administrator path', () => {
    expect(adminRouteParent('/admin/unrecognized')).toBeNull()
  })

  it('uses the registry to expose one current parent for a direct child link', () => {
    render(
      <MemoryRouter initialEntries={['/admin/reviews']}>
        <nav aria-label="Primary navigation">
          <AdminPrimaryNavigation />
        </nav>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(navigation).toHaveTextContent('ReviewAccessMore')
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Access' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'More' })).not.toHaveAttribute('aria-current')
  })
})
