import { describe, expect, it } from 'vitest'
import source from '../../../supabase/functions/_shared/candidate-server.ts?raw'
import workerSource from '../../../supabase/functions/_shared/candidate-delivery-worker.ts?raw'
import responseSource from '../../../supabase/functions/_shared/candidate-response.ts?raw'
import sendEntrySource from '../../../supabase/functions/candidate-send-share/index.ts?raw'
import { acceptedSendResponse, timed } from '../../../supabase/functions/_shared/candidate-response'

describe('candidate Edge outbound boundary', () => {
  it('never directly fetches or resolves a user-provided destination', () => {
    expect(source).not.toContain('fetch(normalizedUrl')
    expect(source).not.toContain('Deno.resolveDns')
    expect(source).toContain('fetch(configuredProxy.toString()')
    expect(source).toContain('CANDIDATE_OUTBOUND_PROXY_SIGNED_CREDENTIAL')
  })

  it('fails closed around active sessions, proxy pinning, ports, and reserved addresses', () => {
    expect(source).toContain("client.rpc('candidate_edge_context')")
    expect(source).toContain("parsed.port !== ''")
    expect(source).toContain('result.pinned !== true')
    expect(source).toContain('result.destinations[0]?.url !== normalizedUrl')
    expect(source).toMatch(/::ffff:/)
    expect(source).toContain('/^(fc|fd|fe|ff)/')
    expect(source).toContain("value.startsWith('2001:db8:')")
    expect(source).toContain('a === 100 && b >= 64 && b <= 127')
    expect(source).toContain('a === 198 && b === 51 && c === 100')
    expect(source).toContain('a === 203 && b === 0 && c === 113')
  })

  it('applies the generic send response timing floor to every response path', () => {
    const handler = source.slice(
      source.indexOf('export async function handleCandidate'),
      source.indexOf('async function extract'),
    )
    expect(responseSource).toContain('MINIMUM_SEND_RESPONSE_MS = 500')
    expect(source).toContain(
      'const respond = (response: Response) => timed(operation, startedAt, response)',
    )
    expect(handler).not.toMatch(/return (?!respond\()[^\n]*Response/)
  })

  it('uses atomic server reservations and always releases extraction concurrency', () => {
    expect(source).toContain("client.rpc('candidate_reserve_operation'")
    expect(source).toContain("client.rpc('candidate_release_operation'")
    expect(source).toContain('finally')
    expect(source).toContain("operation === 'extract'")
    expect(source).not.toContain('x-forwarded-for')
    expect(source).toContain('connection.hostname')
    expect(sendEntrySource).toContain('info.remoteAddr')
    expect(source).toContain('coarseIpKey(connection.hostname)')
    expect(source).toContain('.0/24`')
    expect(source).toContain('::/64`')
  })

  it('uses an exact service-only recipient lookup without scanning Auth pages', () => {
    expect(source).not.toContain('auth.admin.listUsers')
    expect(source).not.toContain('.find((item: any) => item.email')
    expect(source).not.toContain("admin.rpc('candidate_edge_exact_recipient'")
    expect(workerSource).toContain("admin.rpc('candidate_edge_exact_recipient'")
  })

  it('rejects an oversized original URL before forwarding it to the proxy', () => {
    const lengthCheck = source.indexOf('new TextEncoder().encode(originalLink).byteLength > 2_048')
    const proxyFetch = source.indexOf('fetch(configuredProxy.toString()')
    expect(lengthCheck).toBeGreaterThan(0)
    expect(lengthCheck).toBeLessThan(proxyFetch)
  })

  it('only queues send and returns one padded 202 response after the timing floor', () => {
    const sendFunction = source.slice(
      source.indexOf('async function send'),
      source.indexOf('async function accept'),
    )
    expect(sendFunction).toContain("admin.rpc('candidate_enqueue_share_delivery'")
    expect(sendFunction).not.toContain('candidate_edge_exact_recipient')
    expect(sendFunction).not.toContain('candidate_edge_send_share')
    expect(responseSource).toContain('SEND_ACCEPTED_STATUS = 202')
    expect(responseSource).toContain('SEND_ACCEPTED_BYTES = 256')
    expect(responseSource).toContain("'Cache-Control': 'no-store'")
    expect(source).toContain('acceptedSendResponse()')
    expect(responseSource).toContain('MINIMUM_SEND_RESPONSE_MS = 500')
    expect(source.indexOf("client.rpc('candidate_reserve_operation'")).toBeLessThan(
      source.indexOf("admin.rpc('candidate_enqueue_share_delivery'"),
    )
  })

  it('makes matched-state send acknowledgements byte/header identical and waits to 500ms', async () => {
    const matched = acceptedSendResponse()
    const unmatched = acceptedSendResponse()
    expect(matched.status).toBe(202)
    expect(unmatched.status).toBe(202)
    expect(await matched.clone().text()).toBe(await unmatched.clone().text())
    expect(new TextEncoder().encode(await matched.text())).toHaveLength(256)
    expect([...matched.headers]).toEqual([...unmatched.headers])
    const waits: number[] = []
    await timed(
      'send',
      1_000,
      unmatched,
      () => 1_125,
      async (milliseconds) => {
        waits.push(milliseconds)
      },
    )
    expect(waits).toEqual([375])
  })

  it('has an authenticated retrying worker boundary with terminal receipts', () => {
    expect(workerSource).toContain('CANDIDATE_WORKER_SECRET')
    expect(workerSource).toContain("admin.rpc('candidate_claim_share_delivery'")
    expect(workerSource).toContain("admin.rpc('candidate_complete_share_delivery'")
    expect(workerSource).toContain("admin.rpc('candidate_fail_share_delivery'")
    expect(workerSource).not.toContain('console.log')
  })
})
