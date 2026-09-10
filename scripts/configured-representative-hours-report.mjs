export function representativeHoursReport(text, expected = 2) {
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
