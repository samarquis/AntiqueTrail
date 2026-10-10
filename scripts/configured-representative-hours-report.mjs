import { URL } from 'node:url'

const ownerListingOperations = new Set([
  'sign_in_open_page',
  'sign_in_fill_email',
  'sign_in_fill_password',
  'sign_in_submit_password',
  'sign_in_expect_mfa',
  'sign_in_fill_mfa',
  'sign_in_mfa_retry',
  'sign_in_mfa_result',
  'sign_in_submit_mfa',
  'sign_in_wait_return_url',
  'apply_owner_claim_approval',
  'capture_before_approval_screenshot',
  'expect_unapproved_owner_access_alert',
  'read_unapproved_owner_list',
  'accept_invitation_open',
  'accept_invitation_expect_form',
  'accept_invitation_fill_form',
  'accept_invitation_submit_form',
  'accept_invitation_expect_result',
  'open_partner_verification',
  'bind_partner_identity',
  'verify_partner_binding',
  'open_partner_draft',
  'expect_partner_draft_form',
])
const ownerListingPathnames = new Set([
  '/auth/sign-in',
  '/auth/mfa',
  '/admin',
  '/admin/partners',
  '/owner/stores',
  '/partner/join',
  '/partner/verify',
  '/partner/draft',
  '/stores',
])
const ownerListingAssertions = [
  'toHaveText',
  'toHaveURL',
  'toHaveCount',
  'toBeVisible',
  'toBe',
  'toThrow',
  'toHaveValue',
  'toBeChecked',
  'toHaveAttribute',
  'toContainText',
  'locator.click',
  'locator.fill',
  'locator.check',
  'locator.uncheck',
]
const ownerListingCategories = new Set(['timeout', 'strict_locator', 'assertion', 'operation'])
const ownerListingInvitationUiStates = new Set([
  'form_visible',
  'generic_error',
  'invitation_checking',
  'invitation_inactive',
  'join_shell_only',
  'join_shell_missing',
  'unexpected_route',
  'unknown',
])
const ownerListingMfaErrorCodes = new Set([
  'bad_jwt',
  'mfa_challenge_expired',
  'mfa_factor_name_conflict',
  'mfa_factor_not_found',
  'mfa_ip_address_mismatch',
  'mfa_totp_verify_not_enabled',
  'mfa_verification_failed',
  'mfa_verification_rejected',
  'mfa_verified_factor_exists',
  'no_authorization',
  'over_request_rate_limit',
])
const ownerListingApprovalErrorCodes = new Set(['22023', '23505', '40001', '42501', '55000'])
const ownerListingApprovalErrorIdentifiers = new Set([
  'owner_access_unavailable',
  'owner_command_invalid',
  'owner_idempotency_mismatch',
  'partner_admin_command_invalid',
  'partner_bound_identity_required',
  'partner_claim_approval_denied',
  'partner_claim_case_unavailable',
  'partner_claim_state_invalid',
  'partner_claim_unavailable_or_stale',
  'privileged_anchor_stale',
])
const ownerListingDenialRpcs = new Map([
  ['invited_applicant_list', 'owner_list_stores'],
  ['owner_a_select_store_b', 'owner_select_store'],
  ['owner_a_read_store_b', 'portal_get_home'],
  ['cancelled_owner_list', 'owner_list_stores'],
  ['shopper_owner_list', 'owner_list_stores'],
])
const ownerListingPublicReadbackErrorCodes = new Set([
  'ALPHA_AUTH_REQUIRED',
  'CATALOG_UNAVAILABLE',
  'GATEWAY_UNAVAILABLE',
  'INVALID_OPERATION',
  'INVALID_REQUEST',
  'MAP_UNAVAILABLE',
  'RATE_LIMITED',
])
const ownerListingPublicReadbackStates = new Set(['detail', 'not_found', 'error', 'loading', 'unknown'])

function ownerListingDenialEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const rpc = ownerListingDenialRpcs.get(value.case)
  if (
    !rpc ||
    value.rpc !== rpc ||
    !Number.isSafeInteger(value.httpStatus) ||
    value.httpStatus < 100 ||
    value.httpStatus > 599 ||
    value.httpStatus === 403
  )
    return undefined
  return { case: value.case, rpc, httpStatus: value.httpStatus }
}

export function ownerListingPublicReadbackEvidence(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.case !== 'store_b_after_denied_write' ||
    !ownerListingPublicReadbackStates.has(value.visibleState)
  )
    return undefined
  if (value.response === 'not_observed') {
    if (Object.prototype.hasOwnProperty.call(value, 'httpStatus')) return undefined
    return { case: value.case, response: value.response, visibleState: value.visibleState }
  }
  if (
    value.response !== 'response' ||
    !Number.isSafeInteger(value.httpStatus) ||
    value.httpStatus < 100 ||
    value.httpStatus > 599
  )
    return undefined
  const errorCode = ownerListingPublicReadbackErrorCodes.has(value.errorCode)
    ? value.errorCode
    : undefined
  return {
    case: value.case,
    response: value.response,
    httpStatus: value.httpStatus,
    ...(errorCode ? { errorCode } : {}),
    visibleState: value.visibleState,
  }
}

export function ownerListingPathname(value) {
  if (typeof value !== 'string') return 'unknown'
  try {
    const url = new URL(value, 'http://127.0.0.1')
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password)
      return 'unknown'
    return ownerListingPathnames.has(url.pathname) ? url.pathname : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function ownerListingMfaErrorCode(value) {
  if (typeof value !== 'string') return null
  return ownerListingMfaErrorCodes.has(value) ? value : 'other'
}

export function ownerListingApprovalErrorCode(value) {
  if (typeof value !== 'string') return null
  return ownerListingApprovalErrorCodes.has(value) ? value : 'other'
}

export function ownerListingApprovalErrorIdentifier(value) {
  if (typeof value !== 'string') return null
  return ownerListingApprovalErrorIdentifiers.has(value) ? value : 'other'
}

export function ownerListingFailure(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  const stack = typeof error?.stack === 'string' ? error.stack : ''
  const line = stack.match(/configured-owner-listing\.spec\.ts:(\d+):\d+/)
  const assertion = ownerListingAssertions.find((name) => message.includes(name))
  const timeout = error?.name === 'TimeoutError' || /(?:test )?timeout.*exceeded/i.test(message)
  const strictLocator = message.includes('strict mode violation')
  const category = timeout
    ? 'timeout'
    : strictLocator
      ? 'strict_locator'
      : assertion
        ? 'assertion'
        : 'operation'
  const ownerDenial = ownerListingDenialEvidence(error?.ownerDenial)
  const ownerPublicReadback = ownerListingPublicReadbackEvidence(error?.ownerPublicReadback)
  return {
    ...(assertion ? { assertion } : {}),
    ...(line ? { sourceLine: Number(line[1]) } : {}),
    timeout,
    category,
    ...(ownerDenial ? { ownerDenial } : {}),
    ...(ownerPublicReadback ? { ownerPublicReadback } : {}),
  }
}

export function ownerListingStepResults(text) {
  const steps = JSON.parse(text)
  if (!Array.isArray(steps)) throw new Error('Malformed Owner listing step report')
  return steps.map((step) => {
    const status =
      step?.status === 'running'
        ? 'incomplete'
        : ['pending', 'passed', 'failed'].includes(step?.status)
          ? step.status
          : 'unavailable'
    const result = {
      name: typeof step?.name === 'string' ? step.name : 'unavailable',
      status,
      durationMs:
        step?.status === 'running' && Number.isFinite(step?.startedAtMs)
          ? Math.max(0, Date.now() - step.startedAtMs)
          : Number.isFinite(step?.durationMs) && step.durationMs >= 0
            ? Math.round(step.durationMs)
            : 0,
      operation: ownerListingOperations.has(step?.operation) ? step.operation : 'unknown',
      pathname: ownerListingPathname(step?.pathname),
      ...(step?.observedPathname !== undefined
        ? { observedPathname: ownerListingPathname(step.observedPathname) }
        : {}),
      ...(ownerListingInvitationUiStates.has(step?.invitationUiState)
        ? { invitationUiState: step.invitationUiState }
        : {}),
      ...(Number.isSafeInteger(step?.invitationExchangeHttpStatus) &&
      step.invitationExchangeHttpStatus >= 100 &&
      step.invitationExchangeHttpStatus <= 599
        ? { invitationExchangeHttpStatus: step.invitationExchangeHttpStatus }
        : {}),
    }
    if (step?.mfaVerification && typeof step.mfaVerification === 'object') {
      const mfaVerification = step.mfaVerification
      result.mfaVerification = {
        verifyHttpStatus:
          Number.isSafeInteger(mfaVerification.verifyHttpStatus) &&
          mfaVerification.verifyHttpStatus >= 100 &&
          mfaVerification.verifyHttpStatus <= 599
            ? mfaVerification.verifyHttpStatus
            : null,
        verifyErrorCode: ownerListingMfaErrorCode(mfaVerification.verifyErrorCode),
        factorVerified: mfaVerification.factorVerified === true,
        aal2Session: mfaVerification.aal2Session === true,
        retryExecuted: mfaVerification.retryExecuted === true,
      }
    }
    if (step?.ownerApproval && typeof step.ownerApproval === 'object') {
      const approvalOutcome = (value, includeClaimState = false) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null
        return {
          httpStatus:
            Number.isSafeInteger(value.httpStatus) &&
            value.httpStatus >= 100 &&
            value.httpStatus <= 599
              ? value.httpStatus
              : null,
          responseOk: value.responseOk === true,
          errorCode: ownerListingApprovalErrorCode(value.errorCode),
          errorIdentifier: ownerListingApprovalErrorIdentifier(value.errorIdentifier),
          ...(includeClaimState ? { claimApproved: value.claimApproved === true } : {}),
        }
      }
      result.ownerApproval = {
        approvalRpc: approvalOutcome(step.ownerApproval.approvalRpc),
        caseReadRpc: approvalOutcome(step.ownerApproval.caseReadRpc, true),
      }
    }
    if (step?.failure && typeof step.failure === 'object') {
      const failure = step.failure
      const ownerDenial = ownerListingDenialEvidence(failure.ownerDenial)
      const ownerPublicReadback = ownerListingPublicReadbackEvidence(failure.ownerPublicReadback)
      const assertion = ownerListingAssertions.includes(failure.assertion)
        ? failure.assertion
        : undefined
      const sourceLine =
        Number.isSafeInteger(failure.sourceLine) && failure.sourceLine > 0
          ? failure.sourceLine
          : undefined
      result.failure = {
        ...(assertion ? { assertion } : {}),
        ...(sourceLine ? { sourceLine } : {}),
        timeout: failure.timeout === true,
        category: ownerListingCategories.has(failure.category) ? failure.category : 'operation',
        ...(ownerDenial ? { ownerDenial } : {}),
        ...(ownerPublicReadback ? { ownerPublicReadback } : {}),
      }
    }
    return result
  })
}

export function representativeHoursReport(text, expected = 4) {
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
