import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CommunityPreparationRoutes } from './preparationRoutes'
import type { CommunityPreparationClient } from './preparationClient'

const run = {
  runId: 'run-1',
  areaId: 'osage-city',
  areaName: 'Osage City',
  targetOrdinal: 1,
  attemptSequence: 1,
  state: 'live' as const,
  version: 4,
  expectedRootVersion: 5,
  artifactDigest: '00'.repeat(32),
  storeSetDigest: '11'.repeat(32),
  readinessStatus: 'signed' as const,
  receipts: {},
}
const client: CommunityPreparationClient = {
  list: async () => ({
    status: 'available',
    root: {
      expectedVersion: 5,
      lastActivationOrdinal: 1,
      lastAttemptSequence: 1,
      activeRunId: null,
    },
    runs: [run],
  }),
  detail: async () => ({
    status: 'available',
    root: {
      expectedVersion: 5,
      lastActivationOrdinal: 1,
      lastAttemptSequence: 1,
      activeRunId: null,
    },
    runs: [run],
  }),
  prepare: async () => ({}),
  freeze: async () => ({}),
  requestSign: async () => ({ capabilityId: 'cap', payloadDigest: '00'.repeat(32), expiresAt: '' }),
  sign: async () => ({}),
  cancel: async () => ({}),
}

describe('community preparation routes', () => {
  it('renders the selected run and preserves the list filter on Back', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/communities/run-1?state=live']}>
        <Routes>
          <Route
            path="/admin/communities/:runId"
            element={<CommunityPreparationRoutes client={client} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await act(async () => undefined)
    expect(await screen.findByRole('heading', { name: 'Osage City' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Communities' })).toHaveAttribute(
      'href',
      '/admin/communities?state=live',
    )
  })
})
