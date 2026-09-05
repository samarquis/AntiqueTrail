import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { REQUEST, REVIEW, parse, inspectPullRequest, poll, scan } from './opencode-review-queue.mjs'

const base = 'a'.repeat(40),
  head = 'b'.repeat(40),
  previousHead = 'c'.repeat(40)
const evidence = ['docs/evidence/issue-187/verification.md']
function fixture() {
  const pr = {
    number: 188,
    state: 'open',
    draft: true,
    head: { sha: head },
    user: { login: 'builder' },
  }
  const request = {
    issue: 187,
    pr: 188,
    base,
    head,
    implementer: 'codex/local/builder',
    scope: 'Issue 187',
    evidence,
  }
  const receipt = {
    issue: 187,
    pr: 188,
    base,
    head,
    reviewer: 'codex/local/reviewer',
    scope: 'full',
    standards: 'PASS',
    spec: 'PASS',
    evidence,
  }
  const data = {
    request,
    receipt,
    pr,
    issue: { state: 'open' },
    reviews: [],
    comments: [],
    issueComments: [],
    current: pr,
    file: { type: 'file' },
    comparison: { status: 'ahead', base_commit: { sha: base }, merge_base_commit: { sha: base } },
    delta: {
      status: 'ahead',
      merge_base_commit: { sha: previousHead },
      files: [{ filename: evidence[0], status: 'modified' }],
    },
  }
  data.handoff = () => {
    const comment = { user: { login: 'builder' }, body: REQUEST + '\n' + JSON.stringify(request) }
    data.comments = [comment]
    data.issueComments = [structuredClone(comment)]
  }
  data.review = (overrides = {}, fields = {}) => ({
    user: { login: 'reviewer' },
    author_association: 'COLLABORATOR',
    state: 'APPROVED',
    commit_id: head,
    html_url: 'https://github.com/a/b/pull/188#review-1',
    body: REVIEW + '\n' + JSON.stringify({ ...receipt, ...fields }),
    ...overrides,
  })
  data.api = async (endpoint) => {
    if (endpoint.endsWith('/pulls?state=open&per_page=100')) return [data.pr]
    if (endpoint.endsWith('/issues/188/comments')) return data.comments
    if (endpoint.endsWith('/issues/187/comments')) return data.issueComments
    if (endpoint.endsWith('/issues/187')) return data.issue
    if (endpoint.endsWith('/pulls/188/reviews')) return data.reviews
    if (endpoint.endsWith('/pulls/188')) return data.current
    if (endpoint.includes('/contents/')) {
      assert.ok(endpoint.endsWith(`?ref=${head}`))
      return data.file
    }
    if (endpoint.includes(`/compare/${previousHead}`)) return data.delta
    if (endpoint.includes('/compare/')) return data.comparison
    throw new Error(`Unexpected API ${endpoint}`)
  }
  data.run = () => inspectPullRequest(data.pr, data.api, 'a/b')
  data.handoff()
  return data
}

test('malformed, missing, mismatched, stale and unavailable handoffs never become requested', async () => {
  assert.equal(parse(REQUEST + '\nnull', REQUEST), null)
  assert.equal(parse(REQUEST + '\n[]', REQUEST), null)
  for (const change of [
    (f) => {
      f.comments = []
    },
    (f) => {
      f.comments[0].body = REQUEST + '\n{'
    },
    (f) => {
      f.request.head = previousHead
      f.handoff()
    },
    (f) => {
      f.issueComments = []
    },
    (f) => {
      f.issue.state = 'closed'
    },
    (f) => {
      f.comparison.merge_base_commit.sha = previousHead
    },
    (f) => {
      f.request.evidence = ['docs/evidence/../secret.md']
      f.handoff()
    },
    (f) => {
      f.file.type = 'dir'
    },
    (f) => {
      f.comments[0].user.login = 'outsider'
    },
    (f) => {
      f.current = { ...f.pr, head: { sha: previousHead } }
    },
  ]) {
    const f = fixture()
    change(f)
    assert.equal((await f.run()).state, 'unreviewed')
  }
  const f = fixture()
  const api = (endpoint) =>
    endpoint.includes('/pulls?') ? f.api(endpoint) : Promise.reject(new Error('rate limited'))
  assert.equal((await scan('a/b', api))[0].state, 'unreviewed')
})

test('only a distinct trusted exact-head GitHub approval with two verdicts passes', async () => {
  const f = fixture()
  assert.equal((await f.run()).state, 'requested')
  f.reviews = [f.review()]
  assert.equal((await f.run()).state, 'review_pass')
  for (const review of [
    f.review({ user: { login: 'builder' } }),
    f.review({ author_association: 'NONE' }),
    f.review({ commit_id: previousHead }),
    f.review({ state: 'COMMENTED' }),
    f.review({}, { reviewer: f.request.implementer }),
    f.review({}, { standards: 'REWORK' }),
    f.review({}, { spec: 'REWORK' }),
    f.review({}, { head: previousHead }),
    f.review({}, { evidence: [] }),
  ]) {
    f.reviews = [review]
    assert.equal((await f.run()).state, 'requested')
  }
})

test('outstanding findings survive head changes and another reviewer approval', async () => {
  const f = fixture()
  const finding = f.review({
    user: { login: 'second-reviewer' },
    state: 'CHANGES_REQUESTED',
    commit_id: previousHead,
  })
  f.reviews = [finding, f.review()]
  assert.equal((await f.run()).state, 'rework')
  f.reviews.push({ ...finding, state: 'DISMISSED' })
  assert.equal((await f.run()).state, 'review_pass')
  assert.equal(f.reviews[0].state, 'CHANGES_REQUESTED', 'consumer does not overwrite findings')
})

test('source review survives only a verified independent evidence-only delta', async () => {
  const f = fixture()
  f.reviews = [
    f.review({ commit_id: previousHead }, { head: previousHead }),
    f.review({}, { scope: 'evidence_delta', previousHead }),
  ]
  assert.equal((await f.run()).state, 'review_pass')
  for (const files of [
    [{ filename: 'src/app/App.tsx', status: 'modified' }],
    [{ filename: 'docs/evidence/test.js', status: 'added' }],
    [{ filename: evidence[0], status: 'renamed' }],
    [{ filename: evidence[0], status: 'removed' }],
    Array.from({ length: 300 }, () => ({ filename: evidence[0], status: 'modified' })),
  ]) {
    f.delta.files = files
    assert.equal((await f.run()).state, 'requested')
  }
  f.delta.files = [{ filename: evidence[0], status: 'modified' }]
  f.reviews.shift()
  assert.equal((await f.run()).state, 'requested')
})

test('scheduled end-to-end polling replaces one snapshot without duplicate work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-queue-'))
  try {
    const f = fixture(),
      output = join(dir, 'queue.json')
    let scans = 0
    const api = (endpoint) => {
      if (endpoint.includes('/pulls?')) scans++
      return f.api(endpoint)
    }
    await poll({ repository: 'a/b', output, polls: 2, intervalMs: 1, api })
    assert.equal(scans, 2)
    const first = await readFile(output, 'utf8')
    assert.equal(JSON.parse(first).length, 1)
    assert.equal(JSON.parse(first)[0].state, 'requested')
    await poll({ repository: 'a/b', output, api })
    assert.equal(await readFile(output, 'utf8'), first)
    f.pr.head.sha = previousHead
    await poll({ repository: 'a/b', output, api })
    assert.equal(JSON.parse(await readFile(output, 'utf8'))[0].state, 'unreviewed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scheduler executes trusted default-branch code with read-only access', async () => {
  const workflow = await readFile('.github/workflows/opencode-review-queue.yml', 'utf8')
  assert.match(workflow, /schedule:/)
  assert.match(workflow, /github.event.repository.default_branch/)
  assert.doesNotMatch(workflow, /pull_request_target|: write|head.sha/)
  assert.match(workflow, /persist-credentials: false/)
})
