import { describe, expect, it, vi } from 'vitest'
import {
  runAuditAnchorWorker,
  type AuditAnchorPayload,
} from '../../supabase/functions/_shared/audit-anchor-worker'
import auditAnchorEdgeSource from '../../supabase/functions/audit-anchor-worker/index.ts?raw'

const payload = {
  environment: 'shared_alpha',
  schema: 'audit-anchor/v1',
  sequence: 42,
  root: 'ab'.repeat(32),
  idempotencyKey: 'shared_alpha:audit-anchor/v1:42:' + 'ab'.repeat(32),
} satisfies AuditAnchorPayload

describe('L-01 audit anchor worker', () => {
  it('deploys only bounded anchor RPCs and the exact payload provider call', () => {
    expect(auditAnchorEdgeSource).toContain("admin.rpc('prepare_audit_anchor'")
    expect(auditAnchorEdgeSource).toContain("admin.rpc('audit_anchor_watchdog'")
    expect(auditAnchorEdgeSource).toContain("admin.rpc('claim_audit_anchor'")
    expect(auditAnchorEdgeSource).toContain("admin.rpc('acknowledge_audit_anchor'")
    expect(auditAnchorEdgeSource).toContain("admin.rpc('fail_audit_anchor'")
    expect(auditAnchorEdgeSource).toContain('body: JSON.stringify(payload)')
    expect(auditAnchorEdgeSource).toContain("result.status === 'retry_scheduled' ? 503 : 200")
    expect(auditAnchorEdgeSource).not.toContain('console.')
  })

  it('publishes only the content-free anchor envelope and acknowledges it', async () => {
    const publish = vi.fn(async (publishedPayload: AuditAnchorPayload) => {
      void publishedPayload
      return { acknowledged: true as const }
    })
    const acknowledge = vi.fn(async () => undefined)

    await expect(
      runAuditAnchorWorker({
        prepare: async () => undefined,
        watchdog: async () => undefined,
        claim: async () => ({ leaseToken: '00000000-0000-4000-8000-000000000001', payload }),
        publish,
        acknowledge,
        fail: async () => undefined,
      }),
    ).resolves.toEqual({ status: 'acknowledged', sequence: 42 })

    expect(publish).toHaveBeenCalledWith(payload)
    expect(Object.keys(publish.mock.calls[0][0]).sort()).toEqual([
      'environment',
      'idempotencyKey',
      'root',
      'schema',
      'sequence',
    ])
    expect(JSON.stringify(publish.mock.calls[0][0])).not.toMatch(
      /actor|target|payload|token|challenge|secret/i,
    )
    expect(acknowledge).toHaveBeenCalledWith(
      payload.idempotencyKey,
      '00000000-0000-4000-8000-000000000001',
    )
  })

  it('refuses a malformed or expanded outbound envelope before the provider boundary', async () => {
    const publish = vi.fn(async (publishedPayload: AuditAnchorPayload) => {
      void publishedPayload
      return { acknowledged: true as const }
    })
    const fail = vi.fn(async () => undefined)
    const expandedPayload = { ...payload, actorUserId: 'private-actor' }

    await expect(
      runAuditAnchorWorker({
        prepare: async () => undefined,
        watchdog: async () => undefined,
        claim: async () => ({
          leaseToken: '00000000-0000-4000-8000-000000000002',
          payload: expandedPayload,
        }),
        publish,
        acknowledge: async () => undefined,
        fail,
      }),
    ).resolves.toEqual({ status: 'retry_scheduled', sequence: 42 })

    expect(publish).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledWith(
      payload.idempotencyKey,
      '00000000-0000-4000-8000-000000000002',
      'anchor_payload_invalid',
    )
  })

  it('releases an unacknowledged publish for idempotent replay without guessing success', async () => {
    const acknowledge = vi.fn()
    const fail = vi.fn(async () => undefined)

    await expect(
      runAuditAnchorWorker({
        prepare: async () => undefined,
        watchdog: async () => undefined,
        claim: async () => ({
          leaseToken: '00000000-0000-4000-8000-000000000003',
          payload,
        }),
        publish: async () => ({ acknowledged: false }),
        acknowledge,
        fail,
      }),
    ).resolves.toEqual({ status: 'retry_scheduled', sequence: 42 })

    expect(acknowledge).not.toHaveBeenCalled()
    expect(fail).toHaveBeenCalledWith(
      payload.idempotencyKey,
      '00000000-0000-4000-8000-000000000003',
      'anchor_publish_unacknowledged',
    )
  })
})
