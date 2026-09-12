import { redact } from './configured-shopper-probe.mjs'

export function classifyRpcError(error) {
  const match = String(error?.message ?? error).match(
    /HTTP (\d{3}) ([A-Za-z0-9_]+)(?: ([A-Za-z0-9_ .]+))?/,
  )
  if (!match) return { outcome: 'transport-error', reason: 'unclassified' }
  const status = Number(match[1])
  const code = match[2]
  const message = match[3]?.trim() ?? ''
  if (status === 400 && code === 'P0001' && message === 'not_allowed') {
    return { outcome: 'denied', status, code, reason: 'not_allowed' }
  }
  const deniedFunction = message.match(/^permission denied for function ([a-z_]+)$/)
  if (code === '42501' && deniedFunction) {
    return {
      outcome: 'server-error',
      status,
      code,
      reason: 'function-execute-permission-denied',
      function: deniedFunction[1],
    }
  }
  return {
    outcome: status >= 500 ? 'server-error' : 'unexpected-error',
    status,
    code,
    reason: 'unclassified',
  }
}

export function failureStatus(phase) {
  return phase === 'startup' ? 'unavailable' : 'failed'
}

export function diagnosticPassed(report) {
  const controlDenied =
    report.checks.wrongRecipient.outcome === 'denied' &&
    report.checks.wrongRecipient.reason === 'not_allowed'
  const controlPreserved =
    report.afterControl.invitationState === 'pending' && report.afterControl.membershipCount === 0
  const intendedAccepted =
    report.checks.intendedRecipient.outcome === 'accepted' &&
    report.afterAcceptance.invitationState === 'accepted' &&
    report.afterAcceptance.acceptedRecipientMatches === true &&
    report.afterAcceptance.membershipCount === 1
  return controlDenied && controlPreserved && intendedAccepted
}

export function statusAfterCleanup(status, cleanup) {
  return cleanup === 'removed' ? status : 'failed'
}

export function safeReportJson(report, secrets = []) {
  let output = JSON.stringify(redact(report), null, 2)
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 3)
      output = output.replaceAll(secret, '[REDACTED]')
  }
  return output
}
