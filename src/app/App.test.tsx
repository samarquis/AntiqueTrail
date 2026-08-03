import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('app shell', () => {
  it('renders the browse route with a skip-free accessible heading', () => {
    render(
      <MemoryRouter initialEntries={['/stores']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /browse stores/i })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
  })

  it('fails the unavailable admin boundary closed without a role bypass', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: /review queue/i })).not.toBeInTheDocument()
  })
})
