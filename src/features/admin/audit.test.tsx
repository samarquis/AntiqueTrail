import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import { AdminAuditProvider } from './auditContext'
import { AdminAuditRoutes, RecordAuditPage, ViewAuditButton } from './audit'
import { createAdminClient, unavailableAdminClient, type AdminClient } from './adminClient'
import { GENERIC_ADMIN_FAILURE } from './boundary'

afterEach(cleanup)

function mount(client: AdminClient, path = '/admin') {
  const audit = <RecordAuditPage client={client} />
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AdminAuditProvider>
          <AdminAuditRoutes audit={audit}>
            <Route
              path="/admin"
              element={
                <main>
                  <label>
                    Decision reason
                    <textarea />
                  </label>
                  <ViewAuditButton
                    access="opaque-reference"
                    label="Selected store"
                    returnTo="/admin"
                  />
                </main>
              }
            />
            <Route path="/admin/audit" element={audit} />
          </AdminAuditRoutes>
        </AdminAuditProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

it('denies a direct audit route without calling the server', () => {
  const readAudit = vi.fn()
  mount({ ...unavailableAdminClient, readAudit }, '/admin/audit?record=guessed')
  expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_ADMIN_FAILURE)
  expect(readAudit).not.toHaveBeenCalled()
})

it('reads only the selected reference and restores the original draft and focus', async () => {
  const readAudit = vi
    .fn()
    .mockResolvedValue([
      { action: 'case_claimed', outcome: 'completed', occurredAt: '2026-09-01T10:00:00Z' },
    ])
  mount({ ...unavailableAdminClient, readAudit })
  await userEvent.type(screen.getByLabelText('Decision reason'), 'Preserve this reason')
  await userEvent.click(screen.getByRole('button', { name: 'View Audit for Selected store' }))
  await screen.findByText('case claimed — completed')
  expect(readAudit).toHaveBeenCalledWith('opaque-reference')
  expect(screen.getByRole('heading', { name: 'View Audit' })).toHaveFocus()
  await userEvent.click(screen.getByRole('link', { name: 'Back to Review' }))
  expect(screen.getByLabelText('Decision reason')).toHaveValue('Preserve this reason')
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'View Audit for Selected store' })).toHaveFocus(),
  )
})

it('shows loading, generic failure, retry, and an honest empty result', async () => {
  let reject!: (error: Error) => void
  const readAudit = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    .mockResolvedValueOnce([])
  mount({ ...unavailableAdminClient, readAudit })
  await userEvent.click(screen.getByRole('button', { name: /View Audit/ }))
  expect(screen.getByRole('status')).toHaveTextContent('Loading record audit')
  reject(new Error('private server detail'))
  expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_ADMIN_FAILURE)
  expect(screen.queryByText('private server detail')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Retry audit' }))
  expect(await screen.findByRole('status')).toHaveTextContent('No audit events')
})

it('uses the one-reference RPC and masks transport failures', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockRejectedValueOnce(new Error('database details'))
  const client = createAdminClient({ rpc })
  await expect(client.readAudit('reference')).resolves.toEqual([])
  expect(rpc).toHaveBeenCalledWith('admin_read_record_audit', { p_access: 'reference' })
  await expect(client.readAudit('reference')).rejects.toThrow(GENERIC_ADMIN_FAILURE)
})
