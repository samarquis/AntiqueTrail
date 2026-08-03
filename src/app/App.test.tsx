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

  it('exposes partner onboarding routes while keeping provider access gated', async () => {
    render(
      <MemoryRouter initialEntries={['/partner/verify']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /create and verify account/i })).toBeInTheDocument()
    expect(
      screen.getByText(/provider email verification is intentionally disabled/i),
    ).toBeInTheDocument()
  })

  it('keeps Internal Alpha readiness unavailable until an approved test account exists', async () => {
    render(
      <MemoryRouter initialEntries={['/alpha/readiness']}>
        <App />
      </MemoryRouter>,
    )
    expect(
      (await screen.findAllByRole('heading', { name: /browse stores/i })).length,
    ).toBeGreaterThan(0)
    expect(
      screen.queryByRole('heading', { name: /synthetic internal alpha/i }),
    ).not.toBeInTheDocument()
  })
})
