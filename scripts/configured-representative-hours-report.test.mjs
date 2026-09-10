import { describe, expect, it } from 'vitest'
import { representativeHoursReport } from './configured-representative-hours-report.mjs'

const passing = JSON.stringify({
  stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
  errors: [],
  suites: [
    {
      specs: [
        {
          title: 'case',
          tests: [
            { projectName: 'desktop', results: [{ status: 'passed' }] },
            { projectName: 'phone', results: [{ status: 'passed' }] },
          ],
        },
      ],
    },
  ],
})

describe('representative hours report', () => {
  it('requires every configured browser case', () => {
    expect(representativeHoursReport(passing)).toMatchObject({ status: 'passed' })
    expect(representativeHoursReport(passing, 3)).toMatchObject({ status: 'failed' })
  })
  it('rejects malformed and failed reports', () => {
    expect(() => representativeHoursReport('{}')).toThrow('Malformed browser report')
    expect(representativeHoursReport(passing.replace('"passed"', '"failed"'))).toMatchObject({
      status: 'failed',
    })
  })
})
