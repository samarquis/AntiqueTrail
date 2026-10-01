import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { URL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { browserReport } from './configured-free-shopper-report.mjs'

const workflow = fs.readFileSync(
  new URL('../.github/workflows/seed-media.yml', import.meta.url),
  'utf8',
)
const script = workflow.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/)[1]
const secret = 'Bearer private-token person@private.invalid https://private.invalid/?token=secret'
const metadata = {
  sourceSha: '401e7482329f642101c5a06817048a38a127755a',
  sourceDirty: false,
  scope: 'configured-seed-media',
  status: 'failed',
  cleanup: 'complete',
}

function summarize(report) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-summary-'))
  try {
    const run = path.join(directory, 'artifacts', 'configured-shopper-fixture')
    fs.mkdirSync(run, { recursive: true })
    fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report))
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: directory,
      encoding: 'utf8',
    })
    const output = path.join(directory, 'artifacts', 'configured-seed-media-summary.json')
    return {
      ...result,
      summary: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : undefined,
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

function classified(status, error) {
  return {
    ...metadata,
    ...browserReport(
      JSON.stringify({
        stats: {
          expected: status === 'passed' ? 1 : 0,
          unexpected: status === 'passed' ? 0 : 1,
          skipped: 0,
          flaky: 0,
        },
        errors: [],
        suites: [
          {
            specs: [
              {
                title: 'session scenario',
                tests: [{ projectName: 'desktop', results: [{ status, error }] }],
              },
            ],
          },
        ],
      }),
      1,
    ),
    errors: [secret],
    browserOrigin: secret,
    environment: secret,
  }
}

test('uploaded summary retains safe classified failure and drops raw report data', () => {
  const result = summarize(
    classified('failed', {
      message: `expect.toHaveText: strict mode violation. ${secret}`,
      stack: `at /workspace/e2e/configured-free-shopper.spec.ts:123:4\n${secret}`,
    }),
  )
  assert.equal(result.status, 0)
  assert.deepEqual(result.summary.checks[0].failure, {
    sourceLine: 123,
    assertion: 'toHaveText',
    timeout: false,
    strictLocator: true,
  })
  assert.deepEqual(
    Object.keys(result.summary).sort(),
    [...Object.keys(metadata), 'stats', 'checks'].sort(),
  )
  assert.doesNotMatch(
    JSON.stringify(result.summary),
    /private-token|private.invalid|Bearer|environment|browserOrigin/,
  )
})

test('passing checks contain no failure diagnostics', () => {
  const result = summarize(classified('passed', { message: secret }))
  assert.equal(result.status, 0)
  assert.deepEqual(result.summary.checks, [
    { name: 'session scenario', project: 'desktop', status: 'passed' },
  ])
})

for (const [name, status, error, expected] of [
  [
    'timeout',
    'timedOut',
    { message: `Timeout 30000ms exceeded ${secret}` },
    { timeout: true, strictLocator: false },
  ],
  [
    'strict locator',
    'failed',
    { message: `locator.click strict mode violation ${secret}` },
    { assertion: 'locator.click', timeout: false, strictLocator: true },
  ],
  [
    'location fallback',
    'failed',
    {
      message: `expect.toBeVisible ${secret}`,
      location: { file: '/private/configured-free-shopper.spec.ts', line: 57 },
    },
    { sourceLine: 57, assertion: 'toBeVisible', timeout: false, strictLocator: false },
  ],
  ['absent location', 'failed', { message: secret }, { timeout: false, strictLocator: false }],
]) {
  test(`uploaded summary retains ${name} classification without private content`, () => {
    const result = summarize(classified(status, error))
    assert.equal(result.status, 0)
    assert.deepEqual(result.summary.checks[0].failure, expected)
    assert.doesNotMatch(
      JSON.stringify(result.summary),
      /private-token|private.invalid|Bearer|\/private\//,
    )
  })
}

test('malformed failure fields cannot escape the allowlist', () => {
  for (const sourceLine of [secret, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const report = classified('failed', {})
    report.checks[0].failure = {
      sourceLine,
      assertion: secret,
      timeout: secret,
      strictLocator: secret,
      message: secret,
      stack: secret,
      url: secret,
    }
    const result = summarize(report)
    assert.equal(result.status, 0)
    assert.deepEqual(result.summary.checks[0].failure, { timeout: false, strictLocator: false })
    assert.doesNotMatch(
      JSON.stringify(result.summary),
      /private-token|private.invalid|Bearer|message|stack|url/,
    )
  }
})

test('malformed check collections fail without publishing raw input', () => {
  for (const checks of [secret, {}, [null]]) {
    const result = summarize({ ...metadata, checks })
    assert.notEqual(result.status, 0)
    assert.equal(result.summary, undefined)
    assert.doesNotMatch(result.stderr, /private-token|private.invalid|Bearer/)
  }
})
