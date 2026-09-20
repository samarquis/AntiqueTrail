import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const source = await readFile(
  new URL('../supabase/functions/account-registration/index.ts', import.meta.url),
  'utf8',
)

test('registration provider call is deadline bounded', () => {
  assert.ok((source.match(/withDeadline\(timeoutMs/gu) ?? []).length >= 1)
  assert.match(source, /signal,\s*headers:/u)
  assert.doesNotMatch(source, /listUsers/iu)
})

test('provider action link is neither returned nor persisted', () => {
  assert.doesNotMatch(source, /\.action_link/iu)
  assert.match(source, /hashed_token/iu)
  assert.match(source, /appCallbackUrl/u)
})

test('signup sends the encoded callback in redirect_to query, not JSON body', () => {
  const generate = source.slice(source.indexOf('async generate(input)'))
  assert.match(
    generate,
    /const signupUrl = new URL\('\/auth\/v1\/signup', endpoints\.supabaseOrigin\)/u,
  )
  assert.match(generate, /signupUrl\.searchParams\.set\('redirect_to', appCallbackUrl\)/u)
  assert.match(generate, /fetch\(signupUrl,/u)
  assert.doesNotMatch(generate, /body: JSON\.stringify\([\s\S]*redirect_to:/u)

  const callbackUrl = 'https://antique-trail.example/auth/callback?source=signup'
  const signupUrl = new URL('/auth/v1/signup', 'https://supabase.example')
  signupUrl.searchParams.set('redirect_to', callbackUrl)
  assert.equal(signupUrl.searchParams.get('redirect_to'), callbackUrl)
  assert.equal(
    signupUrl.search,
    '?redirect_to=https%3A%2F%2Fantique-trail.example%2Fauth%2Fcallback%3Fsource%3Dsignup',
  )
})

test('signup does not rely on the Auth Site URL fallback', () => {
  const generate = source.slice(source.indexOf('async generate(input)'))
  assert.match(generate, /searchParams\.set\('redirect_to', appCallbackUrl\)/u)
  assert.doesNotMatch(generate, /body: JSON\.stringify\([\s\S]*redirect_to:/u)
})
