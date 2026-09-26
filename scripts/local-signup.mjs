#!/usr/bin/env node
/* global process, console, AbortController, AbortSignal, setTimeout, fetch, URL */
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
import { createRunDirectory, redact } from './configured-shopper-probe.mjs'

const output = createRunDirectory(path.join(ROOT, 'artifacts', 'local-signup'))
const controller = new AbortController()
const report = {
  status: 'unavailable',
  sourceSha: '',
  sourceDirty: false,
  evidenceClass: 'real-local-provider-and-browser',
  projectId: '',
  provider: 'not-started',
  callback: 'not-started',
  admission: 'not-started',
  privateSave: 'not-started',
  cleanup: 'not-started',
  failureStage: '',
  output: output.directory,
}
let service, server
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
function writeReport() {
  fs.writeFileSync(path.join(output.directory, 'report.json'), JSON.stringify(report, null, 2))
}

try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  report.sourceDirty = Boolean(
    (await command('git', ['status', '--porcelain', '--untracked-files=no'])).trim(),
  )
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({
    signal: controller.signal,
    browserOrigin: origin,
    signupJourney: true,
    createTestUsers: false,
  })
  report.projectId = service.run.projectId
  writeReport()
  console.log(`Starting run-owned local provider. Evidence: ${output.directory}`)
  const local = await service.start()
  report.provider = 'ready'
  const inputPath = path.join(local.directory, 'browser-input.json')
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      directory: local.directory,
      endpoint: local.endpoint,
      mailEndpoint: local.mailEndpoint,
      anonKey: local.anonKey,
      origin,
      output: output.directory,
    }),
    { mode: 0o600, flag: 'wx' },
  )
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    GITHUB_PAGES: 'false',
    VITE_COMMERCIAL_RESEARCH_REVIEW: 'false',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
    VITE_BROWSE_MAP_ENABLED: 'false',
    LOCAL_SIGNUP_INPUT: inputPath,
  }
  const build = path.join(local.directory, 'browser-dist')
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
  server.on('error', () => {})
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    controller.signal.throwIfAborted()
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true
        break
      }
    } catch {
      /* Wait for the run-owned preview. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Browser preview unavailable')
  report.failureStage = 'browser signup journey'
  writeReport()
  await command(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'e2e/local-signup-playwright.config.ts',
    ],
    { env, timeout: 900_000, signal: controller.signal },
  )
  const journey = JSON.parse(fs.readFileSync(path.join(output.directory, 'journey.json'), 'utf8'))
  report.callback = journey.callback
  report.admission = journey.admission
  report.privateSave = journey.save
  report.failureStage = ''
  report.status = [report.callback, report.admission, report.privateSave].every(
    (state) => state === 'passed',
  )
    ? 'passed'
    : 'failed'
} catch (error) {
  report.status = 'failed'
  report.error = redact(error instanceof Error ? error.message : String(error)).slice(-2000)
  if (!report.failureStage) {
    report.failureStage = service ? 'local provider startup' : 'local setup'
    report.diagnostic = redact(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    )
  }
  const journeyPath = path.join(output.directory, 'journey.json')
  if (fs.existsSync(journeyPath)) {
    const journey = JSON.parse(fs.readFileSync(journeyPath, 'utf8'))
    report.failureStage = journey.stage
    report.provider = journey.provider
    report.callback = journey.callback
    report.admission = journey.admission
    report.privateSave = journey.save
  }
  const browserFailurePath = path.join(output.directory, 'browser-failure.json')
  if (fs.existsSync(browserFailurePath)) {
    const failure = JSON.parse(fs.readFileSync(browserFailurePath, 'utf8'))
    report.browserFailure = failure.diagnostic
    if (failure.status !== 'passed') report.error = failure.diagnostic
  }
} finally {
  await stopChild(server)
  if (service) {
    try {
      fs.rmSync(path.join(service.run.directory, 'browser-input.json'), { force: true })
      report.cleanup = await service.cleanup()
    } catch (error) {
      report.cleanup = 'failed'
      report.status = 'failed'
      report.cleanupError = redact(error instanceof Error ? error.message : String(error))
    }
  }
  if (report.status === 'passed' && report.cleanup !== 'removed') report.status = 'failed'
  report.failureStage = report.failureStage || ''
  writeReport()
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', interrupt)
}
console.log(`${report.status}: ${output.directory}`)
process.exitCode = report.status === 'passed' ? 0 : 1
