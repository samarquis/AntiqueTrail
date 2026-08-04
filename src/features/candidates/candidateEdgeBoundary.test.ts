import { describe, expect, it } from 'vitest'
import source from '../../../supabase/functions/_shared/candidate-server.ts?raw'

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
    expect(source).toContain('const MINIMUM_SEND_RESPONSE_MS = 500')
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
    expect(source).toContain('coarseIpKey(forwarded)')
    expect(source).toContain('.0/24`')
    expect(source).toContain('::/64`')
  })

  it('uses an exact service-only recipient lookup without scanning Auth pages', () => {
    expect(source).not.toContain('auth.admin.listUsers')
    expect(source).not.toContain('.find((item: any) => item.email')
    expect(source).toContain("admin.rpc('candidate_edge_exact_recipient'")
  })
})
