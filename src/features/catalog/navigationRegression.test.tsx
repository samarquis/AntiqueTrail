import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CatalogLink } from './shared'

describe('catalog internal navigation', () => {
  it('changes routes in the existing document through the router', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <Routes>
          <Route path="/stores" element={<CatalogLink to="/stores/oak">Oak details</CatalogLink>} />
          <Route path="/stores/oak" element={<h1>Oak details page</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('link', { name: 'Oak details' }))
    expect(screen.getByRole('heading', { name: 'Oak details page' })).toBeVisible()
  })
})
