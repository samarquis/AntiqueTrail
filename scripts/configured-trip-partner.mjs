#!/usr/bin/env node
/* global AbortController, console, fetch, process, setTimeout, URL */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  createLocalService,
  command,
  freePort,
  ROOT,
  stopChild,
} from './configured-shopper-local.mjs'
import { redact } from './configured-shopper-probe.mjs'
import { browserReport } from './configured-free-shopper-report.mjs'

const runId = crypto.randomUUID()
const output = path.resolve(process.cwd(), 'artifacts', `configured-trip-partner-${runId}`)
fs.mkdirSync(output, { recursive: true })
const report = {
  schemaVersion: 1,
  runId,
  status: 'unavailable',
  evidenceClass: 'real-local-browser',
  cleanup: 'not-started',
  errors: [],
}
const controller = new AbortController()
let service, server
try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  report.temporaryProject = service.run.directory
  const local = await service.start()
  Object.assign(
    report,
    Object.fromEntries(
      [
        'sourceSha',
        'sourceDirty',
        'schemaIdentity',
        'functionIdentity',
        'fixtureIdentity',
        'configIdentity',
        'endpoint',
        'projectId',
      ].map((key) => [key, local[key]]),
    ),
  )
  const secret = path.join(local.directory, 'configured-trip-partner-input.json')
  fs.writeFileSync(secret, JSON.stringify({ ...local, origin }), { mode: 0o600, flag: 'wx' })
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    GITHUB_PAGES: 'false',
    CONFIGURED_TRIP_PARTNER_INPUT: secret,
    CONFIGURED_TRIP_PARTNER_OUTPUT: output,
    CONFIGURED_TRIP_PARTNER_ORIGIN: origin,
  }
  const build = path.join(local.directory, 'configured-trip-partner-dist')
  await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], {
    env,
    signal: controller.signal,
  })
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      build,
      '--host',
      '127.0.0.1',
      '--port',
      new URL(origin).port,
      '--strictPort',
    ],
    { cwd: ROOT, env, windowsHide: true, stdio: 'ignore' },
  )
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(origin)).ok) break
    } catch {
      /* bounded readiness */
    }
    if (attempt === 59) throw new Error('Configured preview unavailable')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  try {
    await command(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'e2e/configured-trip-partner-playwright.config.ts',
      ],
      { env, timeout: 900_000, signal: controller.signal },
    )
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.errors.push(redact(error.message))
  }
  const playwright = path.join(output, 'playwright.json')
  if (!fs.existsSync(playwright)) {
    report.status = 'unavailable'
    report.errors.push('Missing Playwright report')
  } else {
    try {
      const parsed = browserReport(fs.readFileSync(playwright, 'utf8'), 2)
      report.stats = parsed.stats
      report.checks = parsed.checks
      report.variants = Object.fromEntries(
        ['desktop', 'phone'].map((project) => {
          const checks = parsed.checks.filter((check) => check.project === project)
          return [
            project,
            {
              status: checks.length === 1 ? checks[0].status : 'unavailable',
              executed: checks.length,
            },
          ]
        }),
      )
      if (parsed.status !== 'passed') report.status = 'failed'
    } catch (error) {
      report.status = 'unavailable'
      report.errors.push(redact(error.message))
    }
  }
} catch (error) {
  report.status = 'failed'
  report.errors.push(redact(error.message))
} finally {
  await stopChild(server)
  if (service) {
    try {
      report.cleanup = await service.cleanup()
    } catch (error) {
      report.cleanup = 'failed'
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(redact(report), null, 2))
}
console.log(`${report.status}: ${output}`)
process.exitCode = report.status === 'passed' ? 0 : 1
