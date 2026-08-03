import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReadinessStatusPage } from './components'
import type { DurableReadinessClient } from './types'

afterEach(cleanup)

function client(blockers: string[] = []): DurableReadinessClient {
  return {
    getStatus: vi.fn(async () => ({
      runId: 'run-1',
      state: 'frozen' as const,
      frozenDigest: 'digest',
      blockers,
      calculatedAt: '2026-08-03T00:00:00Z',
      receiptId: null,
    })),
    requestSigningChallenge: vi.fn(async () => ({
      challengeId: 'challenge-1',
      payloadDigest: 'digest',
      expiresAt: '2026-08-03T00:05:00Z',
    })),
  }
}

describe('ReadinessStatusPage', () => {
  it('does not offer signing while service-calculated blockers exist', async () => {
    render(<ReadinessStatusPage runId="run-1" client={client(['missing_evidence'])} />)

    expect(await screen.findByText('missing_evidence')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /signing challenge/i })).not.toBeInTheDocument()
  })

  it('requests only a challenge and explains external provider verification', async () => {
    const readinessClient = client()
    render(<ReadinessStatusPage runId="run-1" client={readinessClient} />)

    fireEvent.click(await screen.findByRole('button', { name: /signing challenge/i }))

    await waitFor(() =>
      expect(readinessClient.requestSigningChallenge).toHaveBeenCalledWith('run-1'),
    )
    expect(await screen.findByText(/configured signing provider/i)).toBeInTheDocument()
  })

  it('fails closed when status cannot be loaded', async () => {
    const unavailable: DurableReadinessClient = {
      getStatus: vi.fn(async () => {
        throw new Error('secret')
      }),
      requestSigningChallenge: vi.fn(),
    }
    render(<ReadinessStatusPage runId="run-1" client={unavailable} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Readiness evidence is unavailable. No readiness decision has been changed.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
