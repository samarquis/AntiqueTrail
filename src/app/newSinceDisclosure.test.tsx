import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { InMemoryAuthStore } from '../features/auth'
import App from './App'

describe('New Since More-menu disclosure', () => {
  afterEach(cleanup)

  it('discloses sign-in before a signed-out shopper opens the private destination', () => {
    render(
      <MemoryRouter initialEntries={['/more']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: /new since your last visit.*requires sign-in/i }),
    ).toHaveAttribute('href', '/new-since')
    expect(screen.getByRole('link', { name: /^install$/i })).not.toHaveAccessibleName(
      /requires sign-in/i,
    )
  })

  it('does not add the disclosure for an authenticated shopper', () => {
    const authStore = new InMemoryAuthStore()
    authStore.setSession({
      userId: 'shopper-a',
      accessToken: 'memory-only',
      expiresAt: Date.now() + 60_000,
      role: 'Shopper',
      mfaRequired: false,
      mfaVerified: true,
    })

    render(
      <MemoryRouter initialEntries={['/more']}>
        <App runtime={{ authStore }} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /^new since your last visit$/i })).toHaveAttribute(
      'href',
      '/new-since',
    )
  })
})
