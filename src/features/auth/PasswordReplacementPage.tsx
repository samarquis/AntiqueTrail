import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import {
  clearStagedRecoveryToken,
  isValidRecoveryPassword,
  PASSWORD_RECOVERY_ERROR,
  PASSWORD_RECOVERY_LENGTH_ERROR,
  PASSWORD_RECOVERY_MAX_LENGTH,
  PASSWORD_RECOVERY_MISMATCH_ERROR,
  PASSWORD_RECOVERY_MIN_LENGTH,
  PASSWORD_RECOVERY_SUCCESS,
  takeStagedRecoveryToken,
} from './passwordRecoveryClient'
import type { AuthProviderAdapter } from './types'

export function PasswordReplacementPage({
  provider,
  returnTo,
}: {
  provider: AuthProviderAdapter
  returnTo: string
}) {
  const { session, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [completed, setCompleted] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const sessionRef = useRef(session)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => clearStagedRecoveryToken, [])
  useEffect(() => {
    sessionRef.current = session
  }, [session])
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!isValidRecoveryPassword(password)) {
      setError(PASSWORD_RECOVERY_LENGTH_ERROR)
      return
    }
    if (password !== confirmation) {
      setError(PASSWORD_RECOVERY_MISMATCH_ERROR)
      return
    }
    const tokenHash = takeStagedRecoveryToken()
    if (!tokenHash || !provider.completePasswordRecovery) {
      setError(PASSWORD_RECOVERY_ERROR)
      return
    }
    setPending(true)
    setError(null)
    requestIdRef.current ??= crypto.randomUUID()
    const submittedSession = sessionRef.current
    try {
      const result = await provider.completePasswordRecovery({
        tokenHash,
        password,
        requestId: requestIdRef.current,
      })
      if (result.kind !== 'completed') {
        setError(PASSWORD_RECOVERY_ERROR)
        return
      }
      setPassword('')
      setConfirmation('')
      setCompleted(true)
      const currentSession = sessionRef.current
      if (
        submittedSession &&
        currentSession?.userId === submittedSession.userId &&
        currentSession.accessToken === submittedSession.accessToken
      )
        await signOut().catch(() => undefined)
    } catch {
      setError(PASSWORD_RECOVERY_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (completed)
    return (
      <AuthCardReplacement title="Password updated" description="Your recovery is complete.">
        <p role="status" aria-live="polite">
          {PASSWORD_RECOVERY_SUCCESS}
        </p>
        <Link
          className="button"
          to={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          replace
        >
          Sign in
        </Link>
      </AuthCardReplacement>
    )

  return (
    <AuthCardReplacement
      title="Set a new password"
      description="Choose a new password for your Antique Trail account."
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor="recovery-new-password">New password</label>
        <input
          id="recovery-new-password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_RECOVERY_MIN_LENGTH}
          maxLength={PASSWORD_RECOVERY_MAX_LENGTH}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby="recovery-password-requirements"
          required
        />
        <p id="recovery-password-requirements">Use 12 through 128 characters.</p>
        <label htmlFor="recovery-confirm-password">Confirm new password</label>
        <input
          id="recovery-confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_RECOVERY_MIN_LENGTH}
          maxLength={PASSWORD_RECOVERY_MAX_LENGTH}
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value)
            setError(null)
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'recovery-error-summary' : undefined}
          required
        />
        {error && (
          <div
            id="recovery-error-summary"
            className="error-summary"
            ref={errorRef}
            role="alert"
            tabIndex={-1}
          >
            <h2>There is a problem</h2>
            <p>{error}</p>
          </div>
        )}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Updating password…' : 'Set new password'}
        </button>
      </form>
      <p>
        <Link to={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          Cancel and sign in
        </Link>
      </p>
      <p className="visually-hidden" aria-live="polite">
        {pending ? 'Updating password…' : ''}
      </p>
    </AuthCardReplacement>
  )
}

function AuthCardReplacement({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  return (
    <main>
      <section className="page-card" aria-labelledby="recovery-heading">
        <p className="eyebrow">Antique Trail account</p>
        <h1 id="recovery-heading" ref={headingRef} tabIndex={-1}>
          {title}
        </h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}
