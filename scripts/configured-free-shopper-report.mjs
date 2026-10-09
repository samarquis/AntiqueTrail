const allowedRoutePaths = new Set([
  '/auth/sign-in',
  '/trips/new',
  '/stores',
  '/stores/clockwork-cabinet',
  '<other-route>',
  '<missing>',
])
const catalogErrorCategories = new Map([
  ['GATEWAY_UNAVAILABLE', 'gateway-unavailable'],
  ['INVALID_REQUEST', 'invalid-request'],
  ['INVALID_OPERATION', 'invalid-operation'],
  ['MAP_UNAVAILABLE', 'map-unavailable'],
  ['RATE_LIMITED', 'rate-limited'],
  ['ALPHA_AUTH_REQUIRED', 'authorization-required'],
  ['CATALOG_UNAVAILABLE', 'catalog-rpc-failed'],
])

function safeRoutePath(value) {
  return typeof value === 'string' && allowedRoutePaths.has(value) ? value : '<other-route>'
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 20 ? value : undefined
}

function safeCatalogFailure(value) {
  if (!value || !['list', 'details'].includes(value.operation)) return undefined
  const errorCode = catalogErrorCategories.has(value.errorCode) ? value.errorCode : 'other'
  const status = Number.isSafeInteger(value.status) ? value.status : value.httpStatus
  return {
    operation: value.operation,
    httpStatus: Number.isSafeInteger(status) && status >= 400 && status <= 599 ? status : null,
    errorCode,
    rpcErrorCategory: catalogErrorCategories.get(errorCode) ?? 'other',
  }
}

function safeAnnotation(annotations, type) {
  const annotation = [...annotations].reverse().find((item) => item?.type === type)
  if (typeof annotation?.description !== 'string') return null
  try {
    const value = JSON.parse(annotation.description)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function safeIssue565Diagnostics(value) {
  const diagnostics = {}
  const addToTrip = value?.addToTrip
  if (addToTrip) {
    const locatorCount = safeCount(addToTrip.locatorCount)
    diagnostics.addToTrip = {
      ...(typeof addToTrip.catalogOnly === 'boolean' && { catalogOnly: addToTrip.catalogOnly }),
      ...(typeof addToTrip.configuredLocalMarker === 'boolean' && {
        configuredLocalMarker: addToTrip.configuredLocalMarker,
      }),
      ...(typeof addToTrip.localTripEvaluation === 'boolean' && {
        localTripEvaluation: addToTrip.localTripEvaluation,
      }),
      ...(typeof addToTrip.shopperProjection === 'boolean' && {
        shopperProjection: addToTrip.shopperProjection,
      }),
      ...(typeof addToTrip.previewGuard === 'boolean' && { previewGuard: addToTrip.previewGuard }),
      ...(typeof addToTrip.stage === 'string' &&
        ['before-click', 'details-ready', 'click-resolved', 'assert-route'].includes(
          addToTrip.stage,
        ) && {
          stage: addToTrip.stage,
        }),
      ...(locatorCount !== undefined && { locatorCount }),
      hrefPath: safeRoutePath(addToTrip.hrefPath),
      ...(typeof addToTrip.disabled === 'boolean' || addToTrip.disabled === null
        ? { disabled: addToTrip.disabled }
        : {}),
      ariaDisabled:
        typeof addToTrip.ariaDisabled === 'string' &&
        ['true', 'false', 'unset'].includes(addToTrip.ariaDisabled)
          ? addToTrip.ariaDisabled
          : 'unset',
      pointerEvents:
        typeof addToTrip.pointerEvents === 'string' &&
        ['auto', 'none', 'other', 'unknown'].includes(addToTrip.pointerEvents)
          ? addToTrip.pointerEvents
          : 'unknown',
      pathnameAfterClick: safeRoutePath(addToTrip.pathnameAfterClick),
      pathnameAtFailure: safeRoutePath(addToTrip.pathnameAtFailure),
    }
  }

  const discovery = value?.discovery
  if (discovery) {
    const catalogFailure = safeCatalogFailure(discovery.catalogFailure)
    diagnostics.discovery = {
      ...(typeof discovery.stage === 'string' &&
        ['details-heading', 'store-link', 'cover-image'].includes(discovery.stage) && {
          stage: discovery.stage,
        }),
      path: safeRoutePath(discovery.path),
      viewState:
        typeof discovery.viewState === 'string' &&
        ['details', 'not-found', 'catalog-error', 'loading', 'browse-empty', 'other'].includes(
          discovery.viewState,
        )
          ? discovery.viewState
          : 'other',
      coverHttpStatus:
        Number.isSafeInteger(discovery.coverHttpStatus) &&
        discovery.coverHttpStatus >= 100 &&
        discovery.coverHttpStatus <= 599
          ? discovery.coverHttpStatus
          : null,
      coverRequestFailed: discovery.coverRequestFailed === true,
      imageState:
        typeof discovery.imageState === 'string' &&
        ['not-rendered', 'loading', 'loaded', 'broken'].includes(discovery.imageState)
          ? discovery.imageState
          : 'other',
      imageErrors: discovery.imageErrors === 1 ? 1 : 0,
      ...(catalogFailure && { catalogFailure }),
    }
  }

  const session = value?.sessionRevocation
  if (session) {
    const safeOutcome = (value) =>
      typeof value === 'string' &&
      /^(?:not-run|returned|transport-error|http-(?:400|401|403|5\d\d)-(?:P0001|42501|PGRST202|401|403|other))$/.test(
        value,
      )
        ? value
        : 'unclassified'
    diagnostics.sessionRevocation = {
      tokenSubjectMatchesSibling: session.tokenSubjectMatchesSibling === true,
      tokenSessionActive: session.tokenSessionActive === true,
      activeSessionAfter:
        typeof session.activeSessionAfter === 'string' &&
        ['not-checked', 'active', 'revoked', 'expired', 'missing', 'other'].includes(
          session.activeSessionAfter,
        )
          ? session.activeSessionAfter
          : 'other',
      readOutcome: safeOutcome(session.readOutcome),
      writeOutcome: safeOutcome(session.writeOutcome),
      ...(typeof session.profileUnchanged === 'boolean' || session.profileUnchanged === null
        ? { profileUnchanged: session.profileUnchanged }
        : {}),
    }
  }
  return Object.keys(diagnostics).length ? diagnostics : undefined
}

function safeAnnotationDiagnostics(annotations) {
  return safeIssue565Diagnostics({
    addToTrip: safeAnnotation(annotations, 'issue-565-add-to-trip-probe'),
    discovery: safeAnnotation(annotations, 'issue-565-discovery-probe'),
    sessionRevocation: safeAnnotation(annotations, 'issue-565-session-revocation'),
  })
}

export function browserReport(text, expected = 18) {
  const result = JSON.parse(text)
  const stats = result?.stats
  if (!stats || !Array.isArray(result.suites) || !Array.isArray(result.errors))
    throw new Error('Malformed browser report')
  for (const key of ['expected', 'unexpected', 'skipped', 'flaky'])
    if (!Number.isSafeInteger(stats[key]) || stats[key] < 0)
      throw new Error('Malformed browser counts')
  const checks = []
  const allowedActualRoutes = new Set([
    '/auth/sign-in',
    '/auth/sign-in?returnTo=/trips/new',
    '/auth/sign-in?returnTo=/trips/new?addStoreId=<store-id>',
    '/auth/sign-in?returnTo=/stores/clockwork-cabinet',
    '/auth/sign-in?returnTo=<other-route>',
    '/trips/new',
    '/trips/new?addStoreId=<store-id>',
    '/stores/clockwork-cabinet',
    '<other-route>',
  ])
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
          const annotations = [
            ...(Array.isArray(test.annotations) ? test.annotations : []),
            ...(Array.isArray(final?.annotations) ? final.annotations : []),
          ]
          const actualRoute = annotations.find(
            (annotation) => annotation?.type === 'issue-565-actual-route',
          )?.description
          const diagnostics = safeAnnotationDiagnostics(annotations)
          checks.push({
            name: spec.title,
            project: test.projectName,
            status: final?.status ?? 'unavailable',
            ...(diagnostics && { diagnostics }),
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
                ...(allowedActualRoutes.has(actualRoute) && { actualRoute }),
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
