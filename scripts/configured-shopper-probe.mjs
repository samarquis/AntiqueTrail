#!/usr/bin/env node
/* global URL, console, process, AbortController */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalService, command, ROOT } from './configured-shopper-local.mjs'
import { createExecutor } from './configured-shopper-executor.mjs'
export const COMMANDS = [
  'catalog_list',
  'catalog_details',
  'shopper_save_state',
  'shopper_list_saved',
  'create_trip',
  'get_trip',
  'rename_trip',
  'update_schedule',
  'add_stop',
  'remove_stop',
  'set_priority',
  'set_dwell',
  'reorder_stops',
]
function commandRole(command) {
  return command.startsWith('catalog_')
    ? 'authenticated-shopper-via-public-catalog-edge'
    : 'authenticated-shopper'
}
export function requireLoopbackUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Configured shopper probe requires a valid URL.')
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Configured shopper probe refuses non-loopback or non-HTTP endpoints.')
  return url.origin
}
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /(token|secret|password|authorization|cookie|private|email|anonKey|users)/i.test(key)
          ? '[REDACTED]'
          : redact(child),
      ]),
    )
  if (typeof value !== 'string') return value
  return value
    .replace(/eyJ[A-Za-z0-9_.-]+|\b(?:sb-|sk_|pk_)[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(
      /((?:token|secret|password|authorization|cookie|private|email)\s*[=:]\s*)\S+/gi,
      '$1[REDACTED]',
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED]')
}
export async function runChecks({
  commands = COMMANDS,
  execute,
  sourceSha,
  schemaIdentity,
  endpointClass = 'local-loopback',
}) {
  const results = []
  for (const command of commands) {
    try {
      const result = await execute(command)
      if (
        !result ||
        !['pass', 'fail', 'unavailable'].includes(result.status) ||
        typeof result.detail !== 'string' ||
        !result.detail.trim()
      )
        throw new Error('Missing or malformed executor result')
      results.push({
        command,
        status: result.status,
        evidenceClass: result.evidenceClass ?? 'configured-local-transport',
        role: commandRole(command),
        detail: redact(result.detail),
      })
    } catch (error) {
      results.push({
        command,
        status: 'fail',
        role: commandRole(command),
        evidenceClass: 'configured-local-transport',
        detail: redact(error instanceof Error ? error.message : String(error)),
      })
    }
  }
  return { sourceSha, schemaIdentity, endpointClass, results }
}
export function createRunDirectory(base = path.join(process.cwd(), 'artifacts')) {
  const runId = crypto.randomUUID(),
    directory = path.resolve(base, `configured-shopper-${runId}`)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, '.owner'), `${runId}\n`, { flag: 'wx' })
  return { runId, directory }
}
export async function runProbe({
  output,
  endpoint,
  execute,
  serviceFactory = createLocalService,
} = {}) {
  const run = createRunDirectory(output),
    report = {
      schemaVersion: 2,
      runId: run.runId,
      status: 'unavailable',
      endpointClass: 'local-loopback',
      cleanup: 'not-started',
      errors: [],
      checks: [],
    }
  const controller = new AbortController()
  let service,
    interrupted = false
  const interrupt = () => {
    interrupted = true
    controller.abort()
  }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  try {
    // Target selection is never accepted by the real runner, even if loopback.
    if (endpoint || process.env.ANTIQUE_TRAIL_LOCAL_URL) {
      requireLoopbackUrl(endpoint ?? process.env.ANTIQUE_TRAIL_LOCAL_URL)
      if (!execute)
        throw new Error(
          'External service selection is unavailable; the runner owns its disposable service.',
        )
    }
    report.sourceSha = (await command('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).trim()
    if (!execute) {
      service = serviceFactory({ signal: controller.signal })
      report.projectId = service.run?.projectId
      report.temporaryProject = service.run?.directory
      const local = await service.start()
      for (const key of [
        'sourceSha',
        'sourceDirty',
        'schemaIdentity',
        'functionIdentity',
        'fixtureIdentity',
        'configIdentity',
        'endpoint',
        'projectId',
        'cliVersion',
      ])
        report[key] = local[key]
      execute = createExecutor(service)
    }
    const checks = await runChecks({
      execute: async (name) => {
        if (interrupted) return { status: 'unavailable', detail: 'Run interrupted' }
        return execute(name)
      },
      sourceSha: report.sourceSha,
      schemaIdentity: report.schemaIdentity,
    })
    report.checks = checks.results
    report.endpointClass = 'local-loopback'
    report.status =
      report.checks.length === COMMANDS.length && report.checks.every((c) => c.status === 'pass')
        ? 'passed'
        : report.checks.some((c) => c.status === 'fail')
          ? 'failed'
          : 'unavailable'
  } catch (error) {
    report.errors.push(redact(error instanceof Error ? error.message : String(error)))
  } finally {
    if (service)
      try {
        report.cleanup = await service.cleanup()
      } catch (error) {
        report.cleanup = 'failed'
        report.status = 'failed'
        report.errors.push(redact(error.message))
      }
    if (interrupted) {
      report.status = 'unavailable'
      report.errors.push('Run interrupted')
    }
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
    if (!report.checks.length)
      report.checks = COMMANDS.map((command) => ({
        command,
        status: 'unavailable',
        role: commandRole(command),
        evidenceClass: 'configured-local-transport',
        detail: 'Setup did not complete',
      }))
    fs.writeFileSync(
      path.join(run.directory, 'report.json'),
      `${JSON.stringify(redact(report), null, 2)}\n`,
    )
  }
  return { ...report, directory: run.directory }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--local')) {
    console.error(
      'Usage: node scripts/configured-shopper-probe.mjs --local --output artifacts/configured-shopper-probe',
    )
    process.exitCode = 2
  } else {
    const cleanupIndex = process.argv.indexOf('--cleanup')
    if (cleanupIndex >= 0) {
      try {
        const directory = process.argv[cleanupIndex + 1]
        if (!directory || !path.isAbsolute(directory))
          throw new Error('Cleanup needs the absolute temporary project path from a report')
        console.log(await createLocalService({ resumeDirectory: directory }).cleanup())
      } catch (error) {
        console.error(redact(error.message))
        process.exitCode = 1
      }
    } else {
      const index = process.argv.indexOf('--output')
      const report = await runProbe({ output: index >= 0 ? process.argv[index + 1] : undefined })
      console.log(JSON.stringify(redact(report), null, 2))
      if (report.status !== 'passed') process.exitCode = report.status === 'failed' ? 1 : 2
    }
  }
}
