export function configuredAdminScopeReport(parsed, expected = 8) {
  const stats = parsed?.stats
  if (!stats || !Array.isArray(parsed.suites)) throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')

  const specs = parsed.suites.flatMap((suite) => suite.specs ?? [])
  const safeFailureCategories = new Set([
    'http_400',
    'http_401',
    'http_403',
    'http_404',
    'http_409',
    'http_422',
    'http_429',
    'http_4xx',
    'http_500',
    'http_502',
    'http_503',
    'http_5xx',
    'http_status',
    'preview_grant_id_mismatch',
    'preview_grant_version_mismatch',
    'preview_subject_mismatch',
    'preview_store_mismatch',
    'preview_current_version_mismatch',
  ])
  const assertions = [
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
  const checks = specs.flatMap((spec) =>
    (spec.tests ?? []).map((test) => {
      const final = test.results?.at(-1)
      const status = final?.status ?? test.status ?? 'unavailable'
      const error = final?.errors?.[0] ?? final?.error
      const message = typeof error?.message === 'string' ? error.message : ''
      const assertion = assertions.find((name) => message.includes(name)) ?? null
      const failureText = `${message}\n${String(error?.stack ?? '')}`
      const failureCode = failureText.match(/safe-failure:([a-z0-9_]+)\b/)?.[1]
      const safeFailureCategory = safeFailureCategories.has(failureCode) ? failureCode : null
      const stackLine = String(error?.stack ?? '').match(
        /configured-admin-scope\.spec\.ts:(\d+):\d+/,
      )
      const sourceLine = stackLine
        ? Number(stackLine[1])
        : String(error?.location?.file ?? '').endsWith('configured-admin-scope.spec.ts') &&
            Number.isSafeInteger(error.location.line)
          ? error.location.line
          : null
      const category =
        status === 'skipped' || status === 'passed'
          ? null
          : status === 'timedOut' || /Timeout.*exceeded/.test(message)
            ? 'timeout'
            : message.includes('strict mode violation')
              ? 'strict_locator'
              : safeFailureCategory
                ? safeFailureCategory
                : assertion
                  ? 'assertion'
                  : error
                    ? 'test_error'
                    : 'unclassified'

      return {
        title: `${test.projectName ?? 'unknown'}: ${spec.title}`,
        status,
        ...(category && {
          failure: { category, sourceLine, assertion },
        }),
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
