import { describe, expect, it } from 'vitest'
import {
  communityRequestAuthorized,
  constrainedDeploymentJwt,
  parseCommunityDeploymentCommand,
} from '../../../supabase/functions/_shared/community-deployment-command'
import edgeSource from '../../../supabase/functions/community-deployment-command/index.ts?raw'

describe('community deployment command boundary', () => {
  it('accepts an exact freeze payload and rejects extra authority', () => {
    const command = {
      operation: 'freeze',
      payload: {
        runId: '12000000-0000-4000-8000-000000000101',
        freezeReceiptId: '12000000-0000-4000-8000-000000000003',
        expectedRootVersion: 2,
        expectedRunVersion: 1,
        artifactDigest: '03'.repeat(32),
        storeSetDigest: '04'.repeat(32),
        storeIds: ['12000000-0000-4000-8000-000000000201', '12000000-0000-4000-8000-000000000202'],
        idempotencyKey: 'freeze-osage',
      },
    }

    expect(parseCommunityDeploymentCommand(command)).toEqual(command)
    expect(() =>
      parseCommunityDeploymentCommand({
        ...command,
        payload: { ...command.payload, externalVerified: true },
      }),
    ).toThrow('community_command_unavailable')
  })

  it('requires a live JWT constrained to the deployment database role', () => {
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    const jwt = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      role: 'community_deployment_service',
      exp: 2_000,
    })}.signature`

    expect(constrainedDeploymentJwt(jwt, 1_000)).toBe(true)
    expect(constrainedDeploymentJwt(jwt, 2_001)).toBe(false)
    expect(
      constrainedDeploymentJwt(
        `${encode({ alg: 'HS256' })}.${encode({ role: 'service_role', exp: 2_000 })}.signature`,
        1_000,
      ),
    ).toBe(false)
  })

  it('authenticates scheduler and operator calls with a dedicated constant-time secret boundary', async () => {
    const secret = 'community-command-secret-with-32-bytes'
    const authorized = new Request('https://example.test', {
      headers: { 'x-antique-trail-community-command': secret },
    })
    const denied = new Request('https://example.test', {
      headers: { 'x-antique-trail-community-command': 'wrong-secret-with-at-least-32-bytes' },
    })

    await expect(communityRequestAuthorized(authorized, secret)).resolves.toBe(true)
    await expect(communityRequestAuthorized(denied, secret)).resolves.toBe(false)
  })

  it('exposes only the single deployment RPC with neutral Edge failures', () => {
    expect(edgeSource).toContain("rpc('community_deployment_command'")
    expect(edgeSource).toContain("Deno.env.get('COMMUNITY_DEPLOYMENT_JWT')")
    expect(edgeSource).toContain("Deno.env.get('COMMUNITY_COMMAND_SECRET')")
    expect(edgeSource).not.toMatch(/community_private\.|prepare_community|activate_community/)
    expect(edgeSource).not.toContain('console.')
    expect(edgeSource).not.toMatch(/error\.message|String\(error\)/)
  })
})
