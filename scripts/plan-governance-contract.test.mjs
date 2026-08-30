import assert from 'node:assert/strict'
import test from 'node:test'

import { validatePlanPullRequest, validatePlanTicket } from './plan-governance-contract.mjs'

const validTicket = `
## Reason for ticket
The catalog action layout obscures the intended decision path for shoppers.
## Current evidence
Current-main capture at 393px shows the action outside the card task order.
## Plan requirements
DESIGN_SYSTEM.md — Critique-derived composition contract: actions follow metadata.
## Plan conformance
Existing plan requirement; no plan change
## What must change
Restore the complete card task order end to end.
## Acceptance criteria
- [ ] DESIGN_SYSTEM.md — Critique-derived composition contract: metadata precedes actions.
## Verification
Run component, keyboard, 393px, and 200% browser checks.
## Dependencies and non-goals
No palette, route, or product-scope change.
`

const validPullRequest = `
## Ticket
Closes #161
## Reason addressed
Restores the documented card task order.
## Plan requirements
DESIGN_SYSTEM.md — Critique-derived composition contract.
## Plan conformance
Conforming work; no plan change
## Acceptance evidence
The mapped component and browser checks pass.
## Verification
npm run check and the hosted web job pass.
## Plan change authorization
Not a plan change.
`

test('accepts a complete plan-governed ticket', () => {
  assert.deepEqual(validatePlanTicket(validTicket), { valid: true, errors: [] })
})

test('rejects a ticket without plan traceability or acceptance checkboxes', () => {
  const result = validatePlanTicket(
    validTicket
      .replace(
        'DESIGN_SYSTEM.md — Critique-derived composition contract: actions follow metadata.',
        'The design critique says to fix it.',
      )
      .replace('- [ ]', '- '),
  )
  assert.equal(result.valid, false)
  assert.equal(result.errors.length, 2)
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
