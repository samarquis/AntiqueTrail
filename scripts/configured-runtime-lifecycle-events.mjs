import { Buffer } from 'node:buffer'
import { setTimeout, clearTimeout } from 'node:timers'
import { spawn } from 'node:child_process'

export const lifecycleFormat =
  '{"type":{{json .Type}},"action":{{json .Action}},"id":{{json .Actor.ID}},"name":{{json (index .Actor.Attributes "name")}},"project":{{json (index .Actor.Attributes "com.supabase.cli.project")}},"workdir":{{json (index .Actor.Attributes "com.supabase.cli.workdir")}},"exitCode":{{json (index .Actor.Attributes "exitCode")}},"timeNano":"{{.TimeNano}}"}'
const actions = ['create', 'start', 'die', 'oom', 'destroy']

export function createLifecycleCapture(run, startedAt, onFailure = () => {}) {
  let buffer = '',
    bytes = 0,
    failure = null,
    cleanupAt = null
  const events = [],
    generations = new Map()
  const fail = (reason) => {
    if (!failure) {
      failure = reason
      onFailure()
    }
  }
  function observe(chunk) {
    if (failure) return
    bytes += Buffer.byteLength(chunk)
    if (bytes > 131072) return fail('output-limit')
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop()
    if (buffer.length > 8192) return fail('line-limit')
    for (const line of lines) {
      if (!line || failure) continue
      if (line.length > 8192) {
        fail('line-limit')
        break
      }
      let value
      try {
        value = JSON.parse(line)
      } catch {
        fail('malformed-event')
        break
      }
      if (
        !value ||
        Object.keys(value).sort().join(',') !==
          'action,exitCode,id,name,project,timeNano,type,workdir'
      ) {
        fail('malformed-event')
        break
      }
      if (
        value.type !== 'container' ||
        value.project !== run.projectId ||
        value.workdir !== run.directory ||
        value.name !== 'supabase_edge_runtime_' + run.projectId
      ) {
        fail('ownership-mismatch')
        break
      }
      if (
        !actions.includes(value.action) ||
        !/^[a-f0-9]{64}$/.test(value.id) ||
        !/^[0-9]{16,22}$/.test(value.timeNano)
      ) {
        fail('malformed-event')
        break
      }
      const elapsedMs = Number(BigInt(value.timeNano) / 1000000n) - startedAt
      if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || elapsedMs > 1800000) {
        fail('invalid-time')
        break
      }
      const exitCode =
        value.action === 'die' &&
        typeof value.exitCode === 'string' &&
        /^(0|[1-9][0-9]{0,2})$/.test(value.exitCode) &&
        Number(value.exitCode) <= 255
          ? Number(value.exitCode)
          : null
      if (value.action === 'die' && exitCode === null) {
        fail('invalid-exit')
        break
      }
      if (!generations.has(value.id)) generations.set(value.id, generations.size + 1)
      if (events.length >= 128 || generations.size > 8) {
        fail('event-limit')
        break
      }
      events.push({
        elapsedMs,
        generation: generations.get(value.id),
        action: value.action,
        exitCode,
      })
    }
  }
  return {
    observe,
    fail,
    beginCleanup(now) {
      cleanupAt = now - startedAt
    },
    finish() {
      if (buffer.trim()) fail('partial-event')
    },
    snapshot() {
      return {
        coverage: 'since-requested',
        failure,
        cleanupAtMs: cleanupAt,
        events: events.map((event) => ({
          ...event,
          phase: cleanupAt !== null && event.elapsedMs >= cleanupAt ? 'cleanup' : 'startup',
        })),
      }
    },
  }
}

// CLI has no subscription-ready acknowledgement. --since requests replay to cover spawn latency;
// the receipt never claims a complete daemon history (Docker retains only 256 historical events).
export async function startLifecycleEvents({ run, startedAt, onFailure, spawnProcess = spawn }) {
  const capture = createLifecycleCapture(run, startedAt, onFailure)
  const args = [
    'events',
    '--since',
    String(Math.floor(startedAt / 1000)),
    '--filter',
    'type=container',
    '--filter',
    'label=com.supabase.cli.project=' + run.projectId,
    '--filter',
    'container=supabase_edge_runtime_' + run.projectId,
    ...actions.flatMap((action) => ['--filter', 'event=' + action]),
    '--format',
    lifecycleFormat,
  ]
  const child = spawnProcess('docker', args, {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  })
  let closing = false,
    closed = false
  const finished = new Promise((resolve) =>
    child.once('close', () => {
      closed = true
      capture.finish()
      if (!closing) capture.fail('collector-exit')
      resolve()
    }),
  )
  child.stdout.on('data', capture.observe)
  child.stdout.on('error', () => capture.fail('collector-stream'))
  child.on('error', () => capture.fail('collector-spawn'))
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', () => reject(new Error('Collector unavailable')))
  })
  return {
    beginCleanup: capture.beginCleanup,
    async stop({ signal } = {}) {
      const abort = () => {
        if (!closed) child.kill('SIGKILL')
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      try {
        closing = true
        if (!closed) child.kill('SIGTERM')
        let timer
        await Promise.race([
          finished,
          new Promise((resolve) => {
            timer = setTimeout(resolve, 2000)
          }),
        ])
        clearTimeout(timer)
        if (!closed) {
          capture.fail('collector-stop')
          child.kill('SIGKILL')
          await Promise.race([
            finished,
            new Promise((resolve) => {
              timer = setTimeout(resolve, 2000)
            }),
          ])
          clearTimeout(timer)
        }
        return {
          capture: closed && !capture.snapshot().failure ? 'closed' : 'incomplete',
          ...capture.snapshot(),
        }
      } finally {
        signal?.removeEventListener('abort', abort)
      }
    },
  }
}
