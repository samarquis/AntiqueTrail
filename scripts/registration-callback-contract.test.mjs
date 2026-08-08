import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'
const source = await readFile(
  new URL('../supabase/functions/account-registration-callback/index.ts', import.meta.url),
  'utf8',
)
test('blocked callbacks enqueue durable cleanup and never directly delete', () => {
  assert.match(source, /enqueue_account_registration_cleanup/u)
  assert.match(source, /cleanupTicketId/u)
  assert.match(source, /validateRegistrationEndpoints/u)
  assert.doesNotMatch(source, /deleteUser|admin\/users/iu)
})

test('callback validates exact origins before creating provider clients', () => {
  const validation = source.indexOf('validateRegistrationEndpoints({')
  const providerClient = source.indexOf('createClient(url, anonKey')
  assert.ok(validation >= 0 && providerClient > validation)
  assert.match(source, /REGISTRATION_APPROVED_APP_ORIGIN/u)
  assert.match(source, /REGISTRATION_APPROVED_SUPABASE_ORIGIN/u)
})
