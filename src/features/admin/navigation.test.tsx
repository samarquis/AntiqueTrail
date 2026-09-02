import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ADMIN_ROUTE_PARENTS, AdminPrimaryNavigation, adminRouteParent } from './navigation'

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

  it.each([
    ['/admin', 'review'],
    ['/admin/partners', 'review'],
    ['/admin/reviews', 'review'],
    ['/admin/access', 'access'],
    ['/admin/more', 'more'],
    ['/admin/readiness/run-1', 'more'],
    ['/admin/beta/cohort-1', 'more'],
  ] as const)('gives %s exactly one %s parent', (pathname, expectedParent) => {
    expect(adminRouteParent(pathname)?.id).toBe(expectedParent)
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
