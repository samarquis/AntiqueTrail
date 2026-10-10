import { Buffer } from 'node:buffer'

const routeObservationType = 'configured-route-observation-v1'
const routeObservationCheckpoints = new Map([
  ['keyed trip create replays after committed response loss', new Set(['keyed-return-heading'])],
  [
    'sibling context, sign-out, and account switch deny private trip reads and writes',
    new Set(['signout-initial-plan', 'signout-return-plan']),
  ],
])
const allowedAssertions = new Set([
  'toHaveText',
  'toHaveURL',
  'toHaveCount',
  'toHaveValue',
  'toBeVisible',
  'toBe',
  'toThrow',
  'locator.click',
])
const allowedRouteClasses = new Set(['sign-in', 'add-to-trip', 'trip-plan', 'other'])

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function routeObservationFor(value, name, project) {
  const checkpoints = routeObservationCheckpoints.get(name)
  if (!checkpoints || !['desktop', 'phone'].includes(project)) return undefined
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > 1_024) return undefined
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (!isRecord(value) || value.version !== 1 || !checkpoints.has(value.checkpoint))
    return undefined
  const checkpoint = value.checkpoint
  const expectsRepetition = checkpoint === 'signout-return-plan'
  if (expectsRepetition) {
    if (!Number.isInteger(value.repetition) || value.repetition < 0 || value.repetition > 2)
      return undefined
  } else if ('repetition' in value) return undefined

  const commonKeys = ['version', 'checkpoint', ...(expectsRepetition ? ['repetition'] : [])]
  if (value.capture === 'unavailable') {
    if (!hasExactKeys(value, [...commonKeys, 'capture'])) return undefined
    return {
      version: 1,
      checkpoint,
      ...(expectsRepetition ? { repetition: value.repetition } : {}),
      capture: 'unavailable',
    }
  }
  const completeKeys = [
    ...commonKeys,
    'capture',
    'routeClass',
    'signInVisible',
    'expectedHeadingVisible',
    'unavailableHeadingVisible',
    'tripNameCount',
    'tripNameVisible',
    'valueMatches',
  ]
  if (value.capture !== 'complete' || !hasExactKeys(value, completeKeys)) return undefined
  if (
    !allowedRouteClasses.has(value.routeClass) ||
    typeof value.signInVisible !== 'boolean' ||
    typeof value.expectedHeadingVisible !== 'boolean' ||
    typeof value.unavailableHeadingVisible !== 'boolean' ||
    !Number.isInteger(value.tripNameCount) ||
    value.tripNameCount < 0 ||
    value.tripNameCount > 2
  )
    return undefined
  const uniqueName = value.tripNameCount === 1
  if (uniqueName) {
    if (
      (value.tripNameVisible !== null && typeof value.tripNameVisible !== 'boolean') ||
      (value.valueMatches !== null && typeof value.valueMatches !== 'boolean')
    )
      return undefined
  } else if (value.tripNameVisible !== null || value.valueMatches !== null) return undefined
  if (checkpoint === 'keyed-return-heading' && value.valueMatches !== null) return undefined
  return {
    version: 1,
    checkpoint,
    ...(expectsRepetition ? { repetition: value.repetition } : {}),
    capture: 'complete',
    routeClass: value.routeClass,
    signInVisible: value.signInVisible,
    expectedHeadingVisible: value.expectedHeadingVisible,
    unavailableHeadingVisible: value.unavailableHeadingVisible,
    tripNameCount: value.tripNameCount,
    tripNameVisible: uniqueName ? value.tripNameVisible : null,
    valueMatches: uniqueName && checkpoint !== 'keyed-return-heading' ? value.valueMatches : null,
  }
}

function observationFromAnnotations(annotations, name, project) {
  if (!Array.isArray(annotations)) return undefined
  const matching = annotations.filter(
    (annotation) => isRecord(annotation) && annotation.type === routeObservationType,
  )
  if (matching.length !== 1 || !hasExactKeys(matching[0], ['type', 'description'])) return undefined
  if (typeof matching[0].description !== 'string') return undefined
  return routeObservationFor(matching[0].description, name, project)
}

function leadingAssertion(message) {
  const firstLine = message.split(/\r?\n/, 1)[0].replace(/^\s*(?:Error:\s*)?/, '')
  const match = firstLine.match(
    /^expect(?:\.soft)?(?:\([^)]*\))?\.(?:not\.)?(toHaveText|toHaveURL|toHaveCount|toHaveValue|toBeVisible|toBe|toThrow)(?=$|[\s(:])/,
  )
  if (match) return match[1]
  return /^(?:Error:\s*)?locator\.click(?=$|[\s:(])/.test(firstLine) ? 'locator.click' : undefined
}

function sourceLineFrom(error) {
  const location = error?.location
  if (
    typeof location?.file === 'string' &&
    location.file.endsWith('configured-free-shopper.spec.ts') &&
    Number.isSafeInteger(location.line) &&
    location.line > 0
  )
    return location.line
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const match = stack.match(/configured-free-shopper\.spec\.ts:(\d+):\d+/)
  return match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0
    ? Number(match[1])
    : undefined
}

export function projectSafeBrowserFailure(failure, { name, project, annotations } = {}) {
  const sourceLine =
    Number.isSafeInteger(failure?.sourceLine) && failure.sourceLine > 0
      ? failure.sourceLine
      : undefined
  const assertion = allowedAssertions.has(failure?.assertion) ? failure.assertion : undefined
  const observation = Array.isArray(annotations)
    ? observationFromAnnotations(annotations, name, project)
    : routeObservationFor(failure?.observation, name, project)
  return {
    ...(sourceLine ? { sourceLine } : {}),
    ...(assertion ? { assertion } : {}),
    timeout: failure?.timeout === true,
    strictLocator: failure?.strictLocator === true,
    ...(observation ? { observation } : {}),
  }
}

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
          const annotations = Array.isArray(final?.annotations) ? final.annotations : []
          checks.push({
            name: spec.title,
            project: test.projectName,
            status: final?.status ?? 'unavailable',
            ...(final?.status !== 'passed' && {
              failure: projectSafeBrowserFailure(
                {
                  sourceLine: sourceLineFrom(error),
                  assertion: leadingAssertion(message),
                  timeout: final?.status === 'timedOut' || /Timeout.*exceeded/.test(message),
                  strictLocator: message.includes('strict mode violation'),
                },
                { name: spec.title, project: test.projectName, annotations },
              ),
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
