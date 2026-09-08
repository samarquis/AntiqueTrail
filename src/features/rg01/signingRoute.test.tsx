import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RG01SigningPage } from './signingRoute'
import type { RG01Client } from './rg01Client'

const runId = '11111111-1111-4111-8111-111111111111'
const challengeId = '33333333-3333-4333-8333-333333333333'

function client(): RG01Client {
  const run = {
    runId,
    state: 'frozen' as const,
    windowStart: '2026-02-06T00:00:00.000Z',
    windowEnd: '2026-08-05T00:00:00.000Z',
    sourceCutoff: '2026-08-05T00:00:00.000Z',
    currentSource: true,
    manifestDigest: 'a'.repeat(64),
    blockers: [],
    metrics: { first_trip_shoppers: 25 },
    receiptId: null,
    receiptStatus: 'none' as const,
    supersedesReceiptId: null,
    supersessionStatus: 'none' as const,
    linkagePurgeDueAt: null,
    purgeStatus: 'not_due' as const,
    linkagePurged: false,
  }
  return {
    status: vi.fn(async () => ({
      collectionEnabled: true,
      permissions: { prepare: false, freeze: false, sign: true },
      run,
      runs: [run],
    })),
    begin: vi.fn(),
    freeze: vi.fn(),
    requestDecision: vi.fn(async () => ({ challengeId, payloadDigest: 'b'.repeat(64) })),
    consumeDecision: vi.fn(async () => ({
      receiptId: '44444444-4444-4444-8444-444444444444',
      state: 'settled',
    })),
  }
}

describe('RG01 signing route', () => {
  it('shows a read-only frozen digest decision without a client signature field', async () => {
    render(
      <MemoryRouter initialEntries={[`/admin/evidence/rg-01/${runId}/sign`]}>
        <RG01SigningPage client={client()} />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { name: /review frozen rg-01 evidence/iu }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/signature/iu)).not.toBeInTheDocument()
  })
})
