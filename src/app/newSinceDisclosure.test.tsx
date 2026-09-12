import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { InMemoryAuthStore } from '../features/auth'
import App from './App'

describe('showcase More-menu disclosure', () => {
  afterEach(cleanup)

  it('keeps deferred New Since hidden and discloses sign-in for the permitted account destination', () => {
    render(
      <MemoryRouter initialEntries={['/more']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.queryByRole('link', { name: /new since your last visit/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /account & privacy.*requires sign-in/i }),
    ).toHaveAttribute('href', '/account/privacy')
    expect(screen.getByRole('link', { name: /^install$/i })).not.toHaveAccessibleName(
      /requires sign-in/i,
    )
  })

  it('keeps deferred New Since hidden without adding a sign-in disclosure for a shopper account', () => {
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

    expect(
      screen.queryByRole('link', { name: /new since your last visit/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^account & privacy$/i })).toHaveAttribute(
      'href',
      '/account/privacy',
    )
  })
})
