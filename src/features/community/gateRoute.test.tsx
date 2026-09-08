import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CommunityGateRoute } from './gateRoute'
import type { CommunityGateClient } from './gateClient'

const packet = {
  runId: 'run-1',
  areaId: 'osage-city',
  areaName: 'Osage City',
  version: 4,
  frozenEvidenceDigest: '00'.repeat(32),
  predicateOutcomes: { monitoring: false, voluntaryShopperTripConfirmations: 4 },
  failureCodes: ['monitoring'],
  priorDecision: null,
}

describe('community gate route', () => {
  it('shows failed predicates and keeps the real detail link', async () => {
    const client: CommunityGateClient = {
      packet: async () => packet,
      request: vi.fn(),
      decide: vi.fn(),
    }
    render(
      <MemoryRouter initialEntries={['/admin/communities/run-1/gate']}>
        <Routes>
          <Route
            path="/admin/communities/:runId/gate"
            element={<CommunityGateRoute client={client} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    await act(async () => undefined)
    expect(
      await screen.findByRole('heading', { name: 'Community Expansion Gate' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Gate predicate outcomes' })).toHaveTextContent(
      'monitoring: false',
    )
    expect(screen.getByRole('link', { name: 'Back to run' })).toHaveAttribute(
      'href',
      '/admin/communities/run-1',
    )
  })
})
