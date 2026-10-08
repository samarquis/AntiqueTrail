#!/usr/bin/env node
/* global process, console, AbortController, fetch, URL */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers'
import {
  CLI_VERSION,
  ROOT,
  command,
  createLocalService,
  freePort,
  stopChild,
} from './configured-shopper-local.mjs'
import { browserReport } from './configured-free-shopper-report.mjs'
import { redact } from './configured-shopper-probe.mjs'

const CASE_IDS = [
  'owner-save-reopen',
  'unknown-hours',
  'cancel-no-rpc',
  'committed-response-lost-retry',
  'stale-version',
  'user-b-denied-list-read-edit',
  'owner-remove',
]
const runnerTemp = process.env.RUNNER_TEMP ?? os.tmpdir()
fs.mkdirSync(runnerTemp, { recursive: true })
const outputDirectory = fs.mkdtempSync(
  path.join(runnerTemp, 'issue-568-private-stop-auth-rpc-proof-'),
)
const reportPath = path.join(outputDirectory, 'report.json')
const controller = new AbortController()
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)

const report = {
  schema: 'issue-568-private-stop-auth-rpc-proof/v1',
  status: 'unavailable',
  failureStage: 'preflight',
  sourceSha: null,
  workflowHeadSha: null,
  baseSha: null,
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  evidenceClass: 'real-local-auth-rpc-browser-on-disposable-ubuntu',
  supabaseCliVersion: CLI_VERSION,
  schemaIdentity: null,
  functionIdentity: null,
  fixtureIdentity: null,
  configIdentity: null,
  capabilityInitial: 'unverified',
  capabilityEnabledForRun: false,
  capabilityRestored: false,
  cases: [],
  counts: { expected: CASE_IDS.length, passed: 0, failed: 0, skipped: 0, flaky: 0 },
  portMap: {},
  externalSourceRequestCount: null,
  sourceProbeArmed: false,
  screenshot_count: 0,
  previewStopped: false,
  inputRemoved: false,
  serviceCleanup: 'not-started',
  cleanup: 'not-started',
}

let stage = 'preflight'
let service
let local
let server
let inputPath
let rawReportPath
let browserMetadataPath
let capabilityTouched = false
let testsPassed = false

function sectionPort(source, section, key) {
  const rest = source.split(`[${section}]`)[1]
  if (!rest) throw new Error('Local port config is unavailable')
  const block = rest.split(/\r?\n\[/, 1)[0]
  const value = block.match(new RegExp(`^${key}\\s*=\\s*(\\d+)\\s*$`, 'm'))?.[1]
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Local port config is invalid')
  return port
}

function localPortMap(origin, run) {
  const source = fs.readFileSync(path.join(run.directory, 'supabase/config.toml'), 'utf8')
  const ports = {
    app: Number(new URL(origin).port),
    api: sectionPort(source, 'api', 'port'),
    database: sectionPort(source, 'db', 'port'),
    shadow: sectionPort(source, 'db', 'shadow_port'),
    mail: sectionPort(source, 'local_smtp', 'port'),
    smtp: sectionPort(source, 'local_smtp', 'smtp_port'),
    pop3: sectionPort(source, 'local_smtp', 'pop3_port'),
    inspector: sectionPort(source, 'edge_runtime', 'inspector_port'),
  }
  const values = Object.values(ports)
  if (
    values.length !== 8 ||
    values.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
    new Set(values).size !== values.length ||
    ports.api !== Number(new URL(run.endpoint).port)
  )
    throw new Error('Local loopback ports are not isolated')
  return ports
}

try {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'pull_request')
    throw new Error('Hosted pull request runner is required')
  if (!process.env.GITHUB_EVENT_PATH || process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('Hosted loopback preflight failed')
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'VERCEL_TOKEN'])
    if (process.env[name]) throw new Error('External provider credentials are forbidden')

  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const eventHeadSha = event?.pull_request?.head?.sha
  const baseSha = event?.pull_request?.base?.sha
  if (
    typeof eventHeadSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(eventHeadSha) ||
    typeof baseSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(baseSha)
  )
    throw new Error('Pull request identity is unavailable')
  const checkedOutSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  if (
    checkedOutSha !== eventHeadSha ||
    (await command('git', ['status', '--porcelain', '--untracked-files=no'])).trim()
  )
    throw new Error('Checkout is not the clean pull request head')
  report.sourceSha = checkedOutSha
  report.workflowHeadSha = eventHeadSha
  report.baseSha = baseSha

  stage = 'local-services'
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  local = await service.start()
  if (local.sourceSha !== report.sourceSha || local.sourceDirty)
    throw new Error('Local service source identity differs')
  report.schemaIdentity = local.schemaIdentity
  report.functionIdentity = local.functionIdentity
  report.configIdentity = local.configIdentity
  report.fixtureIdentity = crypto
    .createHash('sha256')
    .update(local.fixtureIdentity)
    .update('issue-568-private-trip-fixture/v1')
    .digest('hex')
  report.portMap = localPortMap(origin, local)

  stage = 'test-only-capability'
  const initialCapability = (
    await service.sql(
      'select enabled::text from trip_private.private_stop_capability where singleton;',
    )
  ).trim()
  if (initialCapability !== 'false')
    throw new Error('Disposable private-stop capability did not start disabled')
  report.capabilityInitial = 'disabled'
  capabilityTouched = true
  await service.sql(
    'set role identity_service; update trip_private.private_stop_capability set enabled=true where singleton; reset role;',
  )
  const enabledCapability = (
    await service.sql(
      'select enabled::text from trip_private.private_stop_capability where singleton;',
    )
  ).trim()
  if (enabledCapability !== 'true')
    throw new Error('Disposable private-stop capability could not be enabled')
  report.capabilityEnabledForRun = true

  stage = 'browser-build'
  inputPath = path.join(local.directory, 'issue-568-private-stop-input.json')
  rawReportPath = path.join(local.directory, 'issue-568-private-stop-playwright.json')
  browserMetadataPath = path.join(local.directory, 'issue-568-private-stop-browser-meta.json')
  const users = local.users.map(({ id, email, password }) => ({ id, email, password }))
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      directory: local.directory,
      endpoint: local.endpoint,
      anonKey: local.anonKey,
      origin,
      users,
    }),
    { mode: 0o600, flag: 'wx' },
  )
  const appEnvironment = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    GITHUB_PAGES: 'false',
    VITE_COMMERCIAL_RESEARCH_REVIEW: 'false',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
    VITE_BROWSE_MAP_ENABLED: 'false',
  }
  const buildDirectory = path.join(local.directory, 'browser-dist')
  await command(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', buildDirectory],
    { env: appEnvironment, signal: controller.signal, timeout: 900_000 },
  )

  stage = 'preview'
  const appPort = report.portMap.app
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      buildDirectory,
      '--host',
      '127.0.0.1',
      '--port',
      String(appPort),
      '--strictPort',
    ],
    { cwd: ROOT, windowsHide: true, stdio: 'ignore', env: appEnvironment },
  )
  server.on('error', () => {})
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    controller.signal.throwIfAborted()
    try {
      if ((await fetch(origin)).ok) {
        ready = true
        break
      }
    } catch {
      /* loopback readiness */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Loopback preview did not become ready')

  stage = 'browser-tests'
  const browserEnvironment = {
    ...appEnvironment,
    ISSUE_568_PRIVATE_STOP_INPUT: inputPath,
    ISSUE_568_PRIVATE_STOP_ORIGIN: origin,
    ISSUE_568_PRIVATE_STOP_RAW_REPORT: rawReportPath,
    ISSUE_568_PRIVATE_STOP_BROWSER_META: browserMetadataPath,
  }
  let playwrightExit = true
  try {
    await command(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'playwright.issue-568-private-stop-auth-rpc-proof.config.ts',
      ],
      { env: browserEnvironment, signal: controller.signal, timeout: 900_000 },
    )
  } catch {
    playwrightExit = false
  }

  stage = 'browser-report'
  if (!fs.existsSync(rawReportPath) || !fs.existsSync(browserMetadataPath))
    throw new Error('Redacted browser summary is unavailable')
  const summary = browserReport(fs.readFileSync(rawReportPath, 'utf8'), CASE_IDS.length)
  const metadata = JSON.parse(fs.readFileSync(browserMetadataPath, 'utf8'))
  const allowedCases = new Set(CASE_IDS)
  const selectedCases = new Set(summary.checks.map((check) => check.name))
  if (
    summary.checks.length !== CASE_IDS.length ||
    selectedCases.size !== CASE_IDS.length ||
    CASE_IDS.some((id) => !selectedCases.has(id)) ||
    summary.checks.some((check) => !allowedCases.has(check.name)) ||
    metadata?.sourceProbeArmed !== true ||
    !Number.isSafeInteger(metadata.externalSourceRequestCount) ||
    metadata.externalSourceRequestCount < 0
  )
    throw new Error('Browser summary failed its allowlist')
  report.cases = summary.checks.map((check) => ({ id: check.name, status: check.status }))
  report.counts = {
    expected: CASE_IDS.length,
    passed: summary.checks.filter((check) => check.status === 'passed').length,
    failed: summary.stats.unexpected,
    skipped: summary.stats.skipped,
    flaky: summary.stats.flaky,
  }
  report.externalSourceRequestCount = metadata.externalSourceRequestCount
  report.sourceProbeArmed = metadata.sourceProbeArmed
  testsPassed =
    playwrightExit &&
    summary.status === 'passed' &&
    report.counts.passed === CASE_IDS.length &&
    report.counts.failed === 0 &&
    report.counts.skipped === 0 &&
    report.counts.flaky === 0 &&
    report.externalSourceRequestCount === 0
  report.status = testsPassed ? 'passed' : 'failed'
  report.failureStage = testsPassed ? null : 'browser-tests'
} catch {
  report.status = stage === 'browser-tests' || stage === 'browser-report' ? 'failed' : 'unavailable'
  report.failureStage = stage
} finally {
  stage = 'cleanup'
  try {
    await stopChild(server)
    report.previewStopped = true
  } catch {
    report.previewStopped = false
  }

  if (service && capabilityTouched) {
    try {
      await service.sql(
        'set role identity_service; update trip_private.private_stop_capability set enabled=false where singleton; reset role;',
      )
      report.capabilityRestored =
        (
          await service.sql(
            'select enabled::text from trip_private.private_stop_capability where singleton;',
          )
        ).trim() === 'false'
      if (!report.capabilityRestored) report.status = 'failed'
    } catch {
      report.capabilityRestored = false
      report.status = 'failed'
    }
  }

  if (inputPath && fs.existsSync(inputPath)) {
    try {
      fs.rmSync(inputPath, { force: true })
    } catch {
      report.inputRemoved = false
    }
  }
  report.inputRemoved = Boolean(inputPath) && !fs.existsSync(inputPath)

  if (service) {
    try {
      report.serviceCleanup = await service.cleanup()
      if (report.serviceCleanup !== 'removed') report.status = 'failed'
    } catch {
      report.serviceCleanup = 'failed'
      report.status = 'failed'
    }
  }
  const cleanupRequired = Boolean(service || server || inputPath || capabilityTouched)
  report.cleanup = !cleanupRequired
    ? 'not-needed'
    : report.serviceCleanup === 'removed' &&
        report.previewStopped &&
        report.inputRemoved &&
        (!capabilityTouched || report.capabilityRestored)
      ? 'removed'
      : 'failed'

  if (
    testsPassed &&
    report.cleanup === 'removed' &&
    report.capabilityInitial === 'disabled' &&
    report.capabilityEnabledForRun &&
    report.capabilityRestored
  ) {
    report.status = 'passed'
    report.failureStage = null
  } else if (report.status === 'passed') {
    report.status = 'failed'
    report.failureStage = 'cleanup'
  }

  if (local?.directory && fs.existsSync(local.directory)) {
    report.status = 'failed'
    report.failureStage = 'cleanup'
  }
  if (report.cleanup === 'failed') {
    report.status = 'failed'
    report.failureStage = 'cleanup'
  }

  process.off('SIGINT', interrupt)
  process.off('SIGTERM', interrupt)
  try {
    fs.writeFileSync(reportPath, JSON.stringify(redact(report), null, 2), {
      mode: 0o600,
      flag: 'wx',
    })
  } catch {
    report.status = 'failed'
  }
}
console.log(
  `private-stop-proof status=${report.status} passed=${report.counts.passed} skipped=${report.counts.skipped} cleanup=${report.cleanup}`,
)
if (report.status !== 'passed') process.exitCode = 1
