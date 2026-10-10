import assert from 'node:assert/strict'
import test from 'node:test'
import { browserReport } from './configured-free-shopper-report.mjs'

const title = 'anonymous Details entry cancels sign-in, retains store, and retries one dated stop'
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
test('Details receipt requires the exact desktop and phone pair', () => {
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
  test(`Details receipt rejects ${name}`, () => {
    const value = fixture()
    change(value)
    assert.equal(inspect(value).status, 'failed')
  })
}

const authFailureTitle =
  'anonymous Details sign-in failure preserves store and private data before retry'
const combinedRequired = [title, authFailureTitle].flatMap((name) =>
  ['desktop', 'phone'].map((project) => ({ name, project })),
)
function combinedFixture() {
  const value = fixture()
  value.stats.expected = 4
  value.suites[0].specs.push({
    title: authFailureTitle,
    tests: ['desktop', 'phone'].map((projectName) => ({
      projectName,
      results: [{ status: 'passed' }],
    })),
  })
  return value
}
const inspectCombined = (value) => browserReport(JSON.stringify(value), 4, combinedRequired)
test('Details combined receipt requires both exact titles on desktop and phone', () => {
  const result = inspectCombined(combinedFixture())
  assert.equal(result.status, 'passed')
  assert.deepEqual(
    result.checks,
    combinedRequired.map(({ name, project }) => ({ name, project, status: 'passed' })),
  )
})
for (const titleIndex of [0, 1]) {
  for (const projectIndex of [0, 1]) {
    test(`Details combined receipt rejects missing pair ${titleIndex}/${projectIndex}`, () => {
      const value = combinedFixture()
      value.suites[0].specs[titleIndex].tests.splice(projectIndex, 1)
      assert.equal(inspectCombined(value).status, 'failed')
    })
  }
}
for (const [name, change] of [
  ['only original pair', (value) => value.suites[0].specs.pop()],
  ['only authentication pair', (value) => value.suites[0].specs.shift()],
  ['duplicate pair', (value) => (value.suites[0].specs[1].tests[1].projectName = 'desktop')],
  ['wrong project', (value) => (value.suites[0].specs[1].tests[1].projectName = 'tablet')],
  ['wrong title', (value) => (value.suites[0].specs[1].title = 'unrelated')],
  [
    'extra result',
    (value) => value.suites[0].specs[1].tests.push(value.suites[0].specs[1].tests[0]),
  ],
  [
    'skipped result',
    (value) => {
      value.suites[0].specs[1].tests[1].results[0].status = 'skipped'
      value.stats.skipped = 1
    },
  ],
  ['flaky result', (value) => (value.stats.flaky = 1)],
  [
    'failed result',
    (value) => {
      value.suites[0].specs[1].tests[1].results[0].status = 'failed'
      value.stats.unexpected = 1
    },
  ],
  ['global error', (value) => value.errors.push({ message: 'setup failed' })],
  ['wrong count', (value) => (value.stats.expected = 2)],
]) {
  test(`Details combined receipt rejects ${name}`, () => {
    const value = combinedFixture()
    change(value)
    assert.equal(inspectCombined(value).status, 'failed')
  })
}

const denialTitle =
  'anonymous Details chooser rejects unavailable store and revoked session without writes'
const denialRequired = [
  ...combinedRequired,
  ...['desktop', 'phone'].map((project) => ({ name: denialTitle, project })),
]
function denialFixture() {
  const value = combinedFixture()
  value.stats.expected = 6
  value.suites[0].specs.push({
    title: denialTitle,
    tests: ['desktop', 'phone'].map((projectName) => ({
      projectName,
      results: [{ status: 'passed' }],
    })),
  })
  return value
}
const inspectDenials = (value) => browserReport(JSON.stringify(value), 6, denialRequired)
test('Details denial receipt requires all three exact titles on desktop and phone', () => {
  const result = inspectDenials(denialFixture())
  assert.equal(result.status, 'passed')
  assert.deepEqual(
    result.checks,
    denialRequired.map(({ name, project }) => ({ name, project, status: 'passed' })),
  )
})
for (const titleIndex of [0, 1, 2]) {
  for (const projectIndex of [0, 1]) {
    test(`Details denial receipt rejects missing pair ${titleIndex}/${projectIndex}`, () => {
      const value = denialFixture()
      value.suites[0].specs[titleIndex].tests.splice(projectIndex, 1)
      assert.equal(inspectDenials(value).status, 'failed')
    })
  }
}
for (const [name, change] of [
  ['only old pairs', (value) => value.suites[0].specs.pop()],
  ['only denial pair', (value) => value.suites[0].specs.splice(0, 2)],
  ['duplicate pair', (value) => (value.suites[0].specs[2].tests[1].projectName = 'desktop')],
  ['wrong project', (value) => (value.suites[0].specs[2].tests[1].projectName = 'tablet')],
  ['wrong title', (value) => (value.suites[0].specs[2].title = 'unrelated')],
  [
    'extra result',
    (value) => value.suites[0].specs[2].tests.push(value.suites[0].specs[2].tests[0]),
  ],
  [
    'skipped result',
    (value) => {
      value.suites[0].specs[2].tests[1].results[0].status = 'skipped'
      value.stats.skipped = 1
    },
  ],
  ['flaky result', (value) => (value.stats.flaky = 1)],
  [
    'failed result',
    (value) => {
      value.suites[0].specs[2].tests[1].results[0].status = 'failed'
      value.stats.unexpected = 1
    },
  ],
  ['global error', (value) => value.errors.push({ message: 'setup failed' })],
  ['wrong count', (value) => (value.stats.expected = 4)],
]) {
  test(`Details denial receipt rejects ${name}`, () => {
    const value = denialFixture()
    change(value)
    assert.equal(inspectDenials(value).status, 'failed')
  })
}
