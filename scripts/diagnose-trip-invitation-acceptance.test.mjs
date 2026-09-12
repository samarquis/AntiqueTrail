/* global URL */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(
  new URL('./diagnose-trip-invitation-acceptance.mjs', import.meta.url),
  'utf8',
)

test('issue 342 diagnostic keeps evidence redacted and distinguishes recipient binding', () => {
  assert.match(source, /evidenceClass: 'real-local-auth-rpc'/)
  assert.match(source, /wrongRecipient/)
  assert.match(source, /intendedRecipient/)
  assert.match(source, /recipientVerified/)
  assert.match(source, /acceptedRecipientMatches/)
  assert.match(source, /membershipCount/)
  assert.match(source, /emailHmacExecutableByVerifierOwner/)
  assert.match(source, /JSON\.stringify\(redact\(report\)/)
  assert.doesNotMatch(source, /report\.(?:email|token|password)\s*=/)
})

test('issue 342 diagnostic requires denial, preserved state, acceptance, and cleanup', () => {
  assert.match(source, /controlDenied && controlPreserved && intendedAccepted/)
  assert.match(source, /report\.cleanup = await service\.cleanup\(\)/)
  assert.match(source, /process\.exitCode = report\.status === 'passed' \? 0 : 1/)
})
