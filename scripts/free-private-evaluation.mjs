import { execFileSync, spawnSync } from 'node:child_process'
import console from 'node:console'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = path.join(
  ROOT,
  'docs',
  'testing',
  'free-private-evaluation',
  'scenarios.json',
)
const SCHEMA_VERSION = 1
const EVALUATION_ID = 'free-private-evaluation'
const FIXTURE_ID = 'local-review-harness-fictional-v1'
const DEFAULT_START_PORT = 42180

const STATUS = new Set(['pass', 'failed', 'unavailable', 'not_started'])
const BOUNDARY_STATUS = new Set([...STATUS, 'observed'])
const EVIDENCE_CLASSES = new Set([
  'fixture_browser',
  'human_firsthand',
  'server_authorization',
  'provider',
  'cohort_or_release',
])

function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object`)
  return value
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be non-empty`)
  return value
}

function status(value, name) {
  if (!STATUS.has(value)) throw new Error(`${name} has invalid status: ${value}`)
  return value
}

function boundaryStatus(value, name) {
  if (!BOUNDARY_STATUS.has(value)) throw new Error(`${name} has invalid status: ${value}`)
  return value
}

function evidenceClass(value, name) {
  if (!EVIDENCE_CLASSES.has(value)) throw new Error(`${name} has invalid evidence class: ${value}`)
  return value
}

function manifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
}

function gitValue(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim() || fallback
  } catch {
    return fallback
  }
}

function normalizePlaywrightStatus(value) {
  if (value === 'passed' || value === 'pass') return 'pass'
  if (value === 'failed' || value === 'timedOut' || value === 'interrupted') return 'failed'
  if (value === 'skipped' || value === 'pending') return 'unavailable'
  return 'unavailable'
}

function failureMessage(result) {
  const message = result?.error?.message ?? result?.errors?.[0]?.message
  return typeof message === 'string' ? message.slice(0, 2_000) : null
}

function collectPlaywrightSpecs(suites, output = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      const match = /^\[fpe:([^\]]+)\]/u.exec(spec.title ?? '')
      if (!match) continue
      const results = spec.tests?.flatMap((test) => test.results ?? []) ?? []
      const statuses = results.length
        ? results.map((result) => normalizePlaywrightStatus(result.status))
        : ['unavailable']
      const resultStatus = statuses.includes('failed')
        ? 'failed'
        : statuses.includes('unavailable')
          ? 'unavailable'
          : 'pass'
      output.push({
        id: match[1],
        status: resultStatus,
        failures: results.map(failureMessage).filter(Boolean),
        rawStatuses: results.map((result) => result.status ?? 'missing'),
      })
    }
    collectPlaywrightSpecs(suite.suites, output)
  }
  return output
}

export function extractPlaywrightResults(raw) {
  return collectPlaywrightSpecs(raw?.suites)
}

async function availablePort(start = DEFAULT_START_PORT) {
  for (let port = start; port < start + 100; port += 1) {
    const candidate = await new Promise((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
    })
    if (candidate) return port
  }
  throw new Error(`No available loopback port in ${start}-${start + 99}`)
}

function blankFeedback() {
  return {
    browser: '',
    phonePlatform: '',
    interruption: '',
    hesitation: '',
    usefulness: '',
    readabilityPresentation: '',
    ease: '',
    flow: '',
    enjoyment: '',
    memorableElements: '',
    returnIntent: '',
    firsthandNotes: '',
  }
}

function localBoundary() {
  return {
    fixtureBrowser: {
      status: 'observed',
      evidenceClass: 'fixture_browser',
      canProve: ['current local UI assertions against fictional fixtures'],
      cannotProve: ['real server authorization', 'real account isolation', 'human usefulness'],
    },
    humanFirsthand: {
      status: 'not_started',
      evidenceClass: 'human_firsthand',
      cannotBeInferredFrom: ['fixtureBrowser', 'personaHypotheses'],
    },
    serverAuthorization: {
      status: 'unavailable',
      evidenceClass: 'server_authorization',
      reason: 'This ticket uses the local review harness and no hosted backend.',
    },
    provider: {
      status: 'unavailable',
      evidenceClass: 'provider',
      reason: 'No real email, mapping, media, payment, or other provider is authorized.',
    },
    cohortOrRelease: {
      status: 'unavailable',
      evidenceClass: 'cohort_or_release',
      reason:
        'One local owner packet and simulated personas do not establish cohort or release acceptance.',
    },
  }
}

function resultFor(testId, resultsById) {
  const results = resultsById.get(testId) ?? []
  if (results.some((result) => result.status === 'failed'))
    return results.find((result) => result.status === 'failed')
  if (results.some((result) => result.status === 'pass'))
    return results.find((result) => result.status === 'pass')
  return (
    results[0] ?? {
      id: testId,
      status: 'unavailable',
      failures: ['No browser result was recorded.'],
    }
  )
}

function buildPersona(persona, resultsById) {
  const tasks = persona.tasks.map((task) => {
    const result = resultFor(task.e2eTestId, resultsById)
    const outcome = {
      status: status(result.status, `personas.${persona.id}.${task.id}.status`),
      evidenceClass: evidenceClass(
        'fixture_browser',
        `personas.${persona.id}.${task.id}.evidenceClass`,
      ),
      rawStatuses: result.rawStatuses ?? [],
      failures: result.failures ?? [],
    }
    return { ...task, outcome }
  })
  return {
    id: persona.id,
    approvedRole: persona.approvedRole,
    fixtureIdentity: persona.fixtureIdentity,
    fixtureRole: persona.fixtureRole,
    device: persona.device,
    accessibility: persona.accessibility,
    digitalConfidence: persona.digitalConfidence,
    personaHypothesis: {
      status: 'not_human_evidence',
      reaction: '',
      usefulness: '',
      confusion: '',
      note: 'Simulated persona hypotheses require separate interpretation and never fill owner feedback.',
    },
    tasks,
  }
}

function summarize(personas, boundary) {
  const outcomes = personas.flatMap((persona) => persona.tasks.map((task) => task.outcome))
  const fixture = {
    passed: outcomes.filter((outcome) => outcome.status === 'pass').length,
    failed: outcomes.filter((outcome) => outcome.status === 'failed').length,
    unavailable: outcomes.filter((outcome) => outcome.status === 'unavailable').length,
  }
  const observedFailures = outcomes.flatMap((outcome) => outcome.failures)
  const unavailableEvidence = Object.values(boundary)
    .filter((item) => item.status === 'unavailable' || item.status === 'not_started')
    .map((item) => item.evidenceClass)
  return {
    fixture,
    observedFailures,
    unavailableEvidence,
    overallStatus:
      fixture.failed > 0 ? 'failed' : unavailableEvidence.length > 0 ? 'incomplete' : 'pass',
    securityGuardrails: {
      positiveExperienceCannotOverrideSecurityFailures: true,
      securityFailures: observedFailures.filter((failure) =>
        /security|privacy|data.?loss|isolation/i.test(failure),
      ),
    },
  }
}

export function buildReport({
  manifestData = manifest(),
  browserResults = [],
  source = {},
  browser = {},
  command = 'node scripts/free-private-evaluation.mjs --mode local',
} = {}) {
  const resultsById = new Map()
  for (const result of browserResults) {
    const list = resultsById.get(result.id) ?? []
    list.push(result)
    resultsById.set(result.id, list)
  }
  const evidenceBoundary = localBoundary()
  const personas = manifestData.personas.map((persona) => buildPersona(persona, resultsById))
  const report = {
    schemaVersion: SCHEMA_VERSION,
    evaluationId: EVALUATION_ID,
    mode: 'local',
    generatedAt: new Date().toISOString(),
    source: {
      commitSha: source.commitSha ?? gitValue(['rev-parse', 'HEAD'], 'unknown-sha'),
      branch: source.branch ?? gitValue(['branch', '--show-current'], 'detached'),
      fixtureId: FIXTURE_ID,
      harness: 'local-review-harness',
      command,
      browser,
    },
    personas,
    evidenceBoundary,
    ownerPacket: {
      status: 'not_started',
      setup: {
        order: ['computer', 'phone'],
        browser: '',
        phonePlatform: '',
        actualSelectionRecorded: false,
      },
      computer: blankFeedback(),
      phone: blankFeedback(),
      disposition: { choice: '', reasons: [], nextBoundedDecision: '' },
    },
    disposition: {
      decision: 'not_decided',
      scope: 'this evaluation and its next bounded decision only',
      cannotClaim: ['Internal Alpha', 'external testing', 'public release', 'paid activation'],
      blockers: ['owner_firsthand_observations', 'server_authorization_proof', 'provider_proof'],
    },
    summary: summarize(personas, evidenceBoundary),
  }
  validateReport(report)
  return report
}

export function validateReport(report) {
  record(report, 'report')
  if (report.schemaVersion !== SCHEMA_VERSION) throw new Error('report.schemaVersion must be 1')
  if (report.evaluationId !== EVALUATION_ID) throw new Error('report.evaluationId is invalid')
  if (report.mode !== 'local') throw new Error('report.mode must be local')
  requiredString(report.generatedAt, 'report.generatedAt')
  const source = record(report.source, 'report.source')
  requiredString(source.commitSha, 'report.source.commitSha')
  if (source.fixtureId !== FIXTURE_ID) throw new Error('report.source.fixtureId is invalid')
  if (source.harness !== 'local-review-harness') throw new Error('report.source.harness is invalid')
  requiredString(source.command, 'report.source.command')
  record(source.browser, 'report.source.browser')
  if (!Array.isArray(report.personas) || report.personas.length < 5)
    throw new Error('report.personas must contain all five personas')
  for (const persona of report.personas) {
    requiredString(persona.id, 'persona.id')
    requiredString(persona.approvedRole, `${persona.id}.approvedRole`)
    requiredString(persona.fixtureIdentity, `${persona.id}.fixtureIdentity`)
    record(persona.device, `${persona.id}.device`)
    if (!Array.isArray(persona.accessibility) || persona.accessibility.length === 0)
      throw new Error(`${persona.id}.accessibility must be explicit`)
    requiredString(persona.digitalConfidence, `${persona.id}.digitalConfidence`)
    const hypothesis = record(persona.personaHypothesis, `${persona.id}.personaHypothesis`)
    if (hypothesis.status !== 'not_human_evidence')
      throw new Error(`${persona.id} mixes hypothesis and human evidence`)
    for (const task of persona.tasks ?? []) {
      const outcome = record(task.outcome, `${persona.id}.${task.id}.outcome`)
      status(outcome.status, `${persona.id}.${task.id}.outcome.status`)
      evidenceClass(outcome.evidenceClass, `${persona.id}.${task.id}.outcome.evidenceClass`)
      if (!Array.isArray(outcome.failures))
        throw new Error(`${persona.id}.${task.id}.outcome.failures must be an array`)
      if (outcome.status === 'failed' && outcome.failures.length === 0)
        throw new Error(`${persona.id}.${task.id} dropped a failed assertion`)
    }
  }
  const boundary = record(report.evidenceBoundary, 'report.evidenceBoundary')
  for (const [name, item] of Object.entries(boundary)) {
    const value = record(item, `report.evidenceBoundary.${name}`)
    boundaryStatus(value.status, `report.evidenceBoundary.${name}.status`)
    evidenceClass(value.evidenceClass, `report.evidenceBoundary.${name}.evidenceClass`)
  }
  const owner = record(report.ownerPacket, 'report.ownerPacket')
  if (owner.status !== 'not_started')
    throw new Error('ownerPacket cannot be inferred by the runner')
  if (owner.setup?.actualSelectionRecorded !== false) throw new Error('owner setup is not blank')
  for (const device of ['computer', 'phone']) {
    const feedback = record(owner[device], `ownerPacket.${device}`)
    for (const [key, value] of Object.entries(feedback)) {
      if (key !== 'browser' && key !== 'phonePlatform' && value !== '')
        throw new Error(`ownerPacket.${device}.${key} must remain blank before firsthand use`)
    }
  }
  record(report.disposition, 'report.disposition')
  record(report.summary, 'report.summary')
  return true
}

function parseArgs(argv) {
  const args = { mode: null, output: null, browser: true }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--mode') args.mode = argv[++index]
    else if (argument === '--output') args.output = argv[++index]
    else if (argument === '--no-browser') args.browser = false
    else if (argument === '--help') return { help: true }
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (args.mode !== 'local') throw new Error('--mode local is required')
  if (!args.output) throw new Error('--output is required')
  return args
}

function playwrightConfig({ port, rawPath }) {
  const e2eDir = path.join(ROOT, 'e2e')
  const command = `npm run dev:review -- --host 127.0.0.1 --port ${port}`
  return `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: ${JSON.stringify(e2eDir)},
  testMatch: ['persona-free-private-evaluation.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  reporter: [['json', { outputFile: ${JSON.stringify(rawPath)} }]],
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: { baseURL: ${JSON.stringify(`http://127.0.0.1:${port}`)}, trace: 'on-first-retry' },
  webServer: {
    command: ${JSON.stringify(command)},
    url: ${JSON.stringify(`http://127.0.0.1:${port}/review`)},
    reuseExistingServer: false,
    env: { VITE_COMMERCIAL_RESEARCH_REVIEW: 'true' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
})
`
}

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx'
}

async function runBrowser(outputDir) {
  const port = await availablePort()
  const rawPath = path.join(outputDir, 'playwright.json')
  const configPath = path.join(outputDir, 'playwright.free-private-evaluation.config.mjs')
  writeFileSync(configPath, playwrightConfig({ port, rawPath }))
  const command = `${npxCommand()} playwright test --config ${configPath}`
  const child = spawnSync(npxCommand(), ['playwright', 'test', '--config', configPath], {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let raw = null
  try {
    raw = JSON.parse(readFileSync(rawPath, 'utf8'))
  } catch {
    raw = null
  }
  const results = extractPlaywrightResults(raw)
  if (!results.length) {
    results.push({
      id: 'browser-run',
      status: 'unavailable',
      failures: [`Playwright did not produce a result (exit ${child.status ?? 'unknown'}).`],
      rawStatuses: [],
    })
  }
  return {
    results,
    metadata: {
      command,
      port,
      configPath,
      rawPath,
      exitCode: child.status,
      signal: child.signal,
      error: child.error?.message ?? null,
      stdoutTail: child.stdout?.slice(-2_000) ?? '',
      stderrTail: child.stderr?.slice(-2_000) ?? '',
    },
  }
}

export async function runEvaluation({ output, runBrowser: shouldRunBrowser = true, command } = {}) {
  const outputDir = path.resolve(ROOT, output ?? path.join('artifacts', EVALUATION_ID))
  mkdirSync(outputDir, { recursive: true })
  let browser = {
    command: 'browser execution skipped',
    port: null,
    configPath: null,
    rawPath: null,
  }
  let browserResults = []
  if (shouldRunBrowser) {
    const executed = await runBrowser(outputDir)
    browser = executed.metadata
    browserResults = executed.results.filter((result) => result.id !== 'browser-run')
    if (browserResults.length === 0) browserResults = executed.results
  } else {
    browserResults = manifest().personas.flatMap((persona) =>
      persona.tasks.map((task) => ({
        id: task.e2eTestId,
        status: 'unavailable',
        failures: ['Browser run skipped.'],
      })),
    )
  }
  const report = buildReport({
    browserResults,
    source: { commitSha: gitValue(['rev-parse', 'HEAD'], 'unknown-sha') },
    browser,
    command: command ?? 'node scripts/free-private-evaluation.mjs --mode local',
  })
  const reportPath = path.join(outputDir, 'report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  const exitCode =
    report.summary.fixture.failed > 0 ? 1 : report.summary.overallStatus === 'incomplete' ? 2 : 0
  return { report, reportPath, exitCode }
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
      console.log(
        'Usage: node scripts/free-private-evaluation.mjs --mode local --output artifacts/free-private-evaluation',
      )
      return
    }
    const result = await runEvaluation({
      output: args.output,
      runBrowser: args.browser,
      command: `node scripts/free-private-evaluation.mjs --mode ${args.mode} --output ${args.output}`,
    })
    console.log(
      JSON.stringify({
        report: result.reportPath,
        status: result.report.summary.overallStatus,
        exitCode: result.exitCode,
      }),
    )
    process.exitCode = result.exitCode
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main()
