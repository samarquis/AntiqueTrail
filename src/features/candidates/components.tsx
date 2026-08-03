import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  GENERIC_CANDIDATE_ERROR,
  unavailableCandidateClient,
  validateCandidateInput,
} from './candidateClient'
import type { CandidateClient, CandidateShareView, TripIdea } from './types'

export function CandidateSessionGuard({
  userId,
  children,
}: {
  userId?: string | null
  children: ReactNode
}) {
  if (!userId) return <Navigate to="/auth/sign-in?returnTo=%2Fcapture" replace />
  return <>{children}</>
}

function CandidateCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="candidate-heading">
        <p className="eyebrow">Private candidates</p>
        <h1 id="candidate-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function CandidateError() {
  return <p role="alert">{GENERIC_CANDIDATE_ERROR}</p>
}

export function CapturePage({ client = unavailableCandidateClient }: { client?: CandidateClient }) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const errors = validateCandidateInput({ url, title, note })
    if (errors.length) {
      setError(errors)
      return
    }
    setError([])
    try {
      await client.saveCandidate({ url, title: title.trim(), note })
      setStatus('Candidate saved privately.')
    } catch {
      setError([GENERIC_CANDIDATE_ERROR])
    }
  }
  return (
    <CandidateCard
      title="Save a candidate"
      description="Keep a store link private while you decide what to do next."
    >
      <form onSubmit={submit}>
        <label htmlFor="candidate-url">Store link</label>
        <input
          id="candidate-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        <label htmlFor="candidate-title">Title</label>
        <input
          id="candidate-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          required
        />
        <label htmlFor="candidate-note">Private note (optional)</label>
        <textarea
          id="candidate-note"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        {error.map((item) => (
          <p role="alert" key={item}>
            {item}
          </p>
        ))}
        {status && <p role="status">{status}</p>}
        <button className="button" type="submit">
          Save candidate
        </button>
      </form>
    </CandidateCard>
  )
}

function ShareActions({
  share,
  userId,
  client,
  onChanged,
}: {
  share: CandidateShareView
  userId: string
  client: CandidateClient
  onChanged: (next: CandidateShareView) => void
}) {
  const [error, setError] = useState(false)
  async function act(action: 'acceptShare' | 'dismissShare' | 'blockShare' | 'reportShare') {
    try {
      const result = await client[action](userId, share.id)
      onChanged({ ...share, state: result.state })
    } catch {
      setError(true)
    }
  }
  if (share.direction !== 'received' || share.state !== 'pending')
    return error ? <CandidateError /> : null
  return (
    <div>
      <button type="button" onClick={() => void act('acceptShare')}>
        Accept
      </button>{' '}
      <button type="button" onClick={() => void act('dismissShare')}>
        Dismiss
      </button>{' '}
      <button type="button" onClick={() => void act('blockShare')}>
        Block
      </button>{' '}
      <button type="button" onClick={() => void act('reportShare')}>
        Report
      </button>
      {error && <CandidateError />}
    </div>
  )
}

export function SharesPage({
  userId = '',
  client = unavailableCandidateClient,
}: {
  userId?: string
  client?: CandidateClient
}) {
  const [shares, setShares] = useState<CandidateShareView[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    client
      .listShares(userId)
      .then(setShares)
      .catch(() => setError(true))
  }, [client, userId])
  return (
    <CandidateCard
      title="Candidate shares"
      description="Sent shares show only Pending, Accepted, or Closed. Received shares have explicit actions."
    >
      {error ? (
        <CandidateError />
      ) : shares === null ? (
        <p role="status">Loading shares…</p>
      ) : shares.length === 0 ? (
        <p>No pending shares.</p>
      ) : (
        <ul aria-label="Candidate shares">
          {shares.map((share) => (
            <li key={share.id}>
              <Link to={`/shares/${share.id}`}>{share.title}</Link> — {share.direction} ·{' '}
              {share.state}
              <ShareActions
                share={share}
                userId={userId}
                client={client}
                onChanged={(next) =>
                  setShares(shares.map((item) => (item.id === next.id ? next : item)))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </CandidateCard>
  )
}

export function ShareDetailsPage({
  userId = '',
  client = unavailableCandidateClient,
}: {
  userId?: string
  client?: CandidateClient
}) {
  const { shareId = '' } = useParams()
  const [share, setShare] = useState<CandidateShareView | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    client
      .getShare(userId, shareId)
      .then(setShare)
      .catch(() => setError(true))
  }, [client, shareId, userId])
  return (
    <CandidateCard
      title="Candidate share"
      description="Recipient actions close or accept only this private share."
    >
      {error ? (
        <CandidateError />
      ) : !share ? (
        <p role="status">Loading share…</p>
      ) : (
        <>
          <p>
            {share.title} · {share.direction} · {share.state}
          </p>
          <ShareActions share={share} userId={userId} client={client} onChanged={setShare} />
        </>
      )}
    </CandidateCard>
  )
}

export function TripIdeasPage({
  userId = '',
  client = unavailableCandidateClient,
}: {
  userId?: string
  client?: CandidateClient
}) {
  const [ideas, setIdeas] = useState<TripIdea[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    client
      .listTripIdeas(userId)
      .then(setIdeas)
      .catch(() => setError(true))
  }, [client, userId])
  async function remove(id: string) {
    try {
      await client.deleteTripIdea(userId, id)
      setIdeas((current) => current?.filter((idea) => idea.id !== id) ?? current)
    } catch {
      setError(true)
    }
  }
  return (
    <CandidateCard
      title="Trip ideas"
      description="Trip ideas are private recipient-owned copies. Sender edits never change them."
    >
      {error && <CandidateError />}
      {ideas === null ? (
        <p role="status">Loading trip ideas…</p>
      ) : ideas.length === 0 ? (
        <p>Your private trip ideas will appear here.</p>
      ) : (
        <ul>
          {ideas.map((idea) => (
            <li key={idea.id}>
              <strong>{idea.title}</strong> — {idea.urlNote}{' '}
              <button type="button" onClick={() => void remove(idea.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </CandidateCard>
  )
}
