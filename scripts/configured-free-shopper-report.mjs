export function browserReport(text, expected = 18) {
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
                sourceLine: line ? Number(line[1]) : undefined,
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
