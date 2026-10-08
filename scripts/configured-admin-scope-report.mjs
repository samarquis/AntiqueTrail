const safeFailureCategories = new Set([
  'http_400',
  'http_401',
  'http_403',
  'http_404',
  'http_409',
  'http_422',
  'http_429',
  'http_500',
  'http_502',
  'http_503',
  'http_4xx',
  'http_5xx',
  'http_status',
  'preview_grant_id_mismatch',
  'preview_grant_version_mismatch',
  'preview_subject_mismatch',
  'preview_store_mismatch',
  'preview_current_version_mismatch',
  'sqlstate',
  'sqlstate_mismatch',
  'timeout',
  'strict_locator',
  'assertion',
  'test_error',
  'malformed_report',
  'missing_report',
  'fetch_failure',
  'response_parse_failure',
  'invalid_response',
  'runner_error',
  'unclassified',
])
const safeSqlStates = new Set(['22023', '40001', '42501', '55000', 'P0001'])
const safeAssertions = [
  'toHaveText',
  'toHaveURL',
  'toHaveCount',
  'toBeVisible',
  'toBeFocused',
  'toHaveValue',
  'toContainText',
  'toMatchObject',
  'toBe',
  'toThrow',
  'locator.click',
  'locator.fill',
  'locator.press',
]
const stageInfo = new Map([
  ['starting local service', { stage: 'local_service', operation: 'start_local_service' }],
  [
    'creating local Auth fixture identities',
    { stage: 'auth_fixtures', operation: 'create_auth_fixtures' },
  ],
  [
    'establishing Administrator MFA assurance',
    { stage: 'mfa_setup', operation: 'establish_mfa_assurance' },
  ],
  [
    'installing distinct-store fixture authority',
    { stage: 'fixture_authority', operation: 'install_fixture_authority' },
  ],
  [
    'building configured browser application',
    { stage: 'app_build', operation: 'build_browser_application' },
  ],
  [
    'running configured browser checks',
    { stage: 'browser_checks', operation: 'run_browser_checks' },
  ],
  [
    'validating configured browser report',
    { stage: 'browser_report', operation: 'validate_browser_report' },
  ],
  ['cleanup', { stage: 'cleanup', operation: 'cleanup' }],
])
const safeStages = new Set([
  'local_service',
  'auth_fixtures',
  'mfa_setup',
  'fixture_authority',
  'app_build',
  'browser_checks',
  'browser_report',
  'cleanup',
  'unknown',
])
const safeOperations = new Set([
  ...Array.from(stageInfo.values(), ({ operation }) => operation),
  'admin_private_data_denial',
  'representative_exact_scope_change',
  'stale_and_assurance_denials',
  'owner_exact_claim_revoke',
  'unknown',
])
const operationByTitle = new Map([
  [
    'actual Auth MFA Administrator identity cannot read populated shopper-private data',
    'admin_private_data_denial',
  ],
  [
    'preview cancel then exact revoke and regrant retain sibling scope with audited independent readback',
    'representative_exact_scope_change',
  ],
  [
    'stale replay and missing assurance fail closed while focus and scoped record survive desktop and phone use',
    'stale_and_assurance_denials',
  ],
  [
    'exact Owner claim revoke removes Store A access while Store B remains active',
    'owner_exact_claim_revoke',
  ],
])

function safeStage(value) {
  const stage = stageInfo.get(value)?.stage ?? value
  return safeStages.has(stage) ? stage : 'unknown'
}

function safeOperation(value, stage) {
  const operation = operationByTitle.get(value) ?? value ?? stageInfo.get(stage)?.operation
  return safeOperations.has(operation) ? operation : 'unknown'
}

function safeHttpStatus(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599 ? value : null
}

function safeSqlState(value) {
  return typeof value === 'string' && safeSqlStates.has(value) ? value : null
}

function sourceLineFrom(error) {
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const stackLine = stack.match(
    /(?:configured-admin-scope(?:-report)?\.mjs|configured-admin-scope\.spec\.ts):(\d+):\d+/,
  )?.[1]
  const location = error?.location
  const locationLine =
    typeof location?.file === 'string' &&
    /(?:configured-admin-scope(?:-report)?\.mjs|configured-admin-scope\.spec\.ts)$/.test(
      location.file,
    ) &&
    Number.isSafeInteger(location.line)
      ? location.line
      : null
  const line = stackLine ? Number(stackLine) : locationLine
  return Number.isSafeInteger(line) && line > 0 ? line : null
}

function safeHttpCategory(status) {
  if (status === null) return null
  if ([400, 401, 403, 404, 409, 422, 429, 500, 502, 503].includes(status)) return `http_${status}`
  return status >= 500 ? 'http_5xx' : status >= 400 ? 'http_4xx' : 'http_status'
}

function safeFailureMetadata(failure) {
  if (!failure || typeof failure !== 'object') return null
  return {
    category: safeFailureCategories.has(failure.category) ? failure.category : 'unclassified',
    sourceLine:
      Number.isSafeInteger(failure.sourceLine) && failure.sourceLine > 0
        ? failure.sourceLine
        : null,
    assertion: safeAssertions.find((name) => name === failure.assertion) ?? null,
    stage: safeStage(failure.stage),
    operation: safeOperation(failure.operation, failure.stage),
    httpStatus: safeHttpStatus(failure.httpStatus),
    sqlState: safeSqlState(failure.sqlState),
  }
}

export function configuredAdminScopeFailure(
  error,
  { stage = 'unknown', operation, readinessFailure, testStatus } = {},
) {
  const message = typeof error?.message === 'string' ? error.message : ''
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const failureText = `${message}\n${stack}`
  const marker = failureText.match(/safe-failure:([A-Za-z0-9_]+)\b/)?.[1]
  const markerSqlState = marker?.match(/^sqlstate_([A-Za-z0-9]{5})$/)?.[1]
  const markerStatus = failureText.match(
    /\bsafe-failure:[A-Za-z0-9_]+\b[^\n]*\bstatus=(\d{3})\b/,
  )?.[1]
  const messageStatus = message.match(/\bHTTP\s+(\d{3})\b/)?.[1]
  const messageSqlState = message.match(/\bHTTP\s+\d{3}\s+([A-Za-z0-9]{5})\b/)?.[1]
  const httpStatus =
    safeHttpStatus(error?.status) ??
    safeHttpStatus(markerStatus ? Number(markerStatus) : null) ??
    safeHttpStatus(messageStatus ? Number(messageStatus) : null) ??
    safeHttpStatus(readinessFailure?.status)
  const sqlState =
    safeSqlState(error?.sqlState) ??
    safeSqlState(error?.code) ??
    safeSqlState(markerSqlState) ??
    safeSqlState(messageSqlState)
  const assertion = safeAssertions.find((name) => message.includes(name)) ?? null
  let category
  if (testStatus === 'timedOut') category = 'timeout'
  else if (safeFailureCategories.has(marker))
    category = marker === 'sqlstate' || markerSqlState ? 'sqlstate' : marker
  else if (sqlState) category = 'sqlstate'
  else if (readinessFailure?.category === 'fetchFailure') category = 'fetch_failure'
  else if (readinessFailure?.category === 'responseParseFailure')
    category = 'response_parse_failure'
  else if (readinessFailure?.category === 'invalidResponse') category = 'invalid_response'
  else if (readinessFailure?.category === 'httpFailure')
    category = httpStatus === null ? 'http_status' : safeHttpCategory(httpStatus)
  else if (httpStatus !== null) category = safeHttpCategory(httpStatus)
  else if (message === 'Malformed browser report' || message === 'Malformed browser counts')
    category = 'malformed_report'
  else if (message === 'Missing Playwright report') category = 'missing_report'
  else if (/Timeout.*exceeded/.test(message)) category = 'timeout'
  else if (message.includes('strict mode violation')) category = 'strict_locator'
  else if (assertion) category = 'assertion'
  else if (error) category = 'runner_error'
  else category = 'unclassified'

  return safeFailureMetadata({
    category,
    sourceLine: sourceLineFrom(error),
    assertion,
    stage,
    operation,
    httpStatus,
    sqlState,
  })
}

export function configuredAdminScopeReport(parsed, expected = 8) {
  const stats = parsed?.stats
  if (!stats || !Array.isArray(parsed.suites)) throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')

  const specs = parsed.suites.flatMap((suite) => suite.specs ?? [])
  const checks = specs.flatMap((spec) =>
    (spec.tests ?? []).map((test) => {
      const final = test.results?.at(-1)
      const status = final?.status ?? test.status ?? 'unavailable'
      const error = final?.errors?.[0] ?? final?.error
      const operation = safeOperation(spec.title, 'browser_checks')
      const failure = configuredAdminScopeFailure(error, {
        stage: 'browser_checks',
        operation,
        testStatus: status,
      })

      return {
        title: `${test.projectName ?? 'unknown'}: ${spec.title}`,
        operation,
        status,
        ...(status === 'skipped' || status === 'passed' ? {} : { failure }),
      }
    }),
  )
  const passed =
    checks.length === expected &&
    checks.every((check) => check.status === 'passed') &&
    stats.expected === expected &&
    stats.unexpected === 0 &&
    stats.skipped === 0 &&
    stats.flaky === 0 &&
    (parsed.errors?.length ?? 0) === 0
  return { stats, checks, status: passed ? 'passed' : 'failed' }
}

export function configuredAdminScopeSummary(report, candidateSha) {
  const checks = Array.isArray(report?.checks) ? report.checks : []
  const failedCheck = checks.find(
    (check) => check.status !== 'passed' && check.status !== 'skipped',
  )
  const failure = safeFailureMetadata(failedCheck?.failure ?? report?.failure)
  const sourceSha =
    typeof report?.sourceSha === 'string' && /^[0-9a-f]{40}$/i.test(report.sourceSha)
      ? report.sourceSha
      : null
  const safeCandidateSha =
    typeof candidateSha === 'string' && /^[0-9a-f]{40}$/i.test(candidateSha) ? candidateSha : null
  const summary = {
    candidateSha: safeCandidateSha,
    sourceSha,
    exactSha: sourceSha !== null && sourceSha === safeCandidateSha,
    scope: report?.scope === 'administrator-exact-scope' ? report.scope : null,
    evidenceClass: 'github-hosted-ubuntu-ephemeral-local-supabase',
    status: ['passed', 'failed', 'unavailable'].includes(report?.status)
      ? report.status
      : 'unavailable',
    cleanup: ['removed', 'failed', 'not-started'].includes(report?.cleanup)
      ? report.cleanup
      : 'unknown',
    stage: failure?.stage ?? safeStage(report?.phase),
    errorCount: Array.isArray(report?.errors) ? report.errors.length : null,
    failure,
    stats: report?.stats
      ? Object.fromEntries(
          ['expected', 'unexpected', 'skipped', 'flaky'].map((key) => [
            key,
            Number.isSafeInteger(report.stats[key]) && report.stats[key] >= 0
              ? report.stats[key]
              : null,
          ]),
        )
      : null,
    checks: checks.map((check) => ({
      operation: safeOperation(check.operation ?? check.title, check.failure?.stage),
      status: ['passed', 'failed', 'skipped', 'timedOut'].includes(check.status)
        ? check.status
        : 'unavailable',
      ...(check.failure && check.status !== 'passed' && check.status !== 'skipped'
        ? { failure: safeFailureMetadata(check.failure) }
        : {}),
    })),
  }
  return summary
}
