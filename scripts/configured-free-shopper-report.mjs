import { Buffer } from 'node:buffer'
import { URL } from 'node:url'

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
const checkpointAssertions = new Map([
  ['keyed-return-heading', 'toBeVisible'],
  ['signout-initial-plan', 'toHaveValue'],
  ['signout-return-plan', 'toHaveValue'],
])

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

function routeObservationBase(checkpoint, repetition) {
  return {
    version: 1,
    checkpoint,
    ...(checkpoint === 'signout-return-plan' ? { repetition } : {}),
  }
}

export function classifyConfiguredShopperRoute(url, checkpoint, repetition) {
  const base = routeObservationBase(checkpoint, repetition)
  const unavailable = { ...base, capture: 'unavailable' }
  if (!checkpointAssertions.has(checkpoint)) return unavailable
  if (
    checkpoint === 'signout-return-plan'
      ? !Number.isInteger(repetition) || repetition < 0 || repetition > 2
      : repetition !== undefined
  )
    return unavailable
  if (typeof url !== 'string' || url.length > 8_192) return unavailable
  let pathname
  try {
    pathname = new URL(url).pathname
  } catch {
    return unavailable
  }
  let routeClass = 'other'
  if (pathname === '/auth/sign-in') routeClass = 'sign-in'
  else if (pathname === '/trips/new') routeClass = 'add-to-trip'
  else if (/^\/trips\/[^/]+\/plan$/.test(pathname)) routeClass = 'trip-plan'
  return { ...base, capture: 'route-only', routeClass }
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
  const routeOnlyKeys = [...commonKeys, 'capture', 'routeClass']
  if (
    value.capture !== 'route-only' ||
    !hasExactKeys(value, routeOnlyKeys) ||
    !allowedRouteClasses.has(value.routeClass)
  )
    return undefined
  return {
    version: 1,
    checkpoint,
    ...(expectsRepetition ? { repetition: value.repetition } : {}),
    capture: 'route-only',
    routeClass: value.routeClass,
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
  let assertion = allowedAssertions.has(failure?.assertion) ? failure.assertion : undefined
  let observation = Array.isArray(annotations)
    ? observationFromAnnotations(annotations, name, project)
    : routeObservationFor(failure?.observation, name, project)
  if (observation) {
    const expectedAssertion = checkpointAssertions.get(observation.checkpoint)
    if (assertion && assertion !== expectedAssertion) observation = undefined
    else assertion ??= expectedAssertion
  }
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
