import { execFileSync } from 'node:child_process'
import { writeFile, rename } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

export const REQUEST = '<!-- antique-trail-review-request:v1 -->'
export const REVIEW = '<!-- antique-trail-independent-review:v1 -->'
const sha = /^[a-f0-9]{40}$/
const identity = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const trusted = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

export function parse(body, marker) {
  if (typeof body !== 'string' || body.length > 32_000 || !body.startsWith(marker + '\n'))
    return null
  try {
    const value = JSON.parse(body.slice(marker.length))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

function sameCandidate(value, request) {
  return (
    value?.issue === request.issue &&
    value.pr === request.pr &&
    value.base === request.base &&
    value.head === request.head
  )
}

function evidencePaths(paths) {
  return (
    Array.isArray(paths) &&
    paths.length > 0 &&
    paths.length <= 100 &&
    paths.every(
      (path) =>
        typeof path === 'string' &&
        /^(docs\/evidence|gates)\/[A-Za-z0-9_./-]+\.(md|png|jpg|webp|pdf)$/.test(path) &&
        !path.split('/').includes('..'),
    )
  )
}

function independent(review, request, author) {
  const receipt = parse(review.body, REVIEW)
  return review.user?.login !== author &&
    trusted.has(review.author_association) &&
    receipt &&
    identity.test(receipt.reviewer) &&
    receipt.reviewer !== request.implementer &&
    review.commit_id === request.head &&
    sameCandidate(receipt, request)
    ? receipt
    : null
}

/** Coordination only: never merge, close, or execute candidate content. */
export async function inspectPullRequest(pr, api, repository) {
  const result = {
    pr: pr.number,
    head: pr.head.sha,
    state: 'unreviewed',
    reason: 'missing handoff',
  }
  if (!pr.draft || pr.state !== 'open') return { ...result, reason: 'not an open draft' }
  const comments = await api(`repos/${repository}/issues/${pr.number}/comments`, true)
  const comment = comments
    .filter((item) => item.body?.startsWith(REQUEST) && item.user?.login === pr.user.login)
    .at(-1)
  if (!comment) return result
  const request = parse(comment.body, REQUEST)
  if (
    !request ||
    request.pr !== pr.number ||
    !Number.isSafeInteger(request.issue) ||
    request.issue < 1 ||
    request.issue === pr.number ||
    !sha.test(request.base) ||
    !sha.test(request.head) ||
    !identity.test(request.implementer) ||
    typeof request.scope !== 'string' ||
    !request.scope.trim() ||
    request.scope.length > 4000 ||
    !evidencePaths(request.evidence)
  )
    return { ...result, reason: 'malformed handoff' }
  result.issue = request.issue
  result.key = `${repository}/${request.issue}/${pr.number}/${request.base}/${request.head}`
  if (request.head !== pr.head.sha) return { ...result, reason: 'stale handoff' }
  const comparison = await api(`repos/${repository}/compare/${request.base}...${request.head}`)
  if (
    !['ahead', 'identical'].includes(comparison.status) ||
    comparison.base_commit?.sha !== request.base ||
    comparison.merge_base_commit?.sha !== request.base
  )
    return { ...result, reason: 'base is not an ancestor' }
  const issue = await api(`repos/${repository}/issues/${request.issue}`)
  if (issue.state !== 'open' || issue.pull_request)
    return { ...result, reason: 'ticket is not open' }
  const issueComments = await api(`repos/${repository}/issues/${request.issue}/comments`, true)
  if (
    !issueComments.some((item) => item.user?.login === pr.user.login && item.body === comment.body)
  )
    return { ...result, reason: 'missing identical issue handoff' }
  for (const path of request.evidence) {
    const file = await api(`repos/${repository}/contents/${path}?ref=${request.head}`)
    if (file.type !== 'file') return { ...result, reason: 'missing candidate evidence' }
  }
  const reviews = await api(`repos/${repository}/pulls/${pr.number}/reviews`, true)
  const latestByReviewer = new Map()
  for (const review of reviews) {
    if (
      review.user?.login !== pr.user.login &&
      trusted.has(review.author_association) &&
      ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
    )
      latestByReviewer.set(review.user.login, review)
  }
  if ([...latestByReviewer.values()].some((review) => review.state === 'CHANGES_REQUESTED'))
    return { ...result, state: 'rework', reason: 'independent changes requested' }
  for (const review of latestByReviewer.values()) {
    const receipt = independent(review, request, pr.user.login)
    if (
      !receipt ||
      review.state !== 'APPROVED' ||
      receipt.standards !== 'PASS' ||
      receipt.spec !== 'PASS' ||
      !evidencePaths(receipt.evidence)
    )
      continue
    if (receipt.scope === 'evidence_delta') {
      if (!sha.test(receipt.previousHead)) continue
      const priorRequest = { ...request, head: receipt.previousHead }
      const prior = reviews.some((item) => {
        const value = independent(item, priorRequest, pr.user.login)
        return (
          item.state === 'APPROVED' &&
          value?.scope === 'full' &&
          value.standards === 'PASS' &&
          value.spec === 'PASS'
        )
      })
      if (!prior) continue
      const delta = await api(
        `repos/${repository}/compare/${receipt.previousHead}...${request.head}`,
      )
      // GitHub truncates comparisons at 300 files; a truncated delta cannot establish safety.
      if (
        delta.status !== 'ahead' ||
        delta.merge_base_commit?.sha !== receipt.previousHead ||
        !Array.isArray(delta.files) ||
        delta.files.length >= 300 ||
        !evidencePaths(delta.files.map((file) => file.filename)) ||
        delta.files.some((file) => file.status === 'renamed' || file.status === 'removed')
      )
        continue
    } else if (receipt.scope !== 'full') continue
    for (const path of receipt.evidence) {
      const file = await api(`repos/${repository}/contents/${path}?ref=${request.head}`)
      if (file.type !== 'file') return { ...result, reason: 'missing review evidence' }
    }
    const current = await api(`repos/${repository}/pulls/${pr.number}`)
    if (current.head.sha !== request.head || !current.draft || current.state !== 'open')
      return { ...result, reason: 'candidate changed during scan' }
    return {
      ...result,
      state: 'review_pass',
      reason: 'independent receipt; landing checks still required',
      review: review.html_url,
    }
  }
  const current = await api(`repos/${repository}/pulls/${pr.number}`)
  if (current.head.sha !== request.head || !current.draft || current.state !== 'open')
    return { ...result, reason: 'candidate changed during scan' }
  return {
    ...result,
    state: 'requested',
    reason: 'awaiting independent review',
    scope: request.scope,
    evidence: request.evidence,
  }
}

export function githubApi(endpoint, paginate = false) {
  const args = ['api', endpoint]
  if (paginate) args.push('--paginate', '--slurp')
  const value = JSON.parse(
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
  )
  return paginate ? value.flat() : value
}

export async function scan(repository, api = githubApi) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository')
  const prs = await api(`repos/${repository}/pulls?state=open&per_page=100`, true)
  if (prs.length > 1000) throw new Error('Queue exceeds 1000 open PRs')
  const queue = []
  for (const pr of prs.filter((item) => item.draft).sort((a, b) => a.number - b.number)) {
    try {
      queue.push(await inspectPullRequest(pr, api, repository))
    } catch {
      queue.push({
        pr: pr.number,
        head: pr.head.sha,
        state: 'unreviewed',
        reason: 'GitHub evidence unavailable',
      })
    }
  }
  return queue
}

export async function poll({
  repository,
  output,
  polls = 1,
  intervalMs = 60_000,
  api = githubApi,
}) {
  if (
    !Number.isSafeInteger(polls) ||
    polls < 1 ||
    polls > 60 ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1 ||
    intervalMs > 60_000
  )
    throw new Error('Invalid bounded polling schedule')
  for (let index = 0; index < polls; index++) {
    if (index) await delay(intervalMs)
    const queue = await scan(repository, api)
    // One bounded snapshot; replay cannot append or dispatch duplicate work.
    await writeFile(`${output}.tmp`, JSON.stringify(queue, null, 2) + '\n')
    await rename(`${output}.tmp`, output)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repository, output, polls, intervalMs] = process.argv.slice(2)
  if (!repository || !output)
    throw new Error(
      'Usage: node scripts/opencode-review-queue.mjs OWNER/REPO OUTPUT [POLLS] [INTERVAL_MS]',
    )
  await poll({
    repository,
    output,
    polls: polls ? Number(polls) : 1,
    intervalMs: intervalMs ? Number(intervalMs) : 60_000,
  })
}
