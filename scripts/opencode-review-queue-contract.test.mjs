import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const reviewQueue = await readFile('OPENCODE_TICKET_REVIEW_TODO.md', 'utf8')
const closureTodo = await readFile('OPEN_TICKET_TODO.md', 'utf8')

function issueNumbers(markdown, allowedStates) {
  return [...markdown.matchAll(/^- \[([ ~xRA!F])\] \d+\. #(\d+)\b/gm)]
    .filter((match) => allowedStates.has(match[1]))
    .map((match) => match[2])
}

test('review queue contains every currently open ordered ticket in ledger order', () => {
  const openTicketNumbers = issueNumbers(closureTodo, new Set([' ']))
  const queueNumbers = issueNumbers(reviewQueue, new Set([' ', '~', 'x']))

  let previousIndex = -1
  for (const ticketNumber of openTicketNumbers) {
    const nextIndex = queueNumbers.indexOf(ticketNumber)
    assert.notEqual(nextIndex, -1, `Missing review-queue row for open ticket #${ticketNumber}`)
    assert.ok(
      nextIndex > previousIndex,
      `Review queue order diverged before ticket #${ticketNumber}`,
    )
    previousIndex = nextIndex
  }
})

test('review handoff requires a pushed draft PR and exact immutable head', () => {
  assert.match(reviewQueue, /`isDraft` must be true/)
  assert.match(reviewQueue, /ready PR, `PR: NONE`, placeholder URL, or pending PR number is invalid/)
  assert.match(reviewQueue, /gh pr view <PR> --json headRefOid --jq \.headRefOid/)
  assert.match(reviewQueue, /Do not commit to that branch again before review/)
  assert.match(reviewQueue, /PR is draft: true/)
  assert.match(reviewQueue, /PR: <draft PR URL>/)
})

test('a distinct reviewer records immutable exact-SHA comments instead of mutating the candidate', () => {
  assert.doesNotMatch(reviewQueue, /^- \[(?:R|A|F|!)\]/m)
  assert.match(reviewQueue, /different stable identity from the implementation system/)
  assert.match(reviewQueue, /never writes review state into the candidate branch/)
  assert.match(reviewQueue, /INDEPENDENT REVIEW CLAIM/)
  assert.match(reviewQueue, /FINAL INDEPENDENT REVIEW — PASS/)
  assert.match(reviewQueue, /FINAL INDEPENDENT REVIEW — FAIL/)
})

test('findings stay in scope and external blockers cannot hide repository defects', () => {
  assert.match(reviewQueue, /repairs the same issue/is)
  assert.match(reviewQueue, /governed successor GitHub issue/is)
  assert.match(reviewQueue, /without reordering existing rows/is)
  assert.match(reviewQueue, /Never use the authoritative TODO's `\[!\]` external blocker state for review findings/)
})
