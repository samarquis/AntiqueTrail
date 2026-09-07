import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BreakGlassReviewRoute, type BreakGlassReviewClient } from './breakGlassReviewRoute'

const token = 'A'.repeat(43)
const reviewPacket = {
  incidentId: 'INC-1',
  severity: 'high',
  requestingActor: 'actor-1',
  approvals: [],
  reason: 'Emergency support',
  authorizedScope: 'field-x',
  queries: ['read'],
  recordCounts: [1],
  startedAt: '2026-09-07T10:00:00Z',
  expiresAt: '2026-09-07T10:30:00Z',
  accessResults: ['denied'],
  noticeStatus: 'sent',
  auditChainHash: 'a'.repeat(64),
  packetHash: 'b'.repeat(64),
  reviewDueAt: '2026-09-08T10:30:00Z',
}

function client(): BreakGlassReviewClient {
  return {
    getPacket: vi.fn(async () => reviewPacket),
    requestAssertion: vi.fn(),
    completeAssertion: vi.fn(),
    submit: vi.fn(),
  }
}

describe('BreakGlassReviewRoute', () => {
  it('loads the exact packet route without normal navigation', async () => {
    render(<BreakGlassReviewRoute token={token} client={client()} />)
    await waitFor(() => expect(screen.getByText(/INC-1/u)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /verify identity/iu })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/stores')
  })

  it('shows a generic terminal failure for missing or invalid capability', () => {
    render(<BreakGlassReviewRoute token={null} client={client()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid, expired, or unavailable/iu)
  })
})
