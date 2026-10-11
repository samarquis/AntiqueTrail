import { Buffer } from 'node:buffer'

const classes = new Set([
  'unknown',
  'database-not-running',
  'database-inspection-failure',
  'environment-file-load-failure',
  'environment-file-parse-failure',
  'container-exited',
  'docker-logs-exited',
])
const captures = new Set(['pending', 'complete', 'truncated', 'unavailable'])
const exitClasses = new Set(['container-exited', 'docker-logs-exited'])
const unknown = () => ({ observedErrorClass: 'unknown', reportedExitCode: null })
const validExitCode = (value) => Number.isInteger(value) && value >= 0 && value <= 255

export function projectServingDiagnostic(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value).sort().join(',')
  if (keys !== 'capture,observedErrorClass,reportedExitCode,servingExitCode,servingState')
    return undefined
  if (
    !captures.has(value.capture) ||
    !classes.has(value.observedErrorClass) ||
    !['running', 'exited', 'signaled', 'unavailable'].includes(value.servingState) ||
    (value.servingState === 'exited'
      ? !validExitCode(value.servingExitCode)
      : value.servingExitCode !== null) ||
    (exitClasses.has(value.observedErrorClass)
      ? !validExitCode(value.reportedExitCode)
      : value.reportedExitCode !== null) ||
    (value.capture !== 'complete' && value.observedErrorClass !== 'unknown')
  )
    return undefined
  return {
    capture: value.capture,
    observedErrorClass: value.observedErrorClass,
    reportedExitCode: value.reportedExitCode,
    servingState: value.servingState,
    servingExitCode: value.servingExitCode,
  }
}

// Pinned supabase CLI 2.115.0: shared/functions/serve.ts and shared/output/output.layer.ts.
// Only a complete error line immediately followed by the CLI's fixed fatal trailer counts.
// These are observed signatures, not proof of root cause or trusted application output.
function classifyLine(line) {
  if (line === 'supabase start is not running.')
    return { observedErrorClass: 'database-not-running', reportedExitCode: null }
  if (/^failed to inspect service(?:: .+)?$/.test(line))
    return { observedErrorClass: 'database-inspection-failure', reportedExitCode: null }
  for (const operation of ['load', 'parse'])
    if (line.startsWith(`failed to ${operation} environment file: `))
      return { observedErrorClass: `environment-file-${operation}-failure`, reportedExitCode: null }
  if (/^container exited gracefully: .+$/.test(line))
    return { observedErrorClass: 'container-exited', reportedExitCode: 0 }
  const exit = /^(error running container: exit|docker logs exited with) ([0-9]{1,3})$/.exec(line)
  if (exit && validExitCode(Number(exit[2])))
    return {
      observedErrorClass:
        exit[1] === 'error running container: exit' ? 'container-exited' : 'docker-logs-exited',
      reportedExitCode: Number(exit[2]),
    }
  return unknown()
}

export function createServingDiagnosticObserver() {
  const trailer = 'Try rerunning the command with --debug to troubleshoot the error.'
  let capture = 'pending'
  let bytes = 0
  let line = ''
  let previous = unknown()
  let observed = unknown()
  let pairs = 0
  function discard(state) {
    capture = state
    line = ''
    previous = unknown()
    observed = unknown()
  }
  function completeLine() {
    const parts = line.replace(/\r$/, '').split(String.fromCharCode(27))
    const sgrOnly = parts.slice(1).every((part) => /^\[[0-9;]*m/.test(part))
    const text = sgrOnly
      ? parts.map((part, index) => (index ? part.replace(/^\[[0-9;]*m/, '') : part)).join('')
      : ''
    line = ''
    if (text === trailer) {
      pairs++
      observed = pairs === 1 ? previous : unknown()
      previous = unknown()
    } else {
      // Timestamped container logs and warning-prefixed lines cannot match.
      previous = /[^\x20-\x7e]/.test(text) ? unknown() : classifyLine(text)
      // Output after a fatal trailer makes its attribution ambiguous.
      if (pairs > 0) observed = unknown()
    }
  }
  return {
    observe(chunk) {
      if (capture !== 'pending') return
      try {
        if (!Buffer.isBuffer(chunk)) return discard('unavailable')
        if (bytes + chunk.length > 65_536) return discard('truncated')
        bytes += chunk.length
        for (const byte of chunk) {
          if (byte === 10) completeLine()
          else if (line.length >= 4_096) return discard('truncated')
          else line += String.fromCharCode(byte)
        }
      } catch {
        discard('unavailable')
      }
    },
    finish() {
      if (capture !== 'pending') return
      // A partial line at EOF is not a complete CLI error/trailer pair.
      if (line.length) observed = unknown()
      line = ''
      previous = unknown()
      capture = 'complete'
    },
    unavailable() {
      discard('unavailable')
    },
    snapshot() {
      return { capture, ...(capture === 'complete' ? observed : unknown()) }
    },
  }
}
