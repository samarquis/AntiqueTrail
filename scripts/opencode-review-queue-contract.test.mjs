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
  const queueNumbers = issueNumbers(reviewQueue, new Set([' ', '~', 'x', 'R', 'A', 'F', '!']))

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

test('review handoff requires a pushed draft PR and exact-head review', () => {
  assert.match(reviewQueue, /A draft PR is mandatory; `PR: NONE` is invalid\./)
  assert.match(reviewQueue, /draft PR's exact head SHA/)
  assert.match(reviewQueue, /final review-request commit/)
  assert.match(reviewQueue, /PR: <draft PR URL>/)
})

test('findings stay in scope or become a governed successor ticket', () => {
  assert.match(reviewQueue, /repair the in-scope issue/is)
  assert.match(reviewQueue, /governed successor GitHub issue/is)
  assert.match(reviewQueue, /without reordering existing rows/is)
})
