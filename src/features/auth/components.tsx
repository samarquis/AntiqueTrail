import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  GENERIC_MFA_ERROR,
  GENERIC_RECOVERY_MESSAGE,
  GENERIC_SIGN_IN_ERROR,
  toAuthSession,
} from './authClient'
import { useAuth } from './AuthContext'
import { exchangePreflightAuthCallback, takePreflightAuthCallback } from './callbackPreflight'
import type { AuthCallback } from './authBoundary'
import type { AuthProviderAdapter } from './types'

function AuthCard({
  children,
  title,
  description,
  focusOnMount = false,
}: {
  children: ReactNode
  title: string
  description: string
  focusOnMount?: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [focusOnMount])
  return (
    <main>
      <section className="page-card" aria-labelledby="auth-heading">
        <p className="eyebrow">Antique Trail account</p>
        <h1 id="auth-heading" ref={headingRef} tabIndex={focusOnMount ? -1 : undefined}>
          {title}
        </h1>
        <p className="lede">{description}</p>
        {children}
      </section>
    </main>
  )
}

function AuthErrorSummary({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [message])
  return (
    <div className="error-summary" ref={ref} role="alert" tabIndex={-1}>
      <h2>There is a problem</h2>
      <p>{message}</p>
    </div>
  )
}

function describeReturnTarget(returnTo: string) {
  return returnTo === '/stores' ? 'the store list' : 'the action you were working on'
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
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await provider.signIn(email.trim(), password)
      if (result.kind === 'error') {
        setError(GENERIC_SIGN_IN_ERROR)
      } else if (result.kind === 'mfa_required') {
        navigate('/auth/mfa', {
          // Never place the provider session/access token in browser history state.
          state: mfaNavigationState(result.challengeId, returnTo),
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
      {returnTo !== '/stores' && (
        <aside role="status">
          After sign-in, you’ll return to {describeReturnTarget(returnTo)}. Review and confirm the
          private action there before it is saved.
        </aside>
      )}
      <form onSubmit={submit} noValidate>
        <label htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'auth-error-summary' : undefined}
          required
        />
        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'auth-error-summary' : undefined}
          required
        />
        {error && (
          <div id="auth-error-summary">
            <AuthErrorSummary message={error} />
          </div>
        )}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p>
        <Link to={`/auth/recovery${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
          Forgot your password?
        </Link>
      </p>
      <p>
        <Link
          to={`/auth/register${returnTo !== '/stores' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
        >
          Create account
        </Link>
      </p>
      {returnTo !== '/stores' && <Link to={returnTo}>Cancel and return without saving</Link>}
    </AuthCard>
  )
}

export function RecoveryPage({ provider }: { provider: AuthProviderAdapter }) {
  const location = useLocation()
  const initialEmail = new URLSearchParams(location.search).get('email') ?? ''
  const [email, setEmail] = useState(initialEmail)
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/u.test(email.trim())) {
      setValidationError('Enter an email address in the format name@example.com.')
      return
    }
    setPending(true)
    setValidationError(null)
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
        <form onSubmit={submit} noValidate>
          <label htmlFor="recovery-email">Email</label>
          <input
            id="recovery-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(validationError)}
            required
          />
          {validationError && <AuthErrorSummary message={validationError} />}
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send recovery email'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export function RegisterPage({ provider }: { provider: AuthProviderAdapter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ageAttested, setAgeAttested] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const changeAttempt = () => {
    requestIdRef.current = null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/u.test(email.trim()) || password.length < 12 || password.length > 128) {
      setError('Enter a valid email and a password from 12 through 128 characters.')
      return
    }
    if (!ageAttested) {
      setError('Confirm that you are 18 or older to create an account.')
      return
    }
    setPending(true)
    setError(null)
    requestIdRef.current ??= crypto.randomUUID()
    try {
      const result = provider.register
        ? await provider.register({
            email: email.trim(),
            password,
            ageAttested,
            requestId: requestIdRef.current,
          })
        : { kind: 'error' as const }
      if (result.kind === 'pending_verification') {
        setPassword('')
        navigate(`/auth/verify?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
      } else if (result.kind === 'blocked') {
        setPassword('')
        setEmail('')
        setAgeAttested(false)
        setBlocked(true)
      } else setError(GENERIC_SIGN_IN_ERROR)
    } catch {
      setError(GENERIC_SIGN_IN_ERROR)
    } finally {
      setPending(false)
    }
  }

  if (blocked)
    return (
      <AuthCard
        title="Account setup paused"
        description="We couldn't finish this account setup. For your security, this attempt can't continue."
      >
        <Link className="button" to="/stores">
          Back to store list
        </Link>
      </AuthCard>
    )

  return (
    <AuthCard
      title="Create your account"
      description="Create a private shopper account. We will verify your email before any private action is saved."
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            changeAttempt()
            setEmail(event.target.value)
          }}
          required
        />
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => {
            changeAttempt()
            setPassword(event.target.value)
          }}
          required
        />
        <p id="password-requirements">Use 12 through 128 characters.</p>
        <label>
          <input
            type="checkbox"
            checked={ageAttested}
            onChange={(event) => {
              changeAttempt()
              setAgeAttested(event.target.checked)
            }}
          />{' '}
          I confirm that I am 18 or older.
        </label>
        {error && <AuthErrorSummary message={error} />}
        <button className="button" type="submit" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <Link to={returnTo}>Cancel and return without saving</Link>
    </AuthCard>
  )
}

export function VerifyAccountPage() {
  const returnTo = safeReturnTo(new URLSearchParams(useLocation().search).get('returnTo'))
  return (
    <AuthCard
      title="Check your email"
      description="If account setup can continue, use the single-use verification link within 30 minutes."
    >
      <p role="status">
        No private action has been saved. After verification, sign in to return to your original
        context.
      </p>
      <Link className="button" to={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
        Continue to sign in
      </Link>
      <p>
        <Link to={returnTo}>Cancel and return without saving</Link>
      </p>
    </AuthCard>
  )
}

export function AuthCallbackPage({
  provider,
  callback: injectedCallback,
}: {
  provider: AuthProviderAdapter
  callback?: AuthCallback | null
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn } = useAuth()
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
  const callbackRef = useRef<AuthCallback | null>()
  if (callbackRef.current === undefined)
    callbackRef.current = injectedCallback ?? takePreflightAuthCallback()
  const [state, setState] = useState<'loading' | 'blocked' | 'error'>('loading')
  useEffect(() => {
    let active = true
    const callback = callbackRef.current
    if (!callback || !provider.verifyCallback) {
      setState('error')
      return
    }
    exchangePreflightAuthCallback(callback, () =>
      provider.verifyCallback!(callback.kind, callback.tokenHash),
    )
      .then(async (result) => {
        callbackRef.current = null
        if (!active) return
        if (result.kind === 'authenticated') {
          await signIn(toAuthSession(result.session))
          navigate(returnTo, { replace: true })
        } else if (result.kind === 'verified') {
          navigate(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
        } else if (result.kind === 'blocked') setState('blocked')
        else setState('error')
      })
      .catch(() => {
        callbackRef.current = null
        if (active) setState('error')
      })
    return () => {
      active = false
    }
  }, [navigate, provider, returnTo, signIn])
  return (
    <AuthCard
      title={
        state === 'loading'
          ? 'Verifying your account'
          : state === 'blocked'
            ? 'Account setup paused'
            : 'Verification unavailable'
      }
      description={
        state === 'loading'
          ? 'Checking this single-use verification securely…'
          : state === 'blocked'
            ? "We couldn't finish this account setup. For your security, this attempt can't continue."
            : GENERIC_SIGN_IN_ERROR
      }
    >
      {state === 'loading' ? (
        <p role="status">Verifying…</p>
      ) : state === 'blocked' ? (
        <>
          <p role="alert">
            We couldn't finish this account setup. For your security, this attempt can't continue.
          </p>
          <Link className="button" to="/stores">
            Back to stores
          </Link>
          <p>
            If you believe this is a mistake, <Link to="/help">contact Antique Trail support</Link>.
          </p>
        </>
      ) : (
        <>
          <div role="alert">
            <p>{GENERIC_SIGN_IN_ERROR}</p>
          </div>
          <Link className="button" to="/auth/sign-in">
            Start sign-in again
          </Link>
        </>
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
    returnTo?: string
  } | null
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (code.trim().length < 6) {
      setError('Enter the code from your authenticator or one of your recovery codes.')
      return
    }
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
      {!state?.challengeId ? (
        <div className="error-summary" role="alert">
          <h2>This verification attempt is unavailable</h2>
          <p>{GENERIC_MFA_ERROR}</p>
          <Link className="button" to="/auth/sign-in">
            Start sign-in again
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <label htmlFor="mfa-code">Authentication code</label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={32}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <p>
            Use a six-digit authenticator code. If that factor is unavailable, use a recovery code.
          </p>
          {error && <AuthErrorSummary message={error} />}
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Checking…' : 'Verify code'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}

export function RequireSession({
  children,
  requiredRole,
  allowCancellationOnly = false,
}: {
  children: ReactNode
  requiredRole?: 'Shopper' | 'Representative' | 'Administrator'
  allowCancellationOnly?: boolean
}) {
  const location = useLocation()
  const { session, signOut, lifecycleReady } = useAuth()
  if (!session)
    return (
      <Navigate
        to={`/auth/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
        state={{ from: location }}
      />
    )
  if (!lifecycleReady)
    return (
      <AuthCard
        title="Checking account access"
        description="Private account content stays hidden while current account status is confirmed."
      >
        <p role="status">Checking account status…</p>
      </AuthCard>
    )
  if (session.expiresAt <= Date.now())
    return <ExpiredSessionPage returnTo={location.pathname + location.search} />
  if (session.accountState === 'deletion_scheduled' && !allowCancellationOnly)
    return (
      <AuthCard
        title="Account deletion is scheduled"
        description="Ordinary private account content remains locked during the cancellation period."
        focusOnMount
      >
        <p role="alert">Only cancellation, account recovery, and sign-out are available.</p>
        <Link className="button" to="/account/delete/cancel">
          Review cancellation
        </Link>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
        <p>
          <Link to="/auth/recovery">Recover your account</Link>
        </p>
      </AuthCard>
    )
  if (requiredRole && session.role !== requiredRole)
    return (
      <AuthCard
        title="This private area is unavailable"
        description="This account does not have access to shopper-private information."
      >
        <p role="alert">Sign out before using a separate shopper account.</p>
        <Link className="button" to="/stores">
          View public directory
        </Link>
      </AuthCard>
    )
  return <>{children}</>
}

export function ExpiredSessionPage({ returnTo = '/stores' }: { returnTo?: string }) {
  const safeTarget = safeReturnTo(returnTo)
  return (
    <AuthCard
      title="Your session ended"
      description="For your security, private account content is hidden until you sign in again."
    >
      <p role="alert">Your session expired or was revoked. No private change was saved.</p>
      <Link className="button" to={`/auth/sign-in?returnTo=${encodeURIComponent(safeTarget)}`}>
        Sign in again
      </Link>
      <p>
        <Link to="/auth/recovery">Recover your account</Link>
      </p>
      <p>
        <Link to="/stores">Return to the public store list</Link>
      </p>
    </AuthCard>
  )
}

export function AccountPage() {
  const { session, signOut } = useAuth()
  const [pending, setPending] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  async function submitSignOut() {
    setPending(true)
    try {
      await signOut()
    } finally {
      // Local purge is authoritative even if remote provider acknowledgement is unavailable.
      setSignedOut(true)
      setPending(false)
    }
  }
  return (
    <AuthCard
      title="Your account"
      description="Review your account access, private history, and privacy choices."
    >
      {signedOut ? (
        <>
          <p role="status">You are signed out on this device. Private account content is hidden.</p>
          <Link className="button" to="/stores">
            Return to the store list
          </Link>
        </>
      ) : (
        <>
          <dl>
            <dt>Account type</dt>
            <dd>{session?.role ?? 'Shopper'}</dd>
            <dt>Email status</dt>
            <dd>
              {session?.email ?? 'Email unavailable in this session'} ·{' '}
              {session?.emailVerified ? 'Verified' : 'Verification required'}
            </dd>
            <dt>Multi-factor authentication</dt>
            <dd>{session?.mfaEnrolled ? 'Enrolled' : 'Not enrolled'}</dd>
          </dl>
          <nav aria-label="Account controls">
            <ul>
              <li>
                <Link to="/account/privacy">Account &amp; Privacy</Link>
              </li>
              <li>
                <Link to="/account/export">Export My Data</Link>
              </li>
              <li>
                <Link to="/account/history">Private history controls</Link>
              </li>
              <li>
                <Link to="/account/privacy/blocked-senders">Blocked senders</Link>
              </li>
            </ul>
          </nav>
          <section aria-labelledby="sign-out-heading">
            <h2 id="sign-out-heading">Sign out</h2>
            <p>Signing out clears private account data held by this device.</p>
            <button
              className="button"
              type="button"
              disabled={pending}
              onClick={() => void submitSignOut()}
            >
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </section>
          <section aria-labelledby="delete-heading">
            <h2 id="delete-heading">Delete My Account</h2>
            <p>Review the effects and seven-day cancellation period before scheduling deletion.</p>
            <Link to="/account/delete">Review account deletion</Link>
          </section>
        </>
      )}
    </AuthCard>
  )
}

/** Kept for existing route imports while the account screen graduates from its placeholder. */
export const AccountPlaceholder = AccountPage

// eslint-disable-next-line react-refresh/only-export-components
export function safeReturnTo(value: string | null): string {
  // Preserve only same-origin application paths; never navigate to a protocol-relative URL.
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return '/stores'
  try {
    const resolved = new URL(value, 'https://antique-trail.invalid')
    return resolved.origin === 'https://antique-trail.invalid'
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : '/stores'
  } catch {
    return '/stores'
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function mfaNavigationState(challengeId: string, returnTo: string) {
  return { challengeId, returnTo: safeReturnTo(returnTo) }
}
