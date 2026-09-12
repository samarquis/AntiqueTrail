import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyRpcError,
  diagnosticPassed,
  failureStatus,
  safeReportJson,
  statusAfterCleanup,
} from './diagnose-trip-invitation-acceptance-report.mjs'

test('accepts only the expected wrong-recipient denial', () => {
  assert.deepEqual(classifyRpcError(new Error('HTTP 400 P0001 not_allowed')), {
    outcome: 'denied',
    status: 400,
    code: 'P0001',
    reason: 'not_allowed',
  })
  assert.deepEqual(
    classifyRpcError(new Error('HTTP 403 42501 permission denied for function email_hmac')),
    {
      outcome: 'server-error',
      status: 403,
      code: '42501',
      reason: 'function-execute-permission-denied',
      function: 'email_hmac',
    },
  )
  assert.deepEqual(classifyRpcError(new Error('HTTP 500 XX000 opaque-secret')), {
    outcome: 'server-error',
    status: 500,
    code: 'XX000',
    reason: 'unclassified',
  })
})

test('preserves startup unavailability and makes cleanup failure fail', () => {
  assert.equal(failureStatus('startup'), 'unavailable')
  assert.equal(failureStatus('acceptance'), 'failed')
  assert.equal(statusAfterCleanup('passed', 'removed'), 'passed')
  assert.equal(statusAfterCleanup('unavailable', 'failed'), 'failed')
})

test('requires the expected denial and exact intended-recipient state', () => {
  const report = {
    checks: {
      wrongRecipient: { outcome: 'denied', reason: 'not_allowed' },
      intendedRecipient: { outcome: 'accepted' },
    },
    afterControl: { invitationState: 'pending', membershipCount: 0 },
    afterAcceptance: {
      invitationState: 'accepted',
      acceptedRecipientMatches: true,
      membershipCount: 1,
    },
  }
  assert.equal(diagnosticPassed(report), true)
  report.checks.wrongRecipient = { outcome: 'server-error', reason: 'unclassified' }
  assert.equal(diagnosticPassed(report), false)
})

test('removes known opaque tokens and addresses from persisted evidence', () => {
  const token = 'opaque-base64url-fragment-token'
  const email = 'recipient@probe.invalid'
  const output = safeReportJson({ arbitrary: `${token} ${email}` }, [token, email])
  assert.equal(output.includes(token), false)
  assert.equal(output.includes(email), false)
  assert.match(output, /\[REDACTED\]/)
})
