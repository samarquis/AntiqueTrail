import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const edge = readFileSync(
  resolve(process.cwd(), 'supabase/functions/appeal-review/index.ts'),
  'utf8',
)
const parser = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/appeal-review.ts'),
  'utf8',
)

describe('independent appeal Edge boundary', () => {
  it('is origin-bound, no-store, and keeps provider options on the appeal-only path', () => {
    expect(edge).toContain("request.headers.get('origin')")
    expect(edge).toContain("'cache-control': 'private, no-store'")
    expect(edge).toContain("referrerPolicy: 'no-referrer'")
    expect(edge).toContain('REVIEW_CREDENTIAL_OPTIONS_URL')
    expect(edge).toContain('allowCredentials')
    expect(edge).toContain('reviews_request_independent_appeal_assertion')
    expect(edge).toContain('reviews_complete_independent_appeal_assertion')
    expect(parser).toContain("operation === 'packet'")
    expect(parser).toContain("operation === 'submit'")
    expect(parser).toContain('invalid shape')
  })
})
