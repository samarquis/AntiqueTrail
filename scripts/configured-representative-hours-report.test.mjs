import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ownerListingFailure,
  ownerListingPathname,
  ownerListingStepResults,
  representativeHoursReport,
} from './configured-representative-hours-report.mjs'

const passing = JSON.stringify({
  stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0 },
  errors: [],
  suites: [
    {
      specs: [
        {
          title: 'publish',
          tests: [
            { projectName: 'desktop', results: [{ status: 'passed' }] },
            { projectName: 'phone', results: [{ status: 'passed' }] },
          ],
        },
        {
          title: 'revoke',
          tests: [
            { projectName: 'desktop', results: [{ status: 'passed' }] },
            { projectName: 'phone', results: [{ status: 'passed' }] },
          ],
        },
      ],
    },
  ],
})

test('representative hours report requires every configured browser case', () => {
  assert.equal(representativeHoursReport(passing).status, 'passed')
  assert.equal(representativeHoursReport(passing, 5).status, 'failed')
})

test('representative hours report rejects malformed and failed reports', () => {
  assert.throws(() => representativeHoursReport('{}'), /Malformed browser report/)
  assert.equal(representativeHoursReport(passing.replace('"passed"', '"failed"')).status, 'failed')
})

test('six-case hours report requires both stability cases and rejects nonpassing outcomes', () => {
  const six = JSON.parse(passing)
  six.stats.expected = 6
  six.suites[0].specs.push({
    title: 'stability',
    tests: [
      { projectName: 'desktop', results: [{ status: 'passed' }] },
      { projectName: 'phone', results: [{ status: 'passed' }] },
    ],
  })
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'passed')
  assert.equal(representativeHoursReport(passing, 6).status, 'failed')
  const stability = six.suites[0].specs[2]
  for (const status of ['failed', 'skipped', 'timedOut']) {
    stability.tests[1].results[0].status = status
    assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
  }
  stability.tests[1].results[0].status = 'passed'
  six.stats.flaky = 1
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
  six.stats.flaky = 0
  stability.tests.pop()
  assert.equal(representativeHoursReport(JSON.stringify(six), 6).status, 'failed')
})

test('Owner failure diagnostics retain only allowlisted operation data', () => {
  const failure = ownerListingFailure({
    name: 'TimeoutError',
    message:
      'expect.toBeVisible: Timeout 12000ms exceeded. Bearer private-token person@private.invalid',
    stack: 'at /workspace/e2e/configured-owner-listing.spec.ts:234:4\nBearer private-token',
  })
  assert.deepEqual(failure, {
    assertion: 'toBeVisible',
    sourceLine: 234,
    timeout: true,
    category: 'timeout',
  })
  assert.equal(
    ownerListingPathname(
      'http://127.0.0.1:4174/owner/stores?claimStore=private-id#token=private-token',
    ),
    '/owner/stores',
  )
  assert.equal(ownerListingPathname('http://127.0.0.1:4174/auth/mfa'), '/auth/mfa')
  assert.equal(ownerListingPathname('http://127.0.0.1:4174/stores'), '/stores')
  assert.equal(ownerListingPathname('https://example.invalid/private'), 'unknown')
  const steps = ownerListingStepResults(
    JSON.stringify([
      {
        name: 'diagnostic',
        status: 'failed',
        durationMs: 12000,
        operation: 'expect_unapproved_owner_access_alert',
        pathname: '/owner/stores?claimStore=private-id#token=private-token',
        observedPathname: '/admin/partners?claim=private-id#token=private-token',
        invitationUiState: 'person@private.invalid private-token',
        invitationExchangeHttpStatus: 503,
        failure: { ...failure, message: 'private-token', email: 'person@private.invalid' },
      },
    ]),
  )
  assert.deepEqual(steps[0], {
    name: 'diagnostic',
    status: 'failed',
    durationMs: 12000,
    operation: 'expect_unapproved_owner_access_alert',
    pathname: '/owner/stores',
    observedPathname: '/admin/partners',
    invitationExchangeHttpStatus: 503,
    failure: {
      assertion: 'toBeVisible',
      sourceLine: 234,
      timeout: true,
      category: 'timeout',
    },
  })
  assert.doesNotMatch(JSON.stringify(steps), /private-token|private-id|private\.invalid|Bearer/)
  assert.equal('invitationUiState' in steps[0], false)
  const invalidStatus = ownerListingStepResults(
    JSON.stringify([{ name: 'diagnostic', invitationExchangeHttpStatus: '503 private-token' }]),
  )
  assert.equal('invitationExchangeHttpStatus' in invalidStatus[0], false)
  assert.doesNotMatch(JSON.stringify(invalidStatus), /private-token/)
})

test('Owner MFA diagnostics retain only allowlisted verification evidence', () => {
  const steps = ownerListingStepResults(
    JSON.stringify([
      {
        name: 'identity',
        status: 'failed',
        mfaVerification: {
          verifyHttpStatus: 422,
          verifyErrorCode: 'mfa_verification_failed',
          factorVerified: false,
          aal2Session: false,
          retryExecuted: true,
          accessToken: 'private-jwt',
          rawBody: 'private-response-body',
        },
      },
      {
        name: 'unknown-code',
        mfaVerification: {
          verifyHttpStatus: '401 private-header',
          verifyErrorCode: 'private-user-input',
          factorVerified: true,
          aal2Session: true,
          retryExecuted: false,
        },
      },
    ]),
  )

  assert.deepEqual(steps[0].mfaVerification, {
    verifyHttpStatus: 422,
    verifyErrorCode: 'mfa_verification_failed',
    factorVerified: false,
    aal2Session: false,
    retryExecuted: true,
  })
  assert.deepEqual(steps[1].mfaVerification, {
    verifyHttpStatus: null,
    verifyErrorCode: 'other',
    factorVerified: true,
    aal2Session: true,
    retryExecuted: false,
  })
  assert.doesNotMatch(
    JSON.stringify(steps),
    /private-jwt|private-response-body|private-header|private-user-input/,
  )
})

test('Owner approval diagnostics retain only allowlisted RPC evidence', () => {
  const steps = ownerListingStepResults(
    JSON.stringify([
      {
        ownerApproval: {
          approvalRpc: {
            httpStatus: 403,
            responseOk: false,
            errorCode: '42501',
            errorIdentifier: 'owner_access_unavailable',
            accessToken: 'private-jwt',
          },
          caseReadRpc: {
            httpStatus: '500 private-header',
            responseOk: 'private-result',
            errorCode: 'private-code',
            errorIdentifier: 'private-message',
            claimApproved: true,
            rawBody: 'private-response-body',
          },
        },
      },
    ]),
  )

  assert.deepEqual(steps[0].ownerApproval, {
    approvalRpc: {
      httpStatus: 403,
      responseOk: false,
      errorCode: '42501',
      errorIdentifier: 'owner_access_unavailable',
    },
    caseReadRpc: {
      httpStatus: null,
      responseOk: false,
      errorCode: 'other',
      errorIdentifier: 'other',
      claimApproved: true,
    },
  })
  assert.doesNotMatch(
    JSON.stringify(steps),
    /private-jwt|private-header|private-result|private-code|private-message|private-response-body/,
  )
})

test('Owner denial diagnostics retain actual non-403 status through both projections', () => {
  const error = Object.assign(
    new Error('Bearer transport-secret person@private.invalid https://local.invalid/?token=secret'),
    {
      ownerDenial: {
        case: 'owner_a_select_store_b',
        rpc: 'owner_select_store',
        httpStatus: 500,
        rawBody: 'private-response-body',
        bearer: 'private-token',
        email: 'person@private.invalid',
        storeId: 'private-store-id',
        url: 'http://127.0.0.1/private?token=secret',
      },
    },
  )
  const failure = ownerListingFailure(error)
  const steps = ownerListingStepResults(
    JSON.stringify([{ name: 'denial', status: 'failed', failure }]),
  )

  assert.deepEqual(steps[0].failure, {
    timeout: false,
    category: 'operation',
    ownerDenial: {
      case: 'owner_a_select_store_b',
      rpc: 'owner_select_store',
      httpStatus: 500,
    },
  })
  assert.doesNotMatch(
    JSON.stringify(steps),
    /transport-secret|private\.invalid|private-response-body|private-token|private-store-id|token=secret/,
  )
})

test('Owner denial projection omits unknown, mismatched, malformed, and expected statuses', () => {
  const invalid = [
    { case: 'unknown_case', rpc: 'owner_list_stores', httpStatus: 500 },
    { case: 'shopper_owner_list', rpc: 'unknown_rpc', httpStatus: 500 },
    { case: 'owner_a_select_store_b', rpc: 'owner_list_stores', httpStatus: 500 },
    { case: 'owner_a_select_store_b', rpc: 'owner_select_store', httpStatus: 403 },
    { case: 'owner_a_select_store_b', rpc: 'owner_select_store', httpStatus: '500 private-token' },
    { case: 'owner_a_select_store_b', rpc: 'owner_select_store', httpStatus: 500.5 },
    { case: 'owner_a_select_store_b', rpc: 'owner_select_store', httpStatus: 99 },
    { case: 'owner_a_select_store_b', rpc: 'owner_select_store', httpStatus: 600 },
  ]

  for (const ownerDenial of invalid) {
    const raw = JSON.stringify([
      {
        name: 'denial',
        status: 'failed',
        failure: {
          timeout: false,
          category: 'operation',
          ownerDenial: { ...ownerDenial, rawBody: 'private-response-body' },
        },
      },
    ])
    const steps = ownerListingStepResults(raw)

    assert.equal('ownerDenial' in steps[0].failure, false)
    assert.doesNotMatch(JSON.stringify(steps), /private-token|private-response-body/)
  }
})

test('Owner transport failures remain generic without fabricated denial status', () => {
  const failure = ownerListingFailure(
    new Error('transport failed Bearer private-token person@private.invalid'),
  )
  assert.deepEqual(failure, { timeout: false, category: 'operation' })
  assert.equal('ownerDenial' in failure, false)
})
