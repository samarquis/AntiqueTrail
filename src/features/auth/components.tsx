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
import { hasStagedRecoveryToken, stageRecoveryToken } from './passwordRecoveryClient'
import { PasswordReplacementPage } from './PasswordReplacementPage'
import { PasswordInput } from './PasswordInput'
import type { AuthProviderAdapter, OAuthProviderId, ProviderCallbackResult } from './types'
import { isCatalogOnlyPublicTest, isPublicTestLifecyclePath } from './publicTestMode'

function AccountSetupPaused() {
  const { session, signOut } = useAuth()
  return (
    <AuthCard
      title="Account setup paused"
      description="We couldn't finish this account setup. For your security, this attempt can't continue."
    >
      <Link className="button" to="/stores">
        Back to store list
      </Link>
      {isCatalogOnlyPublicTest() && (
        <p>
          <Link to="/auth/sign-in?returnTo=%2Faccount">Recover your account</Link>
        </p>
      )}
      {isCatalogOnlyPublicTest() && session && (
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      )}
    </AuthCard>
  )
}

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
    <main className="auth-page">
      <section className="page-card auth-card" aria-labelledby="auth-heading">
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

function AuthErrorSummary({
  message,
  id = 'auth-error-summary',
}: {
  message: string
  id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [message])
  return (
    <div id={id} className="error-summary" ref={ref} role="alert" tabIndex={-1}>
      <h2>There is a problem</h2>
      <p>{message}</p>
    </div>
  )
}

function describeReturnTarget(returnTo: string) {
  return returnTo === '/stores' ? 'the store list' : 'the action you were working on'
}

const OAUTH_PROVIDER_IDS = ['google', 'facebook'] as const

function providerLabel(providerId: OAuthProviderId) {
  return providerId === 'google' ? 'Google' : 'Facebook'
}

function OAuthProviderMark({ providerId }: { providerId: OAuthProviderId }) {
  if (providerId === 'google')
    return (
      <svg className="auth-provider-button__mark" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M21.35 12.27c0-.79-.07-1.55-.23-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"
        />
        <path
          fill="#34A853"
          d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.53A9.74 9.74 0 0 0 12 21.5Z"
        />
        <path
          fill="#FBBC05"
          d="M6.53 13.58A5.86 5.86 0 0 1 6.22 12c0-.55.1-1.08.31-1.58V7.89H3.28A9.5 9.5 0 0 0 2.25 12c0 1.48.35 2.88 1.03 4.11l3.25-2.53Z"
        />
        <path
          fill="#EA4335"
          d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.48 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.72 5.39l3.25 2.53C7.3 8.11 9.46 6.39 12 6.39Z"
        />
      </svg>
    )
  return (
    <svg className="auth-provider-button__mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.04 1.79-4.72 4.56-4.72 1.32 0 2.7.24 2.7.24v2.98h-1.52c-1.5 0-1.97.94-1.97 1.9v2.26h3.35l-.54 3.49H13.9V24C19.61 23.1 24 18.1 24 12.07Z"
      />
    </svg>
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
  const [socialPending, setSocialPending] = useState<OAuthProviderId | null>(null)
  const params = new URLSearchParams(location.search)
  const returnTo = safeReturnTo(params.get('returnTo'))
  const switchingAccount = params.get('switchAccount') === '1'
  const availableProviders = provider.signInWithProvider
    ? OAUTH_PROVIDER_IDS.filter((providerId) => provider.oauthProviders[providerId])
    : []

  async function continueWith(providerId: OAuthProviderId) {
    if (!provider.signInWithProvider || !provider.oauthProviders[providerId]) return
    setSocialPending(providerId)
    setError(null)
    try {
      await provider.signInWithProvider(providerId, returnTo)
    } catch {
      setError(`We couldn't start ${providerLabel(providerId)} sign-in. Try again.`)
    } finally {
      setSocialPending(null)
    }
  }

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

  if (isCatalogOnlyPublicTest() && !isPublicTestLifecyclePath(returnTo))
    return <AccountSetupPaused />
  return (
    <AuthCard
      title={switchingAccount ? 'Use a different account' : 'Sign in'}
      description={
        switchingAccount
          ? 'The previous account is signed out securely. Sign in with the account you want to use.'
          : 'Use your verified email and password to continue.'
      }
    >
      {switchingAccount && (
        <p role="status">Signed out securely. No private data remains visible.</p>
      )}
      {returnTo !== '/stores' && !isCatalogOnlyPublicTest() && (
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
        <PasswordInput
          id="auth-password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          ariaInvalid={Boolean(error)}
          describedBy={error ? 'auth-error-summary' : undefined}
          required
        />
        {error && <AuthErrorSummary message={error} />}
        <button className="button" type="submit" disabled={pending || socialPending !== null}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {!isCatalogOnlyPublicTest() && availableProviders.length > 0 && (
        <section className="auth-provider-buttons" aria-label="Sign in with a linked account">
          <p>Or sign in with:</p>
          {socialPending && (
            <p className="auth-provider-status" role="status" aria-live="polite">
              Connecting to {providerLabel(socialPending)}…
            </p>
          )}
          {availableProviders.map((providerId) => (
            <p key={providerId}>
              <button
                className={`auth-provider-button auth-provider-button--${providerId}`}
                type="button"
                disabled={pending || socialPending !== null}
                aria-label={`Continue with ${providerLabel(providerId)}`}
                onClick={() => void continueWith(providerId)}
              >
                <OAuthProviderMark providerId={providerId} />
                {socialPending === providerId
                  ? `Connecting to ${providerLabel(providerId)}…`
                  : `Continue with ${providerLabel(providerId)}`}
              </button>
            </p>
          ))}
        </section>
      )}
      <p>
        <Link to={`/auth/recovery${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
          Forgot your password?
        </Link>
      </p>
      {!isCatalogOnlyPublicTest() && (
        <p>
          <Link
            to={`/auth/register${returnTo !== '/stores' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          >
            Create account
          </Link>
        </p>
      )}
      {returnTo !== '/stores' && (
        <Link
          to={isCatalogOnlyPublicTest() ? '/stores' : safeCancelTarget(returnTo)}
          onClick={clearPendingPrivateAction}
        >
          Cancel and return without saving
        </Link>
      )}
    </AuthCard>
  )
}

export function RecoveryPage({ provider }: { provider: AuthProviderAdapter }) {
  const location = useLocation()
  const returnTo = isCatalogOnlyPublicTest()
    ? '/account'
    : safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
  if (hasStagedRecoveryToken()) {
    return <PasswordReplacementPage provider={provider} returnTo={returnTo} />
  }
  return <RecoveryRequestPage provider={provider} returnTo={returnTo} />
}

function RecoveryRequestPage({
  provider,
  returnTo,
}: {
  provider: AuthProviderAdapter
  returnTo: string
}) {
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
            aria-describedby={validationError ? 'recovery-error-summary' : undefined}
            required
          />
          {validationError && (
            <AuthErrorSummary id="recovery-error-summary" message={validationError} />
          )}
          <button className="button" type="submit" disabled={pending}>
            {pending ? 'Sending…' : 'Send recovery email'}
          </button>
        </form>
      )}
      <p>
        <Link to={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Back to sign in</Link>
      </p>
      <p>
        <Link to="/stores">Back to browsing</Link>
      </p>
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

  if (blocked || isCatalogOnlyPublicTest()) return <AccountSetupPaused />

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
      <Link to={safeCancelTarget(returnTo)} onClick={clearPendingPrivateAction}>
        Cancel and return without saving
      </Link>
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
        <Link to={safeCancelTarget(returnTo)} onClick={clearPendingPrivateAction}>
          Cancel and return without saving
        </Link>
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
  const [oauthReturn] = useState(() => callbackRef.current?.kind === 'oauth')
  const [state, setState] = useState<'loading' | 'blocked' | 'error' | 'invitation_required'>(
    'loading',
  )
  useEffect(() => {
    let active = true
    const callback = callbackRef.current
    if (!callback) {
      setState('error')
      return
    }
    if (callback.kind === 'recovery') {
      stageRecoveryToken(callback.tokenHash)
      callbackRef.current = null
      navigate(`/auth/recovery?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
      return
    }
    let exchange: (() => Promise<ProviderCallbackResult>) | null = null
    if (callback.kind === 'oauth') {
      const completeOAuth = provider.oauthCallback
      if (completeOAuth)
        exchange = () => completeOAuth(callback.code ?? null, callback.oauthError ?? null)
    } else {
      const completeVerify = provider.verifyCallback
      if (completeVerify) exchange = () => completeVerify(callback.kind, callback.tokenHash)
    }
    if (!exchange) {
      setState('error')
      return
    }
    exchangePreflightAuthCallback(callback, exchange)
      .then(async (result) => {
        callbackRef.current = null
        if (!active) return
        if (result.kind === 'authenticated') {
          await signIn(toAuthSession(result.session))
          navigate(returnTo, { replace: true })
        } else if (result.kind === 'verified') {
          navigate(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
        } else if (result.kind === 'blocked')
          setState(oauthReturn ? 'invitation_required' : 'blocked')
        else setState('error')
      })
      .catch(() => {
        callbackRef.current = null
        if (active) setState('error')
      })
    return () => {
      active = false
    }
  }, [navigate, oauthReturn, provider, returnTo, signIn])
  return (
    <AuthCard
      title={
        state === 'loading'
          ? oauthReturn
            ? 'Signing you in'
            : 'Verifying your account'
          : state === 'invitation_required'
            ? 'Sign-in unavailable'
            : state === 'blocked'
              ? 'Account setup paused'
              : 'Verification unavailable'
      }
      description={
        state === 'loading'
          ? oauthReturn
            ? 'Checking this sign-in securely…'
            : 'Checking this single-use verification securely…'
          : state === 'invitation_required'
            ? 'Antique Trail accounts are currently by invitation.'
            : state === 'blocked'
              ? "We couldn't finish this account setup. For your security, this attempt can't continue."
              : GENERIC_SIGN_IN_ERROR
      }
    >
      {state === 'loading' ? (
        <p role="status">Verifying…</p>
      ) : state === 'invitation_required' ? (
        <>
          <p role="alert">
            This Google or Facebook account isn't linked to an invited Antique Trail account yet.
          </p>
          <Link className="button" to="/stores">
            Back to stores
          </Link>
          <p>
            If you believe this is a mistake, <Link to="/help">contact Antique Trail support</Link>.
          </p>
          <p>
            <Link to="/auth/sign-in?switchAccount=1">Use a different account</Link>
          </p>
        </>
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
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'mfa-code-help mfa-error-summary' : 'mfa-code-help'}
            required
          />
          <p id="mfa-code-help">
            Use a six-digit authenticator code. If that factor is unavailable, use a recovery code.
          </p>
          {error && <AuthErrorSummary id="mfa-error-summary" message={error} />}
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
  if (isCatalogOnlyPublicTest() && !isPublicTestLifecyclePath(location.pathname))
    return <AccountSetupPaused />
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
        {isCatalogOnlyPublicTest() && (
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
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
  const { session, signOut } = useAuth()
  return (
    <AuthCard
      title="Your session ended"
      description="For your security, private account content is hidden until you sign in again."
    >
      <p role="alert">Your session expired or was revoked. No private change was saved.</p>
      {isCatalogOnlyPublicTest() && session && (
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      )}
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

function clearPendingPrivateAction() {
  if (typeof window !== 'undefined')
    window.sessionStorage.removeItem('antique-trail:jit-private-action:v1')
}

export function safeCancelTarget(value: string): string {
  const safe = safeReturnTo(value)
  const storeMatch = safe.match(/^\/stores\/([^/]+)\/(?:memory|correction|claim)(?:\/|$)/u)
  if (storeMatch) return `/stores/${storeMatch[1]}`
  if (
    safe === '/saved' ||
    safe.startsWith('/trips/') ||
    safe === '/account' ||
    safe.startsWith('/account/') ||
    safe.startsWith('/auth/')
  )
    return '/stores'
  return safe
}
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
