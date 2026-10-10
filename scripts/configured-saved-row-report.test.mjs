import assert from 'node:assert/strict'
import test from 'node:test'
import { browserReport } from './configured-free-shopper-report.mjs'

const title = 'visible Saved-row chooser cancels, retries, and reads back one dated stop'
const required = ['desktop', 'phone'].map((project) => ({ name: title, project }))
function fixture() {
  return {
    stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
    errors: [],
    suites: [
      {
        specs: [
          {
            title,
            tests: ['desktop', 'phone'].map((projectName) => ({
              projectName,
              results: [{ status: 'passed' }],
            })),
          },
        ],
      },
    ],
  }
}
const inspect = (value) => browserReport(JSON.stringify(value), 2, required)
test('Saved-row receipt requires the exact desktop and phone pair', () => {
  const result = inspect(fixture())
  assert.equal(result.status, 'passed')
  assert.deepEqual(
    result.checks,
    required.map(({ name, project }) => ({ name, project, status: 'passed' })),
  )
})
for (const [name, change] of [
  ['missing phone', (value) => value.suites[0].specs[0].tests.pop()],
  [
    'duplicate desktop',
    (value) => {
      value.suites[0].specs[0].tests[1].projectName = 'desktop'
    },
  ],
  [
    'wrong project',
    (value) => {
      value.suites[0].specs[0].tests[1].projectName = 'tablet'
    },
  ],
  [
    'wrong case',
    (value) => {
      value.suites[0].specs[0].title = 'direct chooser only'
    },
  ],
  [
    'extra result',
    (value) => value.suites[0].specs[0].tests.push(value.suites[0].specs[0].tests[0]),
  ],
  [
    'skipped case',
    (value) => {
      value.suites[0].specs[0].tests[1].results[0].status = 'skipped'
      value.stats.skipped = 1
    },
  ],
  [
    'flaky case',
    (value) => {
      value.stats.flaky = 1
    },
  ],
  [
    'failed case',
    (value) => {
      value.suites[0].specs[0].tests[0].results[0].status = 'failed'
      value.stats.unexpected = 1
    },
  ],
  ['global error', (value) => value.errors.push({ message: 'setup failed' })],
  [
    'wrong count',
    (value) => {
      value.stats.expected = 1
    },
  ],
]) {
  test(`Saved-row receipt rejects ${name}`, () => {
    const value = fixture()
    change(value)
    assert.equal(inspect(value).status, 'failed')
  })
}
