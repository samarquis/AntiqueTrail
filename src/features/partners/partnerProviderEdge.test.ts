import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('partner provider browser boundary', () => {
  it('uses the shared exact-origin CORS boundary and requires APP_ORIGIN', () => {
    const source = readFileSync('supabase/functions/partner-provider-command/index.ts', 'utf8')
    expect(source).toContain("Deno.env.get('APP_ORIGIN')")
    expect(source).toContain('partnerCors')
    expect(source).toContain('partnerPreflight')
    expect(source).not.toContain("'Access-Control-Allow-Origin': '*'")
  })
})
