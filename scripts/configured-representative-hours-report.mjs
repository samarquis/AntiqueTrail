import { URL } from 'node:url'

const ownerListingOperations = new Set([
  'sign_in_open_page',
  'sign_in_fill_email',
  'sign_in_fill_password',
  'sign_in_submit_password',
  'sign_in_expect_mfa',
  'sign_in_fill_mfa',
  'sign_in_submit_mfa',
  'sign_in_wait_return_url',
  'capture_before_approval_screenshot',
  'expect_unapproved_owner_access_alert',
  'read_unapproved_owner_list',
  'accept_invitation_open',
  'accept_invitation_expect_form',
  'accept_invitation_fill_form',
  'accept_invitation_submit_form',
  'accept_invitation_expect_result',
  'open_partner_verification',
  'bind_partner_identity',
  'verify_partner_binding',
  'open_partner_draft',
  'expect_partner_draft_form',
])
const ownerListingPathnames = new Set([
  '/auth/sign-in',
  '/owner/stores',
  '/partner/join',
  '/partner/verify',
  '/partner/draft',
])
const ownerListingAssertions = [
  'toHaveText',
  'toHaveURL',
  'toHaveCount',
  'toBeVisible',
  'toBe',
  'toThrow',
  'toHaveValue',
  'toBeChecked',
  'toHaveAttribute',
  'toContainText',
  'locator.click',
  'locator.fill',
  'locator.check',
  'locator.uncheck',
]
const ownerListingCategories = new Set(['timeout', 'strict_locator', 'assertion', 'operation'])

export function ownerListingPathname(value) {
  if (typeof value !== 'string') return 'unknown'
  try {
    const url = new URL(value, 'http://127.0.0.1')
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password)
      return 'unknown'
    return ownerListingPathnames.has(url.pathname) ? url.pathname : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function ownerListingFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const line = stack.match(/configured-owner-listing\.spec\.ts:(\d+):\d+/)
  const assertion = ownerListingAssertions.find((name) => message.includes(name))
  const timeout = error?.name === 'TimeoutError' || /(?:test )?timeout.*exceeded/i.test(message)
  const strictLocator = message.includes('strict mode violation')
  const category = timeout
    ? 'timeout'
    : strictLocator
      ? 'strict_locator'
      : assertion
        ? 'assertion'
        : 'operation'
  return {
    ...(assertion ? { assertion } : {}),
    ...(line ? { sourceLine: Number(line[1]) } : {}),
    timeout,
    category,
  }
}

export function ownerListingStepResults(text) {
  const steps = JSON.parse(text)
  if (!Array.isArray(steps)) throw new Error('Malformed Owner listing step report')
  return steps.map((step) => {
    const status =
      step?.status === 'running'
        ? 'incomplete'
        : ['pending', 'passed', 'failed'].includes(step?.status)
          ? step.status
          : 'unavailable'
    const result = {
      name: typeof step?.name === 'string' ? step.name : 'unavailable',
      status,
      durationMs:
        step?.status === 'running' && Number.isFinite(step?.startedAtMs)
          ? Math.max(0, Date.now() - step.startedAtMs)
          : Number.isFinite(step?.durationMs) && step.durationMs >= 0
            ? Math.round(step.durationMs)
            : 0,
      operation: ownerListingOperations.has(step?.operation) ? step.operation : 'unknown',
      pathname: ownerListingPathname(step?.pathname),
    }
    if (step?.failure && typeof step.failure === 'object') {
      const failure = step.failure
      const assertion = ownerListingAssertions.includes(failure.assertion)
        ? failure.assertion
        : undefined
      const sourceLine =
        Number.isSafeInteger(failure.sourceLine) && failure.sourceLine > 0
          ? failure.sourceLine
          : undefined
      result.failure = {
        ...(assertion ? { assertion } : {}),
        ...(sourceLine ? { sourceLine } : {}),
        timeout: failure.timeout === true,
        category: ownerListingCategories.has(failure.category) ? failure.category : 'operation',
      }
    }
    return result
  })
}

export function representativeHoursReport(text, expected = 4) {
  const result = JSON.parse(text)
  const stats = result?.stats
  if (!stats || !Array.isArray(result.suites) || !Array.isArray(result.errors))
    throw new Error('Malformed browser report')
  const checks = []
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? [])
          checks.push({
            name: spec.title,
            project: test.projectName,
            status: test.results?.at(-1)?.status ?? 'unavailable',
          })
      visit(suite.suites ?? [])
    }
  }
  visit(result.suites)
  const passed =
    checks.length === expected &&
    checks.every((check) => check.status === 'passed') &&
    stats.expected === expected &&
    stats.unexpected === 0 &&
    stats.skipped === 0 &&
    stats.flaky === 0 &&
    result.errors.length === 0
  return { stats, checks, status: passed ? 'passed' : 'failed' }
}
