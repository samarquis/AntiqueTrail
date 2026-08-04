import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('account export download Edge boundary', () => {
  it('handles an exact-origin preflight and varies every response by authorization and origin', async () => {
    const source = await readFile(
      join(process.cwd(), 'supabase/functions/account-export-download/index.ts'),
      'utf8',
    )
    expect(source).toContain("request.method === 'OPTIONS'")
    expect(source).toContain('allowedOrigin === origin')
    expect(source).toContain("Vary: 'Authorization, Origin'")
    expect(source).toContain("'Access-Control-Allow-Methods': 'POST, OPTIONS'")
    expect(source).not.toContain("'Access-Control-Allow-Origin': '*'")
    expect(source).toContain("'Content-Type': 'application/zip'")
    expect(source).toContain('.zip"`')
    expect(source.indexOf('consume_account_export_handoff')).toBeLessThan(
      source.indexOf('.download(objectKey)'),
    )
  })
})
