import type { ReactNode } from 'react'
import { Navigate, Link } from 'react-router-dom'

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

export function CapturePage() {
  return (
    <main>
      <a href="/more">← Back</a>
      <h1>Save a candidate</h1>
      <p>Keep a store link private while you decide what to do next.</p>
      <form>
        <label htmlFor="candidate-url">Store link</label>
        <input id="candidate-url" type="url" inputMode="url" />
        <label htmlFor="candidate-title">Title</label>
        <input id="candidate-title" />
        <label htmlFor="candidate-note">Note</label>
        <textarea id="candidate-note" />
        <button type="submit">Save candidate</button>
      </form>
    </main>
  )
}

export function SharesPage() {
  return (
    <main>
      <Link to="/more">← Back</Link>
      <h1>Candidate shares</h1>
      <p>No pending shares.</p>
    </main>
  )
}

export function ShareDetailsPage() {
  return (
    <main>
      <Link to="/shares">← Back to shares</Link>
      <h1>Candidate share</h1>
      <p>This share is not available.</p>
    </main>
  )
}

export function TripIdeasPage() {
  return (
    <main>
      <Link to="/more">← Back</Link>
      <h1>Trip ideas</h1>
      <p>Your private trip ideas will appear here.</p>
    </main>
  )
}
