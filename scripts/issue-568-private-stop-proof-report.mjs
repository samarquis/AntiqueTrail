const stages = new Set([
  'preflight',
  'local-services',
  'test-only-capability',
  'browser-build',
  'preview',
  'browser-tests',
  'browser-report',
  'cleanup',
])
const startupSteps = new Set([
  'unknown',
  'source-copy',
  'port-config',
  'source-identity',
  'docker-proxy',
  'docker-network',
  'cli-resolution',
  'supabase-start',
  'container-verification',
  'supabase-status',
  'status-parse',
  'credential-check',
  'gateway-setup',
  'fixture-setup',
  'auth-health',
  'actor-create',
  'actor-profile',
  'actor-token',
  'actor-session',
  'edge-spawn',
  'edge-readiness',
  'complete',
])
const failureCategories = new Set([
  'command_exit',
  'command_spawn',
  'command_timeout',
  'command_signal',
  'aborted',
  'fetchFailure',
  'responseParseFailure',
  'httpFailure',
  'invalidResponse',
  'readiness_exhausted',
  'identity_mismatch',
  'unknown',
])
const errorCodes = new Set([
  'ALPHA_AUTH_REQUIRED',
  'CATALOG_UNAVAILABLE',
  'GATEWAY_UNAVAILABLE',
  'INVALID_OPERATION',
  'INVALID_REQUEST',
  'MAP_UNAVAILABLE',
  'RATE_LIMITED',
  'BOOT_ERROR',
  'WORKER_ERROR',
  'WORKER_LIMIT',
])
const transportCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])
const caseIds = [
  'owner-save-reopen',
  'unknown-hours',
  'cancel-no-rpc',
  'committed-response-lost-retry',
  'stale-version',
  'user-b-denied-list-read-edit',
  'owner-remove',
]

export function projectPrimaryFailure(stage, startupFailure) {
  const primaryFailureStage = stages.has(stage) ? stage : 'cleanup'
  if (primaryFailureStage !== 'local-services') return { primaryFailureStage, startupFailure: null }
  const value = startupFailure ?? {}
  const category = failureCategories.has(value.category) ? value.category : 'unknown'
  const exitCode =
    category === 'command_exit' &&
    Number.isInteger(value.commandExitCode) &&
    value.commandExitCode >= 1 &&
    value.commandExitCode <= 255
      ? value.commandExitCode
      : null
  return {
    primaryFailureStage,
    startupFailure: {
      step: startupSteps.has(value.step) ? value.step : 'unknown',
      category,
      httpStatus:
        Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599
          ? value.httpStatus
          : null,
      safeErrorCode: errorCodes.has(value.safeErrorCode) ? value.safeErrorCode : null,
      transportCode: transportCodes.has(value.transportCode) ? value.transportCode : null,
      commandExitCode: exitCode,
    },
  }
}

export function cleanupInput({ path: inputPath, created, exists, remove }) {
  if (!inputPath) return 'not_created'
  let present
  try {
    present = exists(inputPath)
  } catch {
    return 'failed'
  }
  if (!present) return created ? 'removed' : 'not_created'
  try {
    remove(inputPath)
  } catch {
    return 'failed'
  }
  try {
    return exists(inputPath) ? 'failed' : 'removed'
  } catch {
    return 'failed'
  }
}

export function finalizePrivateStopProof(report, input) {
  const inputCleanupState = ['not_created', 'removed', 'failed'].includes(input.inputCleanupState)
    ? input.inputCleanupState
    : 'failed'
  const cleanupRequired = Boolean(
    input.serviceAllocated ||
    input.previewAllocated ||
    input.inputPathAssigned ||
    input.capabilityTouched,
  )
  const cleanupSucceeded =
    (!input.serviceAllocated || input.serviceCleanup === 'removed') &&
    (!input.previewAllocated || input.previewStopped === true) &&
    (inputCleanupState === 'removed' || inputCleanupState === 'not_created') &&
    (!input.capabilityTouched || input.capabilityRestored === true) &&
    input.localDirectoryExists !== true
  const cleanup = !cleanupRequired ? 'not-needed' : cleanupSucceeded ? 'removed' : 'failed'
  const proofPassed =
    input.testsPassed === true &&
    Array.isArray(report.cases) &&
    report.cases.length === caseIds.length &&
    caseIds.every(
      (id) =>
        report.cases.filter((item) => item.id === id && item.status === 'passed').length === 1,
    ) &&
    report.counts?.expected === caseIds.length &&
    report.counts?.passed === caseIds.length &&
    report.counts?.failed === 0 &&
    report.counts?.skipped === 0 &&
    report.counts?.flaky === 0 &&
    report.sourceProbeArmed === true &&
    report.externalSourceRequestCount === 0 &&
    report.capabilityInitial === 'disabled' &&
    report.capabilityEnabledForRun === true &&
    report.capabilityRestored === true
  let status = report.status
  let failureStage = report.failureStage
  let primary = report.primaryFailureStage ?? null
  let startupFailure = report.startupFailure ?? null
  if (!cleanupSucceeded) {
    status = 'failed'
    failureStage = 'cleanup'
    if (primary === null) {
      primary = 'cleanup'
      startupFailure = null
    }
  } else if (proofPassed && cleanup === 'removed') {
    status = 'passed'
    failureStage = null
  } else if (status === 'passed') {
    status = 'failed'
    failureStage = 'cleanup'
    if (primary === null) {
      primary = 'cleanup'
      startupFailure = null
    }
  }
  return {
    ...report,
    status,
    failureStage,
    primaryFailureStage: primary,
    startupFailure,
    inputCleanupState,
    inputRemoved: inputCleanupState === 'removed',
    cleanup,
  }
}
