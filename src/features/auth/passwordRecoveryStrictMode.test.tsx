import { StrictMode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { RecoveryPage } from './components'
import { unavailableAuthProvider } from './authClient'
import {
  clearStagedRecoveryToken,
  hasStagedRecoveryToken,
  stageRecoveryToken,
} from './passwordRecoveryClient'
import type { AuthProviderAdapter } from './types'

afterEach(() => {
  cleanup()
  clearStagedRecoveryToken()
})
function replacement(provider: AuthProviderAdapter = unavailableAuthProvider) {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={['/auth/recovery']}>
        <AuthProvider provider={provider}>
          <RecoveryPage provider={provider} />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  )
}
it('retains the in-memory recovery token through StrictMode effect replacement and parent rerender', async () => {
  stageRecoveryToken('synthetic-regression-only')
  const view = render(replacement())
  await Promise.resolve()
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
  expect(hasStagedRecoveryToken()).toBe(true)
  view.rerender(replacement())
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeVisible()
})
it('does not let the previous page cleanup erase a newer callback token', async () => {
  stageRecoveryToken('old-synthetic-token')
  const view = render(replacement())
  view.unmount()
  stageRecoveryToken('new-synthetic-token')
  await Promise.resolve()
  expect(hasStagedRecoveryToken()).toBe(true)
})
it('clears the staged token after an actual replacement-page unmount', async () => {
  stageRecoveryToken('synthetic-regression-only')
  const view = render(replacement())
  view.unmount()
  await Promise.resolve()
  expect(hasStagedRecoveryToken()).toBe(false)
})
it('consumes a successful replacement token once without durable storage or visible disclosure', async () => {
  const completePasswordRecovery = vi.fn<
    NonNullable<AuthProviderAdapter['completePasswordRecovery']>
  >(async () => ({ kind: 'completed' }))
  const provider = { ...unavailableAuthProvider, completePasswordRecovery }
  const user = userEvent.setup()
  const localWrite = vi.spyOn(Storage.prototype, 'setItem')
  stageRecoveryToken('single-use-synthetic-token')
  render(replacement(provider))
  await Promise.resolve()
  await user.type(screen.getByLabelText('New password'), 'Synthetic password 123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Synthetic password 123!')
  await user.click(screen.getByRole('button', { name: 'Set new password' }))
  expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeVisible()
  expect(completePasswordRecovery).toHaveBeenCalledOnce()
  expect(completePasswordRecovery.mock.calls[0]?.[0]).toMatchObject({
    tokenHash: 'single-use-synthetic-token',
  })
  expect(hasStagedRecoveryToken()).toBe(false)
  expect(localWrite).not.toHaveBeenCalled()
  expect(document.body).not.toHaveTextContent('single-use-synthetic-token')
  expect(window.location.href).not.toContain('single-use-synthetic-token')
  localWrite.mockRestore()
})
