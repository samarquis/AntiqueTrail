import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/break-glass-review/index.ts'),
  'utf8',
)
const parser = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/break-glass-review.ts'),
  'utf8',
)

describe('break-glass review Edge boundary', () => {
  it('is origin-bound, no-store, provider-neutral at the browser boundary, and exact-shape parsed', () => {
    expect(edge).toContain("request.headers.get('origin')")
    expect(edge).toContain("'cache-control': 'no-store'")
    expect(edge).toContain("referrerPolicy: 'no-referrer'")
    expect(edge).toContain('REVIEW_CREDENTIAL_VERIFIER_JWT')
    expect(edge).toContain("value.protocol === 'https:'")
    expect(edge).toContain("content-type')?.includes('application/json')")
    expect(parser).toContain("operation === 'packet'")
    expect(parser).toContain("operation === 'submit'")
    expect(parser).toContain('invalid shape')
  })
})
