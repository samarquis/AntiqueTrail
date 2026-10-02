import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerAcquisitionPage } from './ownerAcquisitionPage'
import {
  assertOwnerAcquisitionCopy,
  OWNER_ACQUISITION_SECTION_ORDER,
} from './ownerAcquisitionContent'
import { demoCatalogClient } from '../catalog/demoClient'
import App from '../../app/App'
afterEach(cleanup)
describe('staged Free owner page', () => {
  it('preserves content order and Free-only copy, and removes its noindex meta on unmount', () => {
    const { container, unmount } = render(
      <MemoryRouter>
        <OwnerAcquisitionPage catalog={demoCatalogClient} />
      </MemoryRouter>,
    )
    expect(
      [...container.querySelectorAll('[data-owner-section]')].map((node) =>
        node.getAttribute('data-owner-section'),
      ),
    ).toEqual(OWNER_ACQUISITION_SECTION_ORDER)
    expect(() => assertOwnerAcquisitionCopy(container.textContent ?? '')).not.toThrow()
    expect(screen.getAllByRole('button', { name: 'Add or claim my store' })).toHaveLength(2)
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    )
    unmount()
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
  it('explains closed intake without collecting contact details or calling search', async () => {
    const list = vi.fn()
    render(
      <MemoryRouter>
        <OwnerAcquisitionPage catalog={{ ...demoCatalogClient, list }} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getAllByRole('button', { name: 'Add or claim my store' })[0])
    expect(screen.getByRole('status')).toHaveTextContent('Store applications are not open yet')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(list).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Find your store first' })).toHaveFocus()
  })
  it('normal application artifact cannot expose the page through a route or query', () => {
    render(
      <MemoryRouter initialEntries={['/for-stores?enabled=true&reviewAs=administrator']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add or claim my store' })).toBeNull()
  })
  it('retains the search on a failed request and clears stale results when editing', async () => {
    const user = userEvent.setup()
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('private internals'))
      .mockResolvedValueOnce({ stores: [] })
    render(
      <MemoryRouter>
        <OwnerAcquisitionPage catalog={{ ...demoCatalogClient, list }} intakeAvailable />
      </MemoryRouter>,
    )
    await user.click(screen.getAllByRole('button', { name: 'Add or claim my store' })[0])
    await user.type(screen.getByLabelText('Public store name'), 'A store')
    await user.click(screen.getByRole('button', { name: 'Search stores' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private internals')
    expect(screen.getByLabelText('Public store name')).toHaveValue('A store')
    await user.click(screen.getByRole('button', { name: 'Search stores' }))
    expect(await screen.findByRole('status')).toHaveTextContent('No matching listing')
    await user.type(screen.getByLabelText('Public store name'), ' changed')
    expect(screen.queryByRole('link', { name: /My store is missing/ })).toBeNull()
  })
})
