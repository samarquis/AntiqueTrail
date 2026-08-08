import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const source = await readFile(
  new URL('../supabase/functions/account-registration/index.ts', import.meta.url),
  'utf8',
)

test('registration provider and mail calls are deadline bounded', () => {
  assert.ok((source.match(/withDeadline\(timeoutMs/gu) ?? []).length >= 3)
  assert.match(source, /signal,\s*headers:/u)
  assert.doesNotMatch(source, /listUsers/iu)
})

test('provider action link is neither returned nor persisted', () => {
  assert.doesNotMatch(source, /\.action_link/iu)
  assert.match(source, /properties\?\.hashed_token/u)
  assert.match(source, /\/auth\/callback#token_hash=/u)
})
