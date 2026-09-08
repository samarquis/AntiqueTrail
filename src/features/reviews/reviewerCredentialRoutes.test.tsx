import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import {
  ReviewerCredentialManagementRoute,
  ReviewerCredentialSetupRoute,
} from './reviewerCredentialRoutes'
import type { ReviewerCredentialClient } from './reviewerCredentialClient'
import { createReviewerBrowserCeremony } from './reviewerCredentialBrowser'

vi.mock('./reviewerCredentialBrowser', async () => {
  const actual = await vi.importActual<typeof import('./reviewerCredentialBrowser')>(
    './reviewerCredentialBrowser',
  )
  return {
    ...actual,
    createReviewerBrowserCeremony: vi.fn(async () => ({
      credentialId: 'raw-id',
      clientDataJSON: 'client-data',
      attestationObject: 'attestation',
      authenticatorData: 'authenticator',
      signature: 'signature',
    })),
  }
})

const token = 'A'.repeat(43)
const challenge = {
  challengeId: '11111111-1111-4111-8111-111111111111',
  challenge: 'aa'.repeat(32),
  rpId: 'localhost',
  origin: 'http://localhost',
  expiresAt: '2026-09-07T12:00:00Z',
  state: 'pending' as const,
  allowCredentials: [{ id: 'raw-id', type: 'public-key' as const }],
}

function setupClient(): ReviewerCredentialClient {
  let registrationCount = 0
  return {
    requestRegistration: vi.fn(async () => ({
      ...challenge,
      registrationCompletedCount: registrationCount,
    })),
    completeRegistration: vi.fn(async () => {
      registrationCount += 1
      return {
        credentialRecordId: `${registrationCount}`,
        state: registrationCount === 2 ? 'active' : 'pending',
      }
    }),
    requestAssertion: vi.fn(async () => challenge),
    completeAssertion: vi.fn(async () => ({ assertionReceiptId: 'receipt-1' })),
    list: vi.fn(async () => ({
      credentials: [
        { credentialRecordId: 'credential-1', state: 'active', verifiedAt: '2026-09-07T10:00:00Z' },
      ],
    })),
    revoke: vi.fn(async () => ({ state: 'revoked', reviewerState: 'disabled' })),
  }
}

describe('reviewer credential routes', () => {
  it('does not claim activation until two distinct registration completions finish', async () => {
    const client = setupClient()
    render(
      <MemoryRouter>
        <ReviewerCredentialSetupRoute token={token} client={client} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /add first security key/iu }))
    await waitFor(() =>
      expect(screen.getByText(/security keys added: 1 of 2/iu)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('link', { name: 'Finish' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add backup security key/iu }))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Finish' })).toBeInTheDocument())
    expect(client.completeRegistration).toHaveBeenCalledTimes(2)
  })

  it('requires a fresh assertion before listing and again before revoking', async () => {
    const client = setupClient()
    render(
      <MemoryRouter>
        <ReviewerCredentialManagementRoute token={token} client={client} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Verify identity' }))
    await waitFor(() => expect(screen.getByText(/security key added/iu)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(screen.getByText(/security key revoked/iu)).toBeInTheDocument())
    expect(client.requestAssertion).toHaveBeenCalledTimes(2)
    expect(client.completeAssertion).toHaveBeenCalledTimes(2)
    expect(client.list).toHaveBeenCalledTimes(1)
    expect(client.revoke).toHaveBeenCalledWith(token, 'credential-1', expect.any(String))
  })

  it('reuses the pending registration idempotency key after a cancelled browser ceremony', async () => {
    const client = setupClient()
    const browserCeremony = vi.mocked(createReviewerBrowserCeremony)
    browserCeremony.mockRejectedValueOnce(new Error('cancelled'))
    render(
      <MemoryRouter>
        <ReviewerCredentialSetupRoute token={token} client={client} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /add first security key/iu }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(screen.getByText(/security keys added: 1 of 2/iu)).toBeInTheDocument(),
    )
    const requestRegistration = vi.mocked(client.requestRegistration)
    expect(requestRegistration).toHaveBeenCalledTimes(2)
    expect(requestRegistration.mock.calls[0]?.[1]).toBe(requestRegistration.mock.calls[1]?.[1])
  })

  it('shows the same generic terminal state without a scrubbed capability', () => {
    render(
      <MemoryRouter>
        <ReviewerCredentialSetupRoute token={null} client={setupClient()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid, expired, or unavailable/iu)
  })
})
