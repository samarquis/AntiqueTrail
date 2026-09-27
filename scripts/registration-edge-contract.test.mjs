import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const source = await readFile(
  new URL('../supabase/functions/account-registration/index.ts', import.meta.url),
  'utf8',
)

test('registration provider signup is deadline bounded', () => {
  assert.ok((source.match(/withDeadline\(timeoutMs/gu) ?? []).length >= 1)
  assert.match(source, /signal,\s*headers:/u)
  assert.doesNotMatch(source, /listUsers/iu)
  assert.match(source, /\/auth\/v1\/signup/u)
})

test('provider signup sends redirect_to as a query parameter, not JSON body data', () => {
  assert.match(
    source,
    /signupUrl\.searchParams\.set\('redirect_to',\s*`\$\{endpoints\.appOrigin\}\/auth\/callback`\)/u,
  )
  assert.match(source, /fetch\(signupUrl,/u)
  assert.doesNotMatch(source, /body:\s*JSON\.stringify\([\s\S]*?redirect_to:/u)
})

test('provider action link and token are neither returned nor persisted', () => {
  assert.doesNotMatch(source, /\.action_link/iu)
  assert.doesNotMatch(source, /hashed_token/iu)
  assert.doesNotMatch(source, /\/auth\/callback#token_hash=/u)
})
