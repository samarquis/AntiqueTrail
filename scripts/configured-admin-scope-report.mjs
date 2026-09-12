export function configuredAdminScopeReport(parsed, expected = 6) {
  const stats = parsed?.stats
  if (!stats || !Array.isArray(parsed.suites)) throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')

  const specs = parsed.suites.flatMap((suite) => suite.specs ?? [])
  const checks = specs.flatMap((spec) =>
    (spec.tests ?? []).map((test) => ({
      title: `${test.projectName ?? 'unknown'}: ${spec.title}`,
      status: test.results?.at(-1)?.status ?? test.status ?? 'unavailable',
    })),
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
