export const RECOVERY_ACCEPTED_BYTES = 256
export const RECOVERY_MINIMUM_RESPONSE_MS = 500

const RECOVERY_MESSAGE = 'If an account exists for that email, we will send recovery instructions.'
const RECOVERY_BODY = RECOVERY_MESSAGE.padEnd(RECOVERY_ACCEPTED_BYTES, ' ')
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export type RecoveryReservation =
  | { state: 'blocked' }
  | { state: 'reserved'; operationId: string }
  | { state: 'reconciliation_required'; operationId: string }

export type RecoveryDeliveryOutcome = 'confirmed_delivered' | 'confirmed_not_delivered' | 'unknown'

export interface AuthRecoveryDependencies {
  recipientHmac(email: string): Promise<string>
  reserve(input: { recipientHmac: string; idempotencyKey: string }): Promise<RecoveryReservation>
  begin?(
    operationId: string,
    idempotencyKey: string,
  ): Promise<{ state: 'calling' | 'settled_no_effect' }>
  deliver?(input: { email: string; idempotencyKey: string }): Promise<RecoveryDeliveryOutcome>
  settle(
    operationId: string,
    idempotencyKey: string,
    outcome: RecoveryDeliveryOutcome,
  ): Promise<void>
  now?(): number
  sleep?(milliseconds: number): Promise<void>
}

export async function handleAuthRecoveryRequest(
  request: Request,
  dependencies: AuthRecoveryDependencies,
): Promise<Response> {
  const now = dependencies.now ?? Date.now
  const sleep =
    dependencies.sleep ??
    ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const startedAt = now()
  try {
    if (request.method === 'POST') {
      const body = (await request.json()) as { email?: unknown; requestId?: unknown }
      const email = typeof body.email === 'string' ? body.email.normalize('NFKC').trim() : ''
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      if (
        email.length >= 3 &&
        email.length <= 320 &&
        email.includes('@') &&
        REQUEST_ID.test(requestId)
      ) {
        const recipientHmac = await dependencies.recipientHmac(email)
        const reservation = await dependencies.reserve({
          recipientHmac,
          idempotencyKey: requestId,
        })
        if (reservation.state === 'reserved') {
          if (dependencies.deliver && dependencies.begin) {
            const begun = await dependencies.begin(reservation.operationId, requestId)
            if (begun.state === 'calling') {
              const outcome = await dependencies.deliver({ email, idempotencyKey: requestId })
              await dependencies.settle(reservation.operationId, requestId, outcome)
            }
          } else {
            await dependencies.settle(reservation.operationId, requestId, 'confirmed_not_delivered')
          }
        }
      }
    }
  } catch {
    // The public result deliberately cannot reveal validation, capability,
    // account-match, database, or provider state.
  }
  const remaining = RECOVERY_MINIMUM_RESPONSE_MS - (now() - startedAt)
  if (remaining > 0) await sleep(remaining)
  return new Response(RECOVERY_BODY, {
    status: 202,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
