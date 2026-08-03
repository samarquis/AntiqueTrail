import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  GENERIC_MFA_ERROR,
  GENERIC_RECOVERY_MESSAGE,
  GENERIC_SIGN_IN_ERROR,
  toAuthSession,
} from './authClient'
import { useAuth } from './AuthContext'
import type { AuthProviderAdapter, ProviderSession } from './types'

function AuthCard({
  children,
  title,
  description,
}: {
  children: ReactNode
  title: string
  description: string
}) {
  return (
    <main>
      <section className="page-card" aria-labelledby="auth-heading">
        <p className="eyebrow">Antique Trail account</p>
        <h1 id="auth-heading">{title}</h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

export function SignInPage({ provider }: { provider: AuthProviderAdapter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'))

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const result = await provider.signIn(email.trim(), password)
      if (result.kind === 'error') {
        setError(GENERIC_SIGN_IN_ERROR)
      } else if (result.kind === 'mfa_required') {
        navigate('/auth/mfa', {
          state: { challengeId: result.challengeId, providerSession: result.session, returnTo },
        })
      } else {
        await signIn(toAuthSession(result.session))
        navigate(returnTo, { replace: true })
      }
    } catch {
      setError(GENERIC_SIGN_IN_ERROR)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title="Sign in" description="Use your verified email and password to continue.">
      <form onSubmit={submit} noValidate>
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <a href={`/auth/recovery${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
          Forgot your password?
        </a>
      </p>
    </AuthCard>
  )
}

export function RecoveryPage({ provider }: { provider: AuthProviderAdapter }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await provider.sendRecovery(email.trim())
    } finally {
      setSent(true)
      setPending(false)
    }
  }
  return (
    <AuthCard
      title="Recover your account"
      description="Enter your email and we’ll help you get back in."
    >
      {sent ? (
        <p role="status">{GENERIC_RECOVERY_MESSAGE}</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="recovery-email">Email</label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send recovery email'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export function MfaPage({ provider }: { provider: AuthProviderAdapter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const state = location.state as {
    challengeId?: string
    providerSession?: ProviderSession
    returnTo?: string
  } | null
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const session = state?.challengeId ? await provider.verifyMfa(state.challengeId, code) : null
      if (!session) setError(GENERIC_MFA_ERROR)
      else {
        await signIn(toAuthSession(session, { mfaVerified: true }))
        navigate(state?.returnTo || '/stores', { replace: true })
      }
    } catch {
      setError(GENERIC_MFA_ERROR)
    } finally {
      setPending(false)
    }
  }
  return (
    <AuthCard
      title="Verify your sign-in"
      description="Enter the six-digit code from your authenticator."
    >
      <form onSubmit={submit}>
        <label htmlFor="mfa-code">Authentication code</label>
        <input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Verify code'}
        </button>
      </form>
    </AuthCard>
  )
}

export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { session } = useAuth()
  if (!session)
    return (
      <Navigate
        to={`/auth/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
        state={{ from: location }}
      />
    )
  return <>{children}</>
}

export function AccountPlaceholder() {
  const { session, signOut } = useAuth()
  return (
    <AuthCard
      title="Your account"
      description="Private account controls are being prepared for the Synthetic milestone."
    >
      <p>Signed in as a private {session?.role} account.</p>
      <button className="button" type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </AuthCard>
  )
}

function safeReturnTo(value: string | null): string {
  // Preserve only same-origin application paths; never navigate to a protocol-relative URL.
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/stores'
}
