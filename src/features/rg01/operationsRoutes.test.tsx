import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RG01OperationsListPage, RG01OperationsRunPage } from './operationsRoutes'
import type { RG01Client } from './rg01Client'

const runId = '11111111-1111-4111-8111-111111111111'
const run = {
  runId,
  state: 'collecting' as const,
  windowStart: '2026-02-06T00:00:00.000Z',
  windowEnd: '2026-08-05T00:00:00.000Z',
  sourceCutoff: null,
  currentSource: false,
  manifestDigest: null,
  blockers: [],
  metrics: {},
  receiptId: null,
  receiptStatus: 'none' as const,
  supersedesReceiptId: null,
  supersessionStatus: 'none' as const,
  linkagePurgeDueAt: null,
  purgeStatus: 'not_due' as const,
  linkagePurged: false,
}

function client(overrides: Partial<RG01Client> = {}): RG01Client {
  return {
    status: vi.fn(async () => ({
      collectionEnabled: true,
      permissions: { prepare: true, freeze: true, sign: false },
      run,
      runs: [run],
    })),
    begin: vi.fn(async () => ({ runId, state: 'collecting' })),
    freeze: vi.fn(async () => ({ runId, state: 'frozen', blockers: [] })),
    requestDecision: vi.fn(),
    consumeDecision: vi.fn(),
    ...overrides,
  }
}

describe('RG01Operations routes', () => {
  it('loads a bounded list and preserves the selected filter in the exact-run link', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/evidence/rg-01?state=collecting']}>
        <RG01OperationsListPage client={client()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /evidence runs/iu })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: runId })).toHaveAttribute(
      'href',
      `/admin/evidence/rg-01/${runId}?state=collecting`,
    )
  })

  it('keeps the failed calculation state visible and offers Retry', async () => {
    const rg01 = client({ freeze: vi.fn(async () => Promise.reject(new Error('source changed'))) })
    render(
      <MemoryRouter initialEntries={[`/admin/evidence/rg-01/${runId}`]}>
        <RG01OperationsRunPage client={rg01} />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /freeze current calculation/iu }),
      ).toBeInTheDocument(),
    )
    screen.getByRole('button', { name: /freeze current calculation/iu }).click()
    expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/iu)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
