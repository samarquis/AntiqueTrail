import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('account lifecycle worker Storage boundary', () => {
  it('checks authoritative object size before download and retains the Blob bound', async () => {
    const source = await readFile(
      join(process.cwd(), 'supabase/functions/account-lifecycle-worker/index.ts'),
      'utf8',
    )
    const info = source.indexOf('await storage.info(objectKey)')
    const metadata = source.indexOf('info.data.size')
    const download = source.indexOf('await storage.download(objectKey)')
    const blobBound = source.indexOf('result.data.size > maxBytes')

    expect(info).toBeGreaterThan(-1)
    expect(metadata).toBeGreaterThan(info)
    expect(download).toBeGreaterThan(metadata)
    expect(blobBound).toBeGreaterThan(download)
    expect(source).toContain("typeof authoritativeBytes !== 'number'")
    expect(source).toContain('!Number.isSafeInteger(authoritativeBytes)')
  })
})
