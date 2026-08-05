import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/reviewer-credentials/index.ts'),
  'utf8',
)

describe('reviewer credential Edge capability boundary', () => {
  it('authorizes setup, recovery, and management by capability without an account session', () => {
    expect(source).not.toContain("request.headers.get('authorization')")
    expect(source).not.toContain('global: { headers: { authorization: bearer } }')
    expect(source).toContain("'access-control-allow-headers': 'content-type'")
    expect(source).toContain("capability.rpc('reviews_request_reviewer_capability_challenge'")
    expect(source).toContain("capability.rpc('reviews_manage_reviewer_credentials'")
  })

  it('keeps provider completion behind the dedicated verifier identity', () => {
    expect(source).toContain('REVIEW_CREDENTIAL_VERIFIER_JWT')
    expect(source).toContain('authorization: `Bearer ${verifierJwt}`')
  })
})
