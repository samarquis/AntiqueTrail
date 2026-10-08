export function configuredAdminScopeReport(parsed, expected = 8) {
  const stats = parsed?.stats
  if (!stats || !Array.isArray(parsed.suites)) throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')

  const specs = parsed.suites.flatMap((suite) => suite.specs ?? [])
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
      const receivedStatus = message.match(/Expected:\s*200[\s\S]{0,120}?Received:\s*(\d{3})/)?.[1]
      const httpFailureCategory = receivedStatus
        ? ['400', '401', '403', '404', '409', '422', '429', '500', '502', '503'].includes(
            receivedStatus,
          )
          ? `http_${receivedStatus}`
          : Number(receivedStatus) >= 500
            ? 'http_5xx'
            : Number(receivedStatus) >= 400
              ? 'http_4xx'
              : 'http_status'
        : null
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
              : httpFailureCategory
                ? httpFailureCategory
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
