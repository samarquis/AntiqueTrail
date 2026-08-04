import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BlockedSendersPage,
  CandidateSessionGuard,
  CapturePage,
  SharesPage,
  TripIdeasPage,
} from './components'
import type { CandidateExtractionOutcome } from './candidateExtraction'
import type { CandidateClient } from './types'

const extracted: CandidateExtractionOutcome = {
  mode: 'suggestions',
  originalLink: 'https://example.com/oak',
  originalNote: '',
  normalizedUrl: 'https://example.com/oak',
  destinationHost: 'example.com',
  suggestions: {
    title: 'Oak Antiques',
    description: null,
    canonicalUrl: null,
    verified: false,
  },
  publicWriteAllowed: false,
}

function client(overrides: Partial<CandidateClient> = {}): CandidateClient {
  return {
    extractCandidate: vi.fn(async () => extracted),
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
    revokeCandidateShare: vi.fn(async () => ({
      accepted: false,
      state: 'closed' as const,
      message: 'Closed',
    })),
    listTripIdeas: vi.fn(async () => []),
    updateTripIdea: vi.fn(async (_ideaId, input) => ({
      id: 'idea-1',
      ownerUserId: 'user-1',
      title: input.title,
      urlNote: input.urlNote,
      version: input.expectedVersion + 1,
    })),
    deleteTripIdea: vi.fn(async () => undefined),
    listBlockedCandidateSenders: vi.fn(async () => []),
    unblockCandidateSender: vi.fn(async () => undefined),
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
      extraction: extracted,
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/saved privately/i)
  })

  it('preserves the submitted link and note when extraction requires manual fallback', async () => {
    const user = userEvent.setup()
    const fallback: CandidateExtractionOutcome = {
      mode: 'manual_fallback',
      reason: 'private_destination',
      originalLink: 'https://internal.example/find',
      originalNote: 'Call before visiting',
      normalizedUrl: 'https://internal.example/find',
      destinationHost: 'internal.example',
      suggestions: {
        title: null,
        description: null,
        canonicalUrl: null,
        verified: false,
      },
      publicWriteAllowed: false,
    }
    const candidateClient = client({ extractCandidate: vi.fn(async () => fallback) })
    render(<CapturePage client={candidateClient} />)
    await user.type(screen.getByLabelText(/store link/i), fallback.originalLink)
    await user.type(screen.getByLabelText(/^title$/i), 'Manual lead')
    await user.type(screen.getByLabelText(/private note/i), fallback.originalNote)
    await user.click(screen.getByRole('button', { name: /save candidate/i }))

    expect(candidateClient.saveCandidate).toHaveBeenCalledWith({
      url: fallback.originalLink,
      title: 'Manual lead',
      note: fallback.originalNote,
      extraction: fallback,
    })
    expect(await screen.findByText(/could not safely read that link/i)).toBeInTheDocument()
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

  it('lets a sender revoke a pending share', async () => {
    const user = userEvent.setup()
    const revokeCandidateShare = vi.fn(async () => ({
      accepted: false,
      state: 'closed' as const,
      message: 'Closed',
    }))
    const candidateClient = client({
      listShares: vi.fn(async () => [
        {
          id: 'share-1',
          direction: 'sent' as const,
          state: 'pending' as const,
          title: 'Oak lead',
          expiresAt: Date.now() + 10_000,
        },
      ]),
      revokeCandidateShare,
    })
    render(
      <MemoryRouter>
        <SharesPage client={candidateClient} />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /revoke/i }))
    expect(revokeCandidateShare).toHaveBeenCalledWith('share-1')
    expect(await screen.findByText(/sent · closed/i)).toBeInTheDocument()
  })

  it('requires explicit confirmation before deleting a Trip Idea', async () => {
    const user = userEvent.setup()
    const deleteTripIdea = vi.fn(async () => undefined)
    const candidateClient = client({
      listTripIdeas: vi.fn(async () => [
        {
          id: 'idea-1',
          ownerUserId: 'user-1',
          title: 'Oak Antiques',
          urlNote: 'https://example.com/oak',
          version: 1,
        },
      ]),
      deleteTripIdea,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<TripIdeasPage client={candidateClient} />)
    const button = await screen.findByRole('button', { name: /delete/i })
    await user.click(button)
    expect(deleteTripIdea).not.toHaveBeenCalled()
    await user.click(button)
    expect(deleteTripIdea).toHaveBeenCalledWith('idea-1', { confirmed: true })
    confirm.mockRestore()
  })

  it('edits a Trip Idea with its current optimistic version', async () => {
    const user = userEvent.setup()
    const updateTripIdea = vi.fn(async (_ideaId, input) => ({
      id: 'idea-1',
      ownerUserId: 'user-1',
      title: input.title,
      urlNote: input.urlNote,
      version: input.expectedVersion + 1,
    }))
    const candidateClient = client({
      listTripIdeas: vi.fn(async () => [
        {
          id: 'idea-1',
          ownerUserId: 'user-1',
          title: 'Oak Antiques',
          urlNote: 'Call first',
          version: 3,
        },
      ]),
      updateTripIdea,
    })
    render(<TripIdeasPage client={candidateClient} />)
    await user.click(await screen.findByRole('button', { name: /edit/i }))
    const title = screen.getByLabelText(/idea title/i)
    await user.clear(title)
    await user.type(title, 'Updated Oak')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(updateTripIdea).toHaveBeenCalledWith('idea-1', {
      title: 'Updated Oak',
      urlNote: 'Call first',
      expectedVersion: 3,
    })
    expect(await screen.findByText('Updated Oak')).toBeInTheDocument()
  })

  it('lists and explicitly unblocks a blocked Candidate sender', async () => {
    const user = userEvent.setup()
    const unblockCandidateSender = vi.fn(async () => undefined)
    const candidateClient = client({
      listBlockedCandidateSenders: vi.fn(async () => [
        {
          blockedUserId: 'sender-1',
          label: 'Blocked sender',
          blockedAt: Date.now(),
        },
      ]),
      unblockCandidateSender,
    })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BlockedSendersPage client={candidateClient} />)
    await user.click(await screen.findByRole('button', { name: /unblock/i }))
    expect(unblockCandidateSender).toHaveBeenCalledWith('sender-1', { confirmed: true })
    expect(await screen.findByText(/no blocked candidate senders/i)).toBeInTheDocument()
    confirm.mockRestore()
  })
})
