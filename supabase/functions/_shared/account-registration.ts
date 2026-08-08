const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

type Reservation =
  | { state: 'blocked' }
  | { state: 'pending_verification' }
  | {
      state: 'reconciliation_required'
      admissionId: string
      operationId: string
      kind: 'generate_link' | 'send_verification'
    }
  | { state: 'reserved'; admissionId: string; providerOperationId: string }

type BeginResult = { state: 'calling' | 'blocked' | 'reconciliation_required' }
type GenerateResult =
  | { outcome: 'confirmed_generated'; appCallbackUrl: string; providerUserId: string }
  | { outcome: 'confirmed_not_generated' | 'unknown' }
type DeliveryResult = 'confirmed_delivered' | 'confirmed_not_delivered' | 'unknown'

export interface AccountRegistrationDependencies {
  reserve(input: { email: string; ageAttested: true; requestId: string }): Promise<Reservation>
  begin(
    operationId: string,
    admissionId: string,
    requestId: string,
    kind: 'generate_link' | 'send_verification',
  ): Promise<BeginResult>
  generate(input: {
    admissionId: string
    email: string
    password: string
    requestId: string
  }): Promise<GenerateResult>
  settleGenerate(input: {
    operationId: string
    admissionId: string
    requestId: string
    outcome: GenerateResult['outcome']
    providerUserId?: string
  }): Promise<{
    state: 'delivery_reserved' | 'blocked' | 'reconciliation_required'
    deliveryOperationId?: string
  }>
  deliver(input: {
    admissionId: string
    email: string
    appCallbackUrl: string
    requestId: string
  }): Promise<DeliveryResult>
  settleDelivery(input: {
    operationId: string
    admissionId: string
    requestId: string
    outcome: DeliveryResult
  }): Promise<{ state: 'pending_verification' | 'blocked' | 'reconciliation_required' }>
  reconcile(input: {
    admissionId: string
    operationId: string
    requestId: string
    kind: 'generate_link' | 'send_verification'
  }): Promise<{ state: 'pending_verification' | 'blocked' | 'reconciliation_required' }>
}

export async function handleAccountRegistration(
  request: Request,
  dependencies: AccountRegistrationDependencies,
): Promise<Response> {
  let state: 'pending_verification' | 'blocked' | 'error' = 'error'
  try {
    if (request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>
      const email = typeof body.email === 'string' ? body.email.normalize('NFKC').trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const requestId = typeof body.requestId === 'string' ? body.requestId : ''
      if (
        body.ageAttested !== true ||
        !email.includes('@') ||
        email.length > 320 ||
        password.length < 12 ||
        password.length > 128 ||
        !REQUEST_ID.test(requestId)
      ) {
        state = 'blocked'
      } else {
        const reservation = await dependencies.reserve({ email, ageAttested: true, requestId })
        if (reservation.state === 'blocked') state = 'blocked'
        else if (reservation.state === 'pending_verification') state = 'pending_verification'
        else if (reservation.state === 'reconciliation_required') {
          const reconciliation = await dependencies.reconcile({
            admissionId: reservation.admissionId,
            operationId: reservation.operationId,
            requestId,
            kind: reservation.kind,
          })
          state =
            reconciliation.state === 'pending_verification'
              ? 'pending_verification'
              : reconciliation.state === 'blocked'
                ? 'blocked'
                : 'error'
        } else {
          const begun = await dependencies.begin(
            reservation.providerOperationId,
            reservation.admissionId,
            requestId,
            'generate_link',
          )
          if (begun.state !== 'calling') state = begun.state === 'blocked' ? 'blocked' : 'error'
          else {
            let generated: GenerateResult
            try {
              generated = await dependencies.generate({
                admissionId: reservation.admissionId,
                email,
                password,
                requestId,
              })
            } catch {
              generated = { outcome: 'unknown' }
            }
            const providerSettlement = await dependencies.settleGenerate({
              operationId: reservation.providerOperationId,
              admissionId: reservation.admissionId,
              requestId,
              outcome: generated.outcome,
              ...(generated.outcome === 'confirmed_generated'
                ? { providerUserId: generated.providerUserId }
                : {}),
            })
            if (
              generated.outcome !== 'confirmed_generated' ||
              providerSettlement.state !== 'delivery_reserved' ||
              !providerSettlement.deliveryOperationId
            ) {
              state = providerSettlement.state === 'blocked' ? 'blocked' : 'error'
            } else {
              const deliveryBegin = await dependencies.begin(
                providerSettlement.deliveryOperationId,
                reservation.admissionId,
                requestId,
                'send_verification',
              )
              if (deliveryBegin.state !== 'calling')
                state = deliveryBegin.state === 'blocked' ? 'blocked' : 'error'
              else {
                let deliveryOutcome: DeliveryResult
                try {
                  deliveryOutcome = await dependencies.deliver({
                    admissionId: reservation.admissionId,
                    email,
                    appCallbackUrl: generated.appCallbackUrl,
                    requestId,
                  })
                } catch {
                  deliveryOutcome = 'unknown'
                }
                const deliverySettlement = await dependencies.settleDelivery({
                  operationId: providerSettlement.deliveryOperationId,
                  admissionId: reservation.admissionId,
                  requestId,
                  outcome: deliveryOutcome,
                })
                state =
                  deliverySettlement.state === 'pending_verification'
                    ? 'pending_verification'
                    : deliverySettlement.state === 'blocked'
                      ? 'blocked'
                      : 'error'
              }
            }
          }
        }
      }
    }
  } catch {
    state = 'error'
  }
  return Response.json(
    { state },
    { status: state === 'error' ? 503 : 202, headers: { 'Cache-Control': 'no-store' } },
  )
}
