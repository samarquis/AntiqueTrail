#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

export function requireLoopbackUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Configured shopper probe requires a valid URL.')
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Configured shopper probe refuses non-loopback or non-HTTP endpoints.')
  }
  return url.origin
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /(token|secret|password|authorization|cookie|private|email)/i.test(key)
          ? '[REDACTED]'
          : redact(child),
      ]),
    )
  }
  if (typeof value !== 'string') return value
  if (/^(eyJ|sb-|sk_|pk_)/.test(value)) return '[REDACTED]'
  return value.replace(
    /((?:token|secret|password|authorization|cookie|private|email)\s*[=:]\s*)\S+/gi,
    '$1[REDACTED]',
  )
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
      results.push({
        command,
        status: result?.status ?? 'pass',
        evidenceClass: result?.evidenceClass ?? 'configured-local-transport',
        detail: redact(result?.detail ?? 'acknowledged and read back'),
      })
    } catch (error) {
      results.push({
        command,
        status: 'fail',
        evidenceClass: 'configured-local-transport',
        detail: redact(error instanceof Error ? error.message : String(error)),
      })
    }
  }
  return { sourceSha, schemaIdentity, endpointClass, results }
}

export function createRunDirectory(base = path.join(process.cwd(), 'artifacts')) {
  const runId = crypto.randomUUID()
  const directory = path.join(base, `configured-shopper-${runId}`)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, '.owner'), `${runId}\n`, { flag: 'wx' })
  return { runId, directory }
}

export async function runProbe({
  output,
  endpoint = process.env.ANTIQUE_TRAIL_LOCAL_URL,
  execute,
} = {}) {
  const run = createRunDirectory(output ?? path.join(process.cwd(), 'artifacts'))
  const report = {
    schemaVersion: 1,
    runId: run.runId,
    status: 'unavailable',
    cleanup: 'run-owned-directory-created',
    errors: [],
    checks: [],
  }
  try {
    const baseUrl = requireLoopbackUrl(endpoint ?? '')
    if (!execute)
      throw new Error(
        'Local configured services are unavailable; set ANTIQUE_TRAIL_LOCAL_URL and provide the disposable service runner.',
      )
    Object.assign(
      report,
      await runChecks({
        execute,
        sourceSha: process.env.GITHUB_SHA ?? 'local-working-tree',
        schemaIdentity: process.env.ANTIQUE_TRAIL_SCHEMA_IDENTITY ?? 'unreported',
      }),
    )
    report.checks = report.results
    delete report.results
    report.status = report.checks.some((check) => check.status === 'fail') ? 'failed' : 'passed'
    report.endpoint = baseUrl
  } catch (error) {
    report.errors.push(redact(error instanceof Error ? error.message : String(error)))
  } finally {
    fs.writeFileSync(
      path.join(run.directory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
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
    const outputIndex = process.argv.indexOf('--output')
    const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
    const report = await runProbe({ output })
    console.log(JSON.stringify(redact(report), null, 2))
    if (report.status !== 'passed') process.exitCode = report.status === 'failed' ? 1 : 2
  }
}
