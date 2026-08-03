import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CandidateSessionGuard, CapturePage, SharesPage } from './components'
import type { CandidateClient } from './types'

function client(overrides: Partial<CandidateClient> = {}): CandidateClient {
  return {
    saveCandidate: vi.fn(async () => ({
      id: 'candidate-1',
      ownerUserId: 'user-1',
      normalizedUrl: 'https://example.com',
      destinationHost: 'example.com',
      title: 'Oak',
      note: '',
      provenance: 'url' as const,
      extractionState: 'saved' as const,
      version: 1,
    })),
    listShares: vi.fn(async () => [
      {
        id: 'share-1',
        direction: 'received' as const,
        state: 'pending' as const,
        title: 'Oak lead',
        expiresAt: Date.now() + 10000,
      },
    ]),
    getShare: vi.fn(async () => null),
    sendShare: vi.fn(async () => ({
      accepted: false,
      state: 'pending' as const,
      message: 'Pending',
    })),
    acceptShare: vi.fn(async () => ({
      accepted: true,
      state: 'accepted' as const,
      message: 'Accepted',
    })),
    dismissShare: vi.fn(async () => ({
      accepted: false,
      state: 'closed' as const,
      message: 'Closed',
    })),
    blockShare: vi.fn(async () => ({
      accepted: false,
      state: 'closed' as const,
      message: 'Closed',
    })),
    reportShare: vi.fn(async () => ({
      accepted: false,
      state: 'closed' as const,
      message: 'Closed',
    })),
    listTripIdeas: vi.fn(async () => []),
    deleteTripIdea: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('candidate private routes', () => {
  afterEach(() => {
    cleanup()
  })

  it('redirects anonymous users to sign-in without rendering candidate data', () => {
    render(
      <MemoryRouter initialEntries={['/capture']}>
        <Routes>
          <Route
            path="/capture"
            element={
              <CandidateSessionGuard>
                <CapturePage />
              </CandidateSessionGuard>
            }
          />
          <Route path="/auth/sign-in" element={<h1>Sign in</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Save a candidate' })).not.toBeInTheDocument()
  })

  it('renders capture only for an authenticated owner', () => {
    render(
      <MemoryRouter>
        <CandidateSessionGuard userId="user-1">
          <CapturePage />
        </CandidateSessionGuard>
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Save a candidate' })).toBeInTheDocument()
  })

  it('saves a normalized private candidate through the client boundary', async () => {
    const user = userEvent.setup()
    const candidateClient = client()
    render(<CapturePage client={candidateClient} />)
    await user.type(screen.getByLabelText(/store link/i), 'https://example.com/oak')
    await user.type(screen.getByLabelText(/^title$/i), 'Oak Antiques')
    await user.click(screen.getByRole('button', { name: /save candidate/i }))
    expect(candidateClient.saveCandidate).toHaveBeenCalledWith({
      url: 'https://example.com/oak',
      title: 'Oak Antiques',
      note: '',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved privately/i)
  })

  it('sends a private share only after the candidate is saved', async () => {
    const user = userEvent.setup()
    const candidateClient = client()
    render(<CapturePage client={candidateClient} />)
    await user.type(screen.getByLabelText(/store link/i), 'https://example.com/oak')
    await user.type(screen.getByLabelText(/^title$/i), 'Oak Antiques')
    await user.click(screen.getByRole('button', { name: /save candidate/i }))
    await user.type(await screen.findByLabelText(/recipient email/i), ' RECIPIENT@Example.COM ')
    await user.click(screen.getByRole('button', { name: /send private share/i }))
    expect(candidateClient.sendShare).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      recipientEmail: 'recipient@example.com',
    })
    expect(await screen.findByText(/share sent/i)).toBeInTheDocument()
  })

  it('shows explicit recipient actions and sends state transitions through the client', async () => {
    const user = userEvent.setup()
    const candidateClient = client()
    render(
      <MemoryRouter>
        <SharesPage client={candidateClient} />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /accept/i }))
    expect(candidateClient.acceptShare).toHaveBeenCalledWith('share-1')
  })
})
