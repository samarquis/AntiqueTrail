import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePlanPullRequest, validatePlanTicket } from './plan-governance-contract.mjs'

const validTicket = `
## Problem
At the current main SHA, the catalog action sits outside the intended card task order and obscures the shopper decision path.
## Plan
DESIGN_SYSTEM.md — Critique-derived composition contract. No dependency; no palette change.
## Outcome
Restore the complete card task order end to end.
## Acceptance
- [ ] DESIGN_SYSTEM.md — Critique-derived composition contract: metadata precedes actions.
## Verification
Run component, keyboard, 393px, and 200% browser checks.
`

const validPullRequest = `
## Ticket
Closes #161
## Outcome
Restores the documented card task order.
## Plan
DESIGN_SYSTEM.md — Critique-derived composition contract.
Conforming work; no plan change
## Evidence
The mapped component and browser checks pass.
npm run check and the hosted web job pass.
## Plan change authorization
Not a plan change.
`

const legacyTicket = `
## Reason for ticket
The old ticket format remains valid during backlog migration.
## Current evidence
The ticket predates the simplified template on current main.
## Plan requirements
PLAN_GOVERNANCE.md — Ticket admission contract.
## Plan conformance
Existing plan requirement; no plan change
## What must change
Preserve active work while the backlog is migrated.
## Acceptance criteria
- [ ] Existing active tickets still validate.
## Verification
Run the governance contract tests.
## Dependencies and non-goals
No product behavior change.
`

test('accepts a complete plan-governed ticket', () => {
  assert.deepEqual(validatePlanTicket(validTicket), { valid: true, errors: [] })
})

test('rejects a ticket without plan traceability or acceptance checkboxes', () => {
  const result = validatePlanTicket(
    validTicket
      .replace(
        'DESIGN_SYSTEM.md — Critique-derived composition contract. No dependency; no palette change.',
        'The design critique says to fix it.',
      )
      .replace('- [ ]', '- '),
  )
  assert.equal(result.valid, false)
  assert.equal(result.errors.length, 2)
})

test('rejects more than five acceptance criteria', () => {
  const result = validatePlanTicket(
    validTicket.replace(
      '- [ ] DESIGN_SYSTEM.md — Critique-derived composition contract: metadata precedes actions.',
      Array.from({ length: 6 }, (_, index) => `- [ ] Criterion ${index + 1}`).join('\n'),
    ),
  )
  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /no more than five/)
})

test('accepts the legacy ticket format during migration', () => {
  assert.deepEqual(validatePlanTicket(legacyTicket), { valid: true, errors: [] })
})

test('accepts a conforming pull request that does not change the plan', () => {
  assert.deepEqual(validatePlanPullRequest(validPullRequest, [{ filename: 'src/App.tsx' }]), {
    valid: true,
    errors: [],
    protectedFiles: [],
  })
})

test('rejects protected plan changes without authorization and changelog', () => {
  const result = validatePlanPullRequest(validPullRequest, [
    { filename: 'DESIGN_SYSTEM.md', patch: '+changed' },
  ])
  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /update plan/)
  assert.match(result.errors.join('\n'), /PLAN_CHANGELOG/)
})

test('rejects a protected plan file renamed around governance', () => {
  const result = validatePlanPullRequest(validPullRequest, [
    {
      filename: 'notes/old-design.md',
      previous_filename: 'DESIGN_SYSTEM.md',
      status: 'renamed',
    },
  ])
  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /update plan/)
})

test('accepts an authorized append-only plan amendment', () => {
  const body = validPullRequest
    .replace('Conforming work; no plan change', 'Authorized plan amendment')
    .replace('Not a plan change.', 'Product Owner directive: update plan')
  const files = [
    { filename: 'DESIGN_SYSTEM.md', patch: '+changed' },
    {
      filename: 'PLAN_CHANGELOG.md',
      patch: '+- Authorization directive: `update plan`',
    },
  ]
  assert.equal(validatePlanPullRequest(body, files).valid, true)
})

test('rejects deletion from the append-only changelog', () => {
  const body = validPullRequest
    .replace('Conforming work; no plan change', 'Authorized plan amendment')
    .replace('Not a plan change.', 'Product Owner directive: update plan')
  const result = validatePlanPullRequest(body, [
    { filename: 'PRD.md', patch: '+changed' },
    {
      filename: 'PLAN_CHANGELOG.md',
      beforeContent: 'old receipt\n',
      afterContent: 'rewritten receipt\n- Authorization directive: `update plan`\n',
    },
  ])
  assert.equal(result.valid, false)
  assert.match(result.errors.join('\n'), /append-only/)
})
