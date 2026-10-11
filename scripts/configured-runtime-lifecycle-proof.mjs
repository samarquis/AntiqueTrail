/* global AbortController */
import { setTimeout, clearTimeout } from 'node:timers'
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  createLocalService,
  captureLocalStartupFailure,
  command,
} from './configured-shopper-local.mjs'
import { projectPrimaryFailure } from './issue-568-private-stop-proof-report.mjs'
import { startLifecycleEvents } from './configured-runtime-lifecycle-events.mjs'

export async function runLifecycleProof({
  sourceSha,
  serviceFactory = createLocalService,
  eventsFactory = startLifecycleEvents,
  now = Date.now,
  budgetMs = 1080000,
}) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) throw new Error('Exact source SHA required')
  const controller = new AbortController(),
    startedAt = now()
  const report = {
    schema: 'configured-runtime-lifecycle/v1',
    sourceSha,
    attempts: 0,
    status: 'diagnostic-failed',
    startupOutcome: 'not-started',
    startupFailure: null,
    serving: [],
    cleanup: 'not-started',
    cleanupRecovery: false,
    lifecycle: null,
  }
  let service,
    collector,
    cleanupAt = null,
    deadline = false
  const timer = setTimeout(() => {
    deadline = true
    controller.abort()
  }, budgetMs)
  const interrupt = () => controller.abort()
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  try {
    service = serviceFactory({
      signal: controller.signal,
      onServingLifecycle(value) {
        if (report.serving.length >= 2 || !['spawn', 'exit'].includes(value.event)) return
        report.serving.push({
          event: value.event,
          elapsedMs: Math.max(0, now() - startedAt),
          phase: cleanupAt === null ? 'startup' : 'cleanup',
          exitCode:
            Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255
              ? value.exitCode
              : null,
          signal: [null, 'SIGTERM', 'SIGKILL'].includes(value.signal) ? value.signal : 'other',
        })
      },
    })
    collector = await eventsFactory({
      run: service.run,
      startedAt,
      onFailure: () => controller.abort(),
    })
    controller.signal.throwIfAborted()
    report.attempts = 1
    try {
      await service.start()
      report.startupOutcome = 'ready'
    } catch (error) {
      report.startupOutcome = controller.signal.aborted ? 'interrupted' : 'failed'
      report.startupFailure = projectPrimaryFailure(
        'local-services',
        captureLocalStartupFailure(service.run, error),
      ).startupFailure
    }
  } catch {
    report.startupOutcome = 'diagnostic-unavailable'
  } finally {
    clearTimeout(timer)
    cleanupAt = now()
    collector?.beginCleanup(cleanupAt)
    if (service) {
      try {
        report.cleanup = await service.cleanup()
      } catch {
        report.cleanup = 'failed'
      }
      // An aborted startup signal can also reject the original helper's cleanup commands.
      // Recovery uses its existing ownership-checked cleanup-only interface, never another start.
      if (report.cleanup !== 'removed') {
        report.cleanupRecovery = true
        try {
          report.cleanup = await serviceFactory({
            resumeDirectory: service.run.directory,
          }).cleanup()
        } catch {
          report.cleanup = 'failed'
        }
      }
    }
    if (collector) {
      try {
        report.lifecycle = await collector.stop()
      } catch {
        report.lifecycle = { capture: 'incomplete', failure: 'collector-stop' }
      }
    }
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
  report.deadlineReached = deadline
  report.elapsedMs = Math.max(0, now() - startedAt)
  if (
    report.attempts === 1 &&
    ['ready', 'failed'].includes(report.startupOutcome) &&
    report.cleanup === 'removed' &&
    report.lifecycle?.capture === 'closed'
  )
    report.status = 'collected'
  return report
}

async function main() {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_OS !== 'Linux' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.RUNTIME_DIAGNOSTIC !== 'true' ||
    process.env.GITHUB_RUN_ATTEMPT !== '1'
  )
    throw new Error('CI-only explicit diagnostic required')
  const expected = process.env.EXPECTED_SOURCE_SHA
  if (!/^[a-f0-9]{40}$/.test(expected ?? '')) throw new Error('Exact source SHA required')
  if (
    (await command('git', ['rev-parse', 'HEAD'])).trim() !== expected ||
    (await command('git', ['status', '--porcelain'])).trim()
  )
    throw new Error('Source identity mismatch')
  const report = await runLifecycleProof({ sourceSha: expected })
  const output = path.join(process.env.RUNNER_TEMP, 'configured-runtime-lifecycle.json')
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
  console.log(
    'Runtime diagnostic ' +
      report.status +
      '; startup=' +
      report.startupOutcome +
      '; cleanup=' +
      report.cleanup,
  )
  process.exitCode = report.status === 'collected' ? 0 : 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error('Runtime diagnostic unavailable')
    process.exitCode = 1
  })
