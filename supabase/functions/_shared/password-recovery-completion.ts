export const PASSWORD_RECOVERY_MIN_LENGTH = 12
export const PASSWORD_RECOVERY_MAX_LENGTH = 128
export const PASSWORD_RECOVERY_SUCCESS = 'completed'

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const TOKEN_HASH = /^[\s\S]{32,4096}$/u

export type PasswordRecoveryDisposition =
  | 'unknown'
  | 'invalidated'
  | 'provider_pending'
  | 'completed'
  | 'uncertain'

export interface VerifiedRecoveryCredential {
  userId: string
  sessionId: string
  accessToken: string
}

export interface PasswordRecoveryCompletionDependencies {
  status(requestId: string): Promise<PasswordRecoveryDisposition>
  verifyToken(tokenHash: string): Promise<VerifiedRecoveryCredential | null>
  invalidateApplicationSessions(input: {
    requestId: string
    userId: string
    sessionId: string
  }): Promise<'ready' | 'completed' | 'provider_retry' | 'retry_required'>
  updatePassword(credential: VerifiedRecoveryCredential, password: string): Promise<void>
  revokeProviderSessions(input: {
    credential: VerifiedRecoveryCredential
    requestId: string
  }): Promise<void>
  complete(requestId: string): Promise<'completed' | 'retry_required'>
  markUncertain(requestId: string): Promise<void>
  markProviderPending(requestId: string): Promise<void>
}

export async function handlePasswordRecoveryCompletion(
  request: Request,
  dependencies: PasswordRecoveryCompletionDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ state: 'error' }, 405)
  try {
    const body = (await request.json()) as {
      token_hash?: unknown
      password?: unknown
      request_id?: unknown
    }
    const tokenHash = typeof body.token_hash === 'string' ? body.token_hash : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const requestId = typeof body.request_id === 'string' ? body.request_id : ''
    if (
      !REQUEST_ID.test(requestId) ||
      !TOKEN_HASH.test(tokenHash) ||
      hasControlCharacter(tokenHash) ||
      password.length < PASSWORD_RECOVERY_MIN_LENGTH ||
      password.length > PASSWORD_RECOVERY_MAX_LENGTH
    )
      return json({ state: 'error' })

    const prior = await dependencies.status(requestId)
    if (prior === 'completed') return json({ state: PASSWORD_RECOVERY_SUCCESS })
    if (prior !== 'unknown') return json({ state: 'error' })

    const credential = await dependencies.verifyToken(tokenHash)
    if (!credential) return json({ state: 'error' })
    const invalidation = await dependencies.invalidateApplicationSessions({
      requestId,
      userId: credential.userId,
      sessionId: credential.sessionId,
    })
    if (invalidation === 'completed') return json({ state: PASSWORD_RECOVERY_SUCCESS })
    if (invalidation === 'provider_retry') {
      try {
        await dependencies.revokeProviderSessions({ credential, requestId })
        const completed = await dependencies.complete(requestId)
        return json({ state: completed === 'completed' ? PASSWORD_RECOVERY_SUCCESS : 'error' })
      } catch {
        await dependencies.markProviderPending(requestId).catch(() => undefined)
        return json({ state: 'error' })
      }
    }
    if (invalidation !== 'ready') return json({ state: 'error' })

    try {
      await dependencies.updatePassword(credential, password)
    } catch {
      await dependencies.markUncertain(requestId).catch(() => undefined)
      return json({ state: 'error' })
    }

    try {
      await dependencies.revokeProviderSessions({ credential, requestId })
    } catch {
      await dependencies.markProviderPending(requestId).catch(() => undefined)
      return json({ state: 'error' })
    }
    const completed = await dependencies.complete(requestId)
    return json({ state: completed === 'completed' ? PASSWORD_RECOVERY_SUCCESS : 'error' })
  } catch {
    return json({ state: 'error' })
  }
}

function json(body: { state: string }, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}
