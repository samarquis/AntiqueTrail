/* global AbortController */
import process from 'node:process'
import { stopChild, command } from './configured-shopper-local.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { setImmediate, setTimeout, clearTimeout } from 'node:timers'
import {
  createLifecycleCapture,
  startLifecycleEvents,
} from './configured-runtime-lifecycle-events.mjs'
import { runLifecycleProof } from './configured-runtime-lifecycle-proof.mjs'

const sourceSha = 'a'.repeat(40)
const startedAt = 1800000000000
const run = {
  projectId: 'owned-project',
  directory: '/tmp/owned-run',
  startupStep: 'edge-readiness',
}
const event = (overrides = {}) => ({
  type: 'container',
  action: 'start',
  id: 'b'.repeat(64),
  name: 'supabase_edge_runtime_owned-project',
  project: run.projectId,
  workdir: run.directory,
  exitCode: '',
  timeNano: String(BigInt(startedAt + 10) * 1000000n),
  ...overrides,
})
const emit = (capture, value) => capture.observe(JSON.stringify(value) + '\n')

test('projects only finite lifecycle fields, separates generations and uses event time for cleanup', () => {
  const capture = createLifecycleCapture(run, startedAt)
  capture.beginCleanup(startedAt + 20)
  emit(capture, event())
  emit(capture, event({ action: 'die', exitCode: '137' }))
  emit(
    capture,
    event({
      id: 'c'.repeat(64),
      action: 'oom',
      timeNano: String(BigInt(startedAt + 30) * 1000000n),
    }),
  )
  const snapshot = capture.snapshot()
  assert.deepEqual(snapshot.events, [
    { elapsedMs: 10, generation: 1, action: 'start', exitCode: null, phase: 'startup' },
    { elapsedMs: 10, generation: 1, action: 'die', exitCode: 137, phase: 'startup' },
    { elapsedMs: 30, generation: 2, action: 'oom', exitCode: null, phase: 'cleanup' },
  ])
  assert.equal(snapshot.coverage, 'since-requested')
  assert.ok(!JSON.stringify(snapshot).includes(run.directory))
  assert.ok(!JSON.stringify(snapshot).includes('b'.repeat(64)))
})
for (const [name, override, reason] of [
  ['wrong project', { project: 'secret-canary' }, 'ownership-mismatch'],
  ['wrong workdir', { workdir: '/secret-canary' }, 'ownership-mismatch'],
  ['wrong name', { name: 'secret-canary' }, 'ownership-mismatch'],
  ['wrong type', { type: 'image' }, 'ownership-mismatch'],
  ['extra metadata', { secret: 'secret-canary' }, 'malformed-event'],
  ['unknown action', { action: 'exec_create' }, 'malformed-event'],
  ['invalid identity', { id: 'secret-canary' }, 'malformed-event'],
  ['invalid clock', { timeNano: 'secret-canary' }, 'malformed-event'],
  ['early event', { timeNano: String(BigInt(startedAt - 1) * 1000000n) }, 'invalid-time'],
  ['future event', { timeNano: String(BigInt(startedAt + 1800001) * 1000000n) }, 'invalid-time'],
  ['invalid exit', { action: 'die', exitCode: '256' }, 'invalid-exit'],
])
  test(name + ' fails closed without leaking input', () => {
    let failures = 0
    const capture = createLifecycleCapture(run, startedAt, () => failures++)
    emit(capture, event(override))
    emit(capture, event())
    assert.equal(capture.snapshot().failure, reason)
    assert.equal(failures, 1)
    assert.deepEqual(capture.snapshot().events, [])
    assert.ok(!JSON.stringify(capture.snapshot()).includes('secret-canary'))
  })
test('fragmented events, malformed JSON and truncated lines', () => {
  const capture = createLifecycleCapture(run, startedAt)
  const line = JSON.stringify(event()) + '\n'
  capture.observe(line.slice(0, 10))
  capture.observe(line.slice(10))
  capture.finish()
  assert.equal(capture.snapshot().events.length, 1)
  for (const [line, reason] of [
    ['{\n', 'malformed-event'],
    ['{', 'partial-event'],
    ['x'.repeat(8193), 'line-limit'],
    ['x'.repeat(131073), 'output-limit'],
  ]) {
    const c = createLifecycleCapture(run, startedAt)
    c.observe(line)
    c.finish()
    assert.equal(c.snapshot().failure, reason)
  }
})
test('event and generation bounds stop collection', () => {
  const capture = createLifecycleCapture(run, startedAt)
  for (let i = 0; i < 129; i++) emit(capture, event())
  assert.equal(capture.snapshot().events.length, 128)
  assert.equal(capture.snapshot().failure, 'event-limit')
  const generations = createLifecycleCapture(run, startedAt)
  for (let i = 0; i < 9; i++) emit(generations, event({ id: i.toString(16).repeat(64) }))
  assert.equal(generations.snapshot().events.length, 8)
  assert.equal(generations.snapshot().failure, 'event-limit')
})
function fakeSpawn(onSpawn) {
  return (binary, args, options) => {
    assert.equal(binary, 'docker')
    assert.equal(args[0], 'events')
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore'])
    assert.ok(args.includes('label=com.supabase.cli.project=' + run.projectId))
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.kill = (signal) => {
      assert.equal(signal, 'SIGTERM')
      child.emit('close', 0)
      return true
    }
    setImmediate(() => {
      child.emit('spawn')
      onSpawn?.(child)
    })
    return child
  }
}
test('collector closes its own child and reports bounded events', async () => {
  const collector = await startLifecycleEvents({
    run,
    startedAt,
    spawnProcess: fakeSpawn((child) => child.stdout.write(JSON.stringify(event()) + '\n')),
  })
  collector.beginCleanup(startedAt + 20)
  const report = await collector.stop()
  assert.equal(report.capture, 'closed')
  assert.equal(report.events.length, 1)
})
test('unexpected collector exit fails closed', async () => {
  let failed = false
  const collector = await startLifecycleEvents({
    run,
    startedAt,
    onFailure: () => {
      failed = true
    },
    spawnProcess: fakeSpawn((child) => child.emit('close', 1)),
  })
  assert.equal(failed, true)
  assert.equal((await collector.stop()).failure, 'collector-exit')
})
test('spawn error rejects without exposing raw error', async () => {
  await assert.rejects(
    startLifecycleEvents({
      run,
      startedAt,
      spawnProcess: () => {
        const child = new EventEmitter()
        child.stdout = new PassThrough()
        setImmediate(() => {
          child.emit('error', new Error('secret-canary'))
          child.emit('close', 1)
        })
        return child
      },
    }),
    { message: 'Collector unavailable' },
  )
})
function fixture({
  startError = false,
  cleanupError = false,
  collectorError = false,
  waitForAbort = false,
} = {}) {
  let starts = 0,
    cleanups = 0,
    recoveries = 0
  const serviceFactory = (options) => {
    if (options.resumeDirectory) {
      assert.equal(options.resumeDirectory, run.directory)
      recoveries++
      return {
        cleanup: async () => {
          cleanups++
          return 'removed'
        },
      }
    }
    return {
      run,
      start: async () => {
        starts++
        options.onServingLifecycle({ event: 'spawn', exitCode: null, signal: null })
        if (waitForAbort)
          await new Promise((resolve) =>
            options.signal.addEventListener('abort', resolve, { once: true }),
          )
        options.onServingLifecycle({ event: 'exit', exitCode: 1, signal: null })
        if (startError || waitForAbort) throw new Error('secret-canary')
      },
      cleanup: async () => {
        cleanups++
        if (cleanupError) throw new Error('secret-canary')
        return 'removed'
      },
    }
  }
  const eventsFactory = async ({ onFailure }) => {
    if (collectorError) onFailure()
    return {
      beginCleanup() {},
      stop: async () => ({
        capture: collectorError ? 'incomplete' : 'closed',
        coverage: 'since-requested',
        events: [],
      }),
    }
  }
  return { serviceFactory, eventsFactory, counts: () => ({ starts, cleanups, recoveries }) }
}
for (const startError of [false, true])
  test(
    'one startup attempt with ' + (startError ? 'failure' : 'readiness') + ' still cleans up',
    async () => {
      const f = fixture({ startError })
      const report = await runLifecycleProof({ sourceSha, ...f })
      assert.equal(report.status, 'collected')
      assert.equal(report.startupOutcome, startError ? 'failed' : 'ready')
      assert.deepEqual(f.counts(), { starts: 1, cleanups: 1, recoveries: 0 })
      assert.equal(report.serving.length, 2)
      assert.ok(!JSON.stringify(report).includes('secret-canary'))
    },
  )
test('cleanup recovery never repeats startup', async () => {
  const f = fixture({ cleanupError: true })
  const report = await runLifecycleProof({ sourceSha, ...f })
  assert.equal(report.cleanupRecovery, true)
  assert.equal(report.cleanup, 'removed')
  assert.deepEqual(f.counts(), { starts: 1, cleanups: 2, recoveries: 1 })
})
test('collector failure prevents startup and still cleans owned resources', async () => {
  const f = fixture({ collectorError: true })
  const report = await runLifecycleProof({ sourceSha, ...f })
  assert.equal(report.status, 'diagnostic-failed')
  assert.equal(report.attempts, 0)
  assert.equal(f.counts().starts, 0)
  assert.equal(report.cleanup, 'removed')
})
test('deadline aborts one attempt, cleans up, and cannot count as collected', async () => {
  const f = fixture({ waitForAbort: true })
  const report = await runLifecycleProof({ sourceSha, ...f, budgetMs: 1 })
  assert.equal(report.deadlineReached, true)
  assert.equal(report.startupOutcome, 'interrupted')
  assert.equal(report.status, 'diagnostic-failed')
  assert.equal(report.cleanup, 'removed')
  assert.equal(f.counts().starts, 1)
})
test('invalid SHA rejected before creating service', async () => {
  await assert.rejects(
    runLifecycleProof({ sourceSha: 'bad', serviceFactory: () => assert.fail('must not create') }),
    /Exact source SHA/,
  )
})

for (const recovery of [false, true])
  test(
    'hung ' +
      (recovery ? 'recovery' : 'primary') +
      ' cleanup aborts, stops collector and restores listeners',
    async () => {
      const before = ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name))
      let starts = 0,
        attempts = 0,
        stopped = 0,
        cancelled = false,
        lateFinish
      const report = await runLifecycleProof({
        sourceSha,
        cleanupBudgetMs: 2,
        cancellationGraceMs: 2,
        serviceFactory: () => ({
          run,
          start: async () => {
            starts++
          },
          cleanup: ({ signal }) => {
            attempts++
            if (recovery && attempts === 1) throw new Error('initial cleanup failed')
            signal.addEventListener(
              'abort',
              () => {
                cancelled = true
              },
              { once: true },
            )
            return new Promise((resolve) => {
              lateFinish = resolve
            })
          },
        }),
        eventsFactory: async () => ({
          beginCleanup() {},
          stop: async () => {
            stopped++
            return { capture: 'closed' }
          },
        }),
      })
      assert.equal(report.status, 'diagnostic-failed')
      assert.equal(report.startupOutcome, 'ready')
      assert.equal(report.cleanup, 'failed')
      assert.equal(report.cleanupTimedOut, true)
      assert.equal(report.cleanupRecovery, recovery)
      assert.equal(cancelled, true)
      assert.equal(starts, 1)
      assert.equal(attempts, recovery ? 2 : 1)
      assert.equal(stopped, 1)
      assert.deepEqual(
        ['SIGINT', 'SIGTERM'].map((name) => process.listenerCount(name)),
        before,
      )
      const frozen = JSON.stringify(report)
      lateFinish('removed')
      await new Promise((resolve) => setImmediate(resolve))
      assert.equal(JSON.stringify(report), frozen)
    },
  )
test('cancellation-aware cleanup settles before receipt and blocks further mutation', async () => {
  let cancelled = false,
    mutated = false
  const f = fixture()
  f.serviceFactory = () => ({
    run,
    start: async () => {},
    cleanup: async ({ signal }) => {
      await new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            cancelled = true
            resolve()
          },
          { once: true },
        ),
      )
      signal.throwIfAborted()
      mutated = true
      return 'removed'
    },
  })
  const report = await runLifecycleProof({
    sourceSha,
    ...f,
    cleanupBudgetMs: 2,
    cancellationGraceMs: 10,
  })
  assert.equal(cancelled, true)
  assert.equal(mutated, false)
  assert.equal(report.cleanupTimedOut, true)
  assert.equal(report.status, 'diagnostic-failed')
})
test('hung collector stop receives cancellation and cannot retain signal listeners', async () => {
  const before = process.listenerCount('SIGTERM')
  let cancelled = false
  const f = fixture()
  f.eventsFactory = async () => ({
    beginCleanup() {},
    stop: ({ signal }) =>
      new Promise(() => {
        signal.addEventListener(
          'abort',
          () => {
            cancelled = true
          },
          { once: true },
        )
      }),
  })
  const report = await runLifecycleProof({
    sourceSha,
    ...f,
    collectorBudgetMs: 2,
    cancellationGraceMs: 2,
  })
  assert.equal(report.status, 'diagnostic-failed')
  assert.equal(report.lifecycle.capture, 'incomplete')
  assert.equal(cancelled, true)
  assert.equal(process.listenerCount('SIGTERM'), before)
})
test('owned child cleanup escalates to KILL on cancellation and removes listeners', async () => {
  const child = new EventEmitter()
  child.exitCode = null
  child.signalCode = null
  const signals = []
  child.kill = (signal) => signals.push(signal ?? 'SIGTERM')
  const controller = new AbortController()
  const stopping = stopChild(child, { signal: controller.signal })
  controller.abort()
  await assert.rejects(stopping, /cleanup aborted/)
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  assert.equal(child.listenerCount('close'), 0)
})
test('cancelled cleanup command cannot spawn its next subprocess', () => {
  const controller = new AbortController()
  controller.abort()
  assert.throws(
    () => command('must-not-spawn', [], { signal: controller.signal, killSignal: 'SIGKILL' }),
    { name: 'AbortError' },
  )
})

test('owned cleanup subprocess is forcibly cancelled and settles', async () => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try {
    await assert.rejects(
      command(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
        signal: controller.signal,
        killSignal: 'SIGKILL',
      }),
    )
    assert.equal(controller.signal.aborted, true)
  } finally {
    clearTimeout(timer)
  }
})
