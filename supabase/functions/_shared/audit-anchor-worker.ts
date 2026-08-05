export interface AuditAnchorPayload {
  environment: string
  schema: 'audit-anchor/v1'
  sequence: number
  root: string
  idempotencyKey: string
}

export interface AuditAnchorClaim {
  leaseToken: string
  payload: AuditAnchorPayload
}

export interface AuditAnchorWorkerDependencies {
  prepare(): Promise<void>
  watchdog(): Promise<void>
  claim(): Promise<AuditAnchorClaim | null>
  publish(payload: AuditAnchorPayload): Promise<{ acknowledged: boolean }>
  acknowledge(idempotencyKey: string, leaseToken: string): Promise<void>
  fail(idempotencyKey: string, leaseToken: string, errorCode: string): Promise<void>
}

export async function runAuditAnchorWorker(
  dependencies: AuditAnchorWorkerDependencies,
): Promise<{ status: 'idle' } | { status: 'acknowledged' | 'retry_scheduled'; sequence: number }> {
  await dependencies.watchdog()
  await dependencies.prepare()
  const claim = await dependencies.claim()
  if (!claim) return { status: 'idle' }

  if (!isAuditAnchorPayload(claim.payload)) {
    await dependencies.fail(
      claim.payload.idempotencyKey,
      claim.leaseToken,
      'anchor_payload_invalid',
    )
    return { status: 'retry_scheduled', sequence: claim.payload.sequence }
  }

  try {
    const publication = await dependencies.publish(claim.payload)
    if (!publication.acknowledged) {
      await dependencies.fail(
        claim.payload.idempotencyKey,
        claim.leaseToken,
        'anchor_publish_unacknowledged',
      )
      return { status: 'retry_scheduled', sequence: claim.payload.sequence }
    }
    await dependencies.acknowledge(claim.payload.idempotencyKey, claim.leaseToken)
    return { status: 'acknowledged', sequence: claim.payload.sequence }
  } catch {
    await dependencies.fail(
      claim.payload.idempotencyKey,
      claim.leaseToken,
      'anchor_publish_unknown',
    )
    return { status: 'retry_scheduled', sequence: claim.payload.sequence }
  }
}

function isAuditAnchorPayload(payload: AuditAnchorPayload): boolean {
  const keys = Object.keys(payload).sort()
  return (
    keys.join('|') === 'environment|idempotencyKey|root|schema|sequence' &&
    /^[a-z][a-z0-9_]{1,31}$/u.test(payload.environment) &&
    payload.schema === 'audit-anchor/v1' &&
    Number.isSafeInteger(payload.sequence) &&
    payload.sequence > 0 &&
    /^[0-9a-f]{64}$/u.test(payload.root) &&
    payload.idempotencyKey ===
      `${payload.environment}:${payload.schema}:${payload.sequence}:${payload.root}`
  )
}
