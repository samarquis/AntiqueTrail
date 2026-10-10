export function browserReport(text, expected = 18, requiredCases = []) {
  if (
    !Array.isArray(requiredCases) ||
    requiredCases.some(
      (item) =>
        !item ||
        Object.keys(item).length !== 2 ||
        typeof item.name !== 'string' ||
        !item.name ||
        typeof item.project !== 'string' ||
        !item.project,
    )
  )
    throw new Error('Malformed required browser cases')
  const requiredKeys = requiredCases.map(({ name, project }) => JSON.stringify([name, project]))
  if (new Set(requiredKeys).size !== requiredKeys.length)
    throw new Error('Malformed required browser cases')
  const result = JSON.parse(text)
  const stats = result?.stats
  if (!stats || !Array.isArray(result.suites) || !Array.isArray(result.errors))
    throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')
  const checks = []
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          const final = test.results?.at(-1)
          const error = final?.errors?.[0] ?? final?.error
          const message = typeof error?.message === 'string' ? error.message : ''
          const line = String(error?.stack ?? '').match(
            /configured-free-shopper\.spec\.ts:(\d+):\d+/,
          )
          checks.push({
            name: spec.title,
            project: test.projectName,
            status: final?.status ?? 'unavailable',
            ...(final?.status !== 'passed' && {
              failure: {
                sourceLine: line
                  ? Number(line[1])
                  : String(error?.location?.file ?? '').endsWith(
                        'configured-free-shopper.spec.ts',
                      ) && Number.isSafeInteger(error.location.line)
                    ? error.location.line
                    : undefined,
                assertion: [
                  'toHaveText',
                  'toHaveURL',
                  'toHaveCount',
                  'toBeVisible',
                  'toBe',
                  'toThrow',
                  'locator.click',
                ].find((name) => message.includes(name)),
                timeout: final?.status === 'timedOut' || /Timeout.*exceeded/.test(message),
                strictLocator: message.includes('strict mode violation'),
              },
            }),
          })
        }
      visit(suite.suites ?? [])
    }
  }
  visit(result.suites)
  const requiredCasesPassed = requiredCases.every(({ name, project }) => {
    const matches = checks.filter((check) => check.name === name && check.project === project)
    return matches.length === 1 && matches[0].status === 'passed'
  })
  const passed =
    checks.length === expected &&
    checks.every((check) => check.status === 'passed') &&
    requiredCasesPassed &&
    stats.expected === expected &&
    stats.unexpected === 0 &&
    stats.skipped === 0 &&
    stats.flaky === 0 &&
    result.errors.length === 0
  return { stats, checks, status: passed ? 'passed' : 'failed' }
}

export function recordCleanupFailure(report, category) {
  const failedAt =
    category === 'browser-input-removal'
      ? 'cleanup-browser-input'
      : category === 'service-cleanup'
        ? 'cleanup-provider'
        : undefined
  if (!failedAt) throw new Error('Malformed cleanup failure category')
  report.cleanup = 'failed'
  report.cleanupFailures.push(category)
  report.status = 'failed'
  report.failedAt ??= failedAt
}
