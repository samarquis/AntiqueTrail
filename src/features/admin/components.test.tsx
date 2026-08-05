import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient } from './adminClient'
import { AccessSafetyPage, ReviewQueuePage } from './components'

afterEach(cleanup)

function client(overrides: Partial<AdminClient> = {}): AdminClient {
  return {
    listCases: async () => [
      {
        id: 'case-1',
        caseType: 'store_change',
        targetKind: 'store_controlled_change',
        storeLabel: 'Prairie Clockworks',
        state: 'claimed',
        version: 3,
        createdAt: '2026-08-05T12:00:00Z',
      },
    ],
    getCase: async () => ({
      id: 'case-1',
      caseType: 'store_change',
      targetKind: 'store_controlled_change',
      storeLabel: 'Prairie Clockworks',
      state: 'claimed',
      version: 3,
      createdAt: '2026-08-05T12:00:00Z',
      immutableSubmission: true,
      context: { field: 'name', requestedValue: 'Prairie Clockworks Antiques' },
      allowedActions: ['approve', 'return', 'reject'],
      audit: [],
    }),
    decideCase: async () => ({ id: 'case-1', state: 'approved', version: 4 }),
    listStoreGrants: async () => [
      {
        grantId: 'grant-1',
        subjectUserId: 'rep-1',
        subjectLabel: 'Store representative',
        storeId: 'store-1',
        storeLabel: 'Prairie Clockworks',
        state: 'active',
        version: 1,
      },
    ],
    changeStoreScope: async () => ({ grantId: 'grant-1', state: 'revoked', version: 2 }),
    previewDuplicateMerge: async () => {
      throw new Error('not used')
    },
    executeDuplicateMerge: async () => {
      throw new Error('not used')
    },
    rollbackDuplicateMerge: async () => {
      throw new Error('not used')
    },
    ...overrides,
  }
}

describe('Administrator workspace', () => {
  it('shows exact immutable case context and decides one case without a bulk action', async () => {
    const decideCase = vi.fn(async () => ({ id: 'case-1', state: 'approved' as const, version: 4 }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <ReviewQueuePage client={client({ decideCase })} />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /review prairie clockworks/i }))
    expect(await screen.findByText('Prairie Clockworks Antiques')).toBeInTheDocument()
    expect(screen.getByText(/submitted fields are read-only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve all/i })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/decision reason/i), 'Owner authority verified')
    await user.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(decideCase).toHaveBeenCalledWith(
      'case-1',
      'approve',
      'Owner authority verified',
      3,
      expect.stringMatching(/^admin-case-1-3-/),
    )
  })

  it('shows and revokes one exact representative store scope', async () => {
    const changeStoreScope = vi.fn(async () => ({
      grantId: 'grant-1',
      state: 'revoked' as const,
      version: 2,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client({ changeStoreScope })} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Prairie Clockworks')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /revoke prairie clockworks scope/i }))
    expect(changeStoreScope).toHaveBeenCalledWith(
      'revoke',
      'rep-1',
      'store-1',
      1,
      'administrator_revoked',
      expect.stringMatching(/^admin-scope-grant-1-1-/),
    )
  })

  it('grants a named representative only the entered exact store scope', async () => {
    const changeStoreScope = vi.fn(async () => ({
      grantId: 'grant-new',
      state: 'active' as const,
      version: 1,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client({ changeStoreScope })} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/representative user id/i), 'rep-2')
    await user.type(screen.getByLabelText(/store id for new scope/i), 'store-2')
    await user.click(screen.getByRole('button', { name: /grant exact store scope/i }))
    expect(changeStoreScope).toHaveBeenCalledWith(
      'grant',
      'rep-2',
      'store-2',
      0,
      'authority_verified',
      expect.stringMatching(/^admin-scope-new-/),
    )
  })

  it('previews one duplicate merge before execution and never offers authority reparenting', async () => {
    const previewDuplicateMerge = vi.fn(async () => ({
      proposalId: 'proposal-1',
      canonicalStoreId: 'store-1',
      duplicateStoreId: 'store-2',
      canonicalLabel: 'Prairie Clockworks',
      duplicateLabel: 'Prairie Clock Works',
      safeReferences: 4,
      quarantinedConflicts: 2,
      authorityReparented: false as const,
      state: 'previewed' as const,
      version: 1,
    }))
    const executeDuplicateMerge = vi.fn(async () => ({
      ...(await previewDuplicateMerge()),
      state: 'executed' as const,
      version: 2,
    }))
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccessSafetyPage client={client({ previewDuplicateMerge, executeDuplicateMerge })} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText(/canonical store id/i), 'store-1')
    await user.type(screen.getByLabelText(/duplicate store id/i), 'store-2')
    await user.click(screen.getByRole('button', { name: /preview duplicate merge/i }))
    expect(await screen.findByText(/representative authority will not move/i)).toBeInTheDocument()
    expect(screen.getByText(/2 conflicts will remain quarantined/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /execute this merge/i }))
    expect(executeDuplicateMerge).toHaveBeenCalledWith(
      'proposal-1',
      1,
      expect.stringMatching(/^admin-merge-proposal-1-1-/),
    )
  })
})
