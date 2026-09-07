import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildReport,
  extractPlaywrightResults,
  runEvaluation,
  validateReport,
} from './free-private-evaluation.mjs'

test('builds a schema-valid report without mixing fixture and human evidence', () => {
  const report = buildReport({
    browserResults: [
      { id: 'shopper-priority-computer', status: 'pass', rawStatuses: ['passed'], failures: [] },
      {
        id: 'shopper-returning-interruption',
        status: 'failed',
        rawStatuses: ['failed'],
        failures: ['offline assertion'],
      },
      {
        id: 'partner-navigator-boundary',
        status: 'unavailable',
        rawStatuses: ['skipped'],
        failures: ['not run'],
      },
      { id: 'representative-boundary', status: 'pass', rawStatuses: ['passed'], failures: [] },
      { id: 'administrator-boundary', status: 'pass', rawStatuses: ['passed'], failures: [] },
    ],
    source: { commitSha: '123456789abcdef' },
  })

  assert.equal(validateReport(report), true)
  assert.equal(
    report.personas.find((persona) => persona.id === 'shopper-returning')?.tasks[0].outcome.status,
    'failed',
  )
  assert.deepEqual(
    report.personas.find((persona) => persona.id === 'shopper-returning')?.tasks[0].outcome
      .failures,
    ['offline assertion'],
  )
  assert.equal(report.ownerPacket.computer.usefulness, '')
  assert.equal(report.evidenceBoundary.serverAuthorization.status, 'unavailable')
  assert.equal(report.personas[0].personaHypothesis.status, 'not_human_evidence')
  assert.equal(
    report.summary.securityGuardrails.positiveExperienceCannotOverrideSecurityFailures,
    true,
  )
})

test('extracts failed and skipped Playwright results instead of dropping them', () => {
  const results = extractPlaywrightResults({
    suites: [
      {
        specs: [
          {
            title: '[fpe:shopper-priority-computer] follows the chain',
            tests: [{ results: [{ status: 'failed', error: { message: 'assertion failed' } }] }],
          },
          {
            title: '[fpe:administrator-boundary] keeps scope',
            tests: [{ results: [{ status: 'skipped' }] }],
          },
        ],
      },
    ],
  })
  assert.deepEqual(results, [
    {
      id: 'shopper-priority-computer',
      status: 'failed',
      failures: ['assertion failed'],
      rawStatuses: ['failed'],
    },
    {
      id: 'administrator-boundary',
      status: 'unavailable',
      failures: [],
      rawStatuses: ['skipped'],
    },
  ])
})

test('writes a complete report when the browser run is unavailable', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'free-private-evaluation-'))
  try {
    const result = await runEvaluation({ output, runBrowser: false })
    const written = JSON.parse(await readFile(result.reportPath, 'utf8'))
    assert.equal(result.exitCode, 2)
    assert.equal(written.summary.overallStatus, 'incomplete')
    assert.equal(
      written.personas.every((persona) => persona.tasks[0].outcome.status === 'unavailable'),
      true,
    )
    assert.equal(written.ownerPacket.phone.returnIntent, '')
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

test('rejects a report that fills owner feedback from simulated evidence', () => {
  const report = buildReport({ browserResults: [] })
  report.ownerPacket.phone.enjoyment = 'great'
  assert.throws(() => validateReport(report), /must remain blank/)
})
