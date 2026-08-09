// Generate a timestamped handoff document at .planning/handoffs/HANDOFF-YYYY-MM-DD.md
// from the session's real evidence: git commits and file changes since the previous
// handoff, open pull requests, and ready-for-agent issues.
//
// Usage:
//   node scripts/handoff.mjs
//   node scripts/handoff.mjs --note "UI-06 wave: reviewer focus is hours editor" --author "big pickle" --for "codex"
//   node scripts/handoff.mjs --since=2026-08-06
//
// The --for flag names the intended reader (defaults to "codex"); --author names the
// session agent (defaults to "big pickle (opencode)").
/* global console */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const handoffsDirectory = path.join(root, '.planning', 'handoffs')

async function run(command, args) {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout.trim()
}

function parseArgs(argv) {
  const args = { note: '', author: 'big pickle (opencode)', for: 'codex', since: null }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const [key, ...rest] = token.split('=')
    const value = rest.join('=')
    if (key === '--note') args.note = value || argv[++i] || ''
    else if (key === '--author') args.author = value || argv[++i] || 'big pickle (opencode)'
    else if (key === '--for') args.for = value || argv[++i] || 'codex'
    else if (key === '--since') args.since = value || argv[++i] || null
    else throw new Error(`Unknown argument: ${token}`)
  }
  return args
}

function latestHandoff() {
  if (!fs.existsSync(handoffsDirectory)) return null
  const files = fs
    .readdirSync(handoffsDirectory)
    .filter((name) => /^HANDOFF-\d{4}-\d{2}-\d{2}(?:-\d+)?\.md$/.test(name))
    .sort()
  if (files.length === 0) return null
  const last = files[files.length - 1]
  const match = last.match(/^HANDOFF-(\d{4}-\d{2}-\d{2})/)
  return { file: last, date: match ? match[1] : null }
}

function nextHandoffPath() {
  const today = new Date().toISOString().slice(0, 10)
  if (!fs.existsSync(handoffsDirectory)) return path.join(handoffsDirectory, `HANDOFF-${today}.md`)
  let candidate = path.join(handoffsDirectory, `HANDOFF-${today}.md`)
  let suffix = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(handoffsDirectory, `HANDOFF-${today}-${suffix}.md`)
    suffix += 1
  }
  return candidate
}

async function gitData(since) {
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])

  let commits = []
  let filesChanged = []
  if (since) {
    const sinceDate = since.length === 10 ? `${since} 00:00:00` : since
    const logArgs = [
      'log',
      `--since=${sinceDate}`,
      '--pretty=format:%h|%ad|%s',
      '--date=short',
      'HEAD',
    ]
    const raw = await run('git', logArgs)
    commits = raw
      ? raw
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => {
            const [hash, date, ...subjectParts] = line.split('|')
            return { hash, date, subject: subjectParts.join('|') }
          })
      : []

    if (commits.length > 0) {
      const nameStatus = await run('git', [
        'log',
        `--since=${sinceDate}`,
        '--name-status',
        '--pretty=format:',
        'HEAD',
      ])
      const seen = new Map()
      for (const line of nameStatus.split('\n')) {
        const match = line.match(/^([AMDRC])\s+(.+)$/)
        if (match) seen.set(match[2], match[1])
      }
      filesChanged = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }
  } else {
    const raw = await run('git', [
      'log',
      '-10',
      '--pretty=format:%h|%ad|%s',
      '--date=short',
      'HEAD',
    ])
    commits = raw
      ? raw
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => {
            const [hash, date, ...subjectParts] = line.split('|')
            return { hash, date, subject: subjectParts.join('|') }
          })
      : []
  }

  const status = await run('git', ['status', '--porcelain'])

  let upstream = 'none'
  try {
    upstream = await run('git', [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ])
  } catch {
    // No upstream configured; keep 'none'.
  }

  return { branch, commits, filesChanged, status, upstream }
}

async function githubData() {
  const result = { prs: [], ready: [], note: '' }

  try {
    const prsRaw = await run('gh', [
      'pr',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,headRefName,isDraft,reviewDecision',
    ])
    result.prs = prsRaw
      ? JSON.parse(prsRaw).map((parsed) => ({
          number: parsed.number,
          title: parsed.title,
          head: parsed.headRefName,
          draft: parsed.isDraft,
          decision: parsed.reviewDecision ?? 'awaiting review',
        }))
      : []
  } catch {
    result.prs = []
  }

  try {
    const readyRaw = await run('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      'ready-for-agent',
      '--json',
      'number,title,milestone',
    ])
    result.ready = readyRaw
      ? JSON.parse(readyRaw).map((parsed) => ({
          number: parsed.number,
          title: parsed.title,
          milestone: parsed.milestone?.title ?? 'no milestone',
        }))
      : []
  } catch {
    result.ready = []
  }

  return result
}

function renderMarkdown({ args, git, github, sinceDescription }) {
  const lines = []
  lines.push(`# Handoff — ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push(
    `Generated by \`scripts/handoff.mjs\` at ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC.`,
  )
  lines.push('')
  lines.push(`- **Author (coded this session):** ${args.author}`)
  lines.push(`- **Intended reviewer/reader:** ${args.for}`)
  lines.push(`- **Branch:** \`${git.branch}\` (upstream: \`${git.upstream}\`)`)
  lines.push(`- **Coverage:** ${sinceDescription}`)
  lines.push('')
  lines.push('## Coded this session')
  lines.push('')
  if (git.commits.length > 0) {
    lines.push('### Commits')
    lines.push('')
    lines.push('| Hash | Date | Subject |')
    lines.push('|---|---|---|')
    for (const commit of git.commits) {
      lines.push(
        `| \`${commit.hash}\` | ${commit.date} | ${commit.subject.replaceAll('|', '\\|')} |`,
      )
    }
    lines.push('')
  } else {
    lines.push('No commits detected in the covered window.')
    lines.push('')
  }
  if (git.filesChanged.length > 0) {
    lines.push('### Files changed (committed)')
    lines.push('')
    lines.push('| Status | Path |')
    lines.push('|---|---|')
    for (const [file, status] of git.filesChanged) {
      lines.push(`| ${status} | \`${file}\` |`)
    }
    lines.push('')
  }
  if (git.status.length > 0) {
    lines.push('### Uncommitted working-tree changes')
    lines.push('')
    lines.push('```text')
    lines.push(git.status)
    lines.push('```')
    lines.push('')
  }
  lines.push('## Where to review')
  lines.push('')
  if (github.prs.length > 0) {
    lines.push('### Open pull requests')
    lines.push('')
    lines.push('| PR | Title | Head | State |')
    lines.push('|---|---|---|---|')
    for (const pr of github.prs) {
      const state = pr.draft ? `draft` : pr.decision
      lines.push(
        `| #${pr.number} | ${pr.title.replaceAll('|', '\\|')} | \`${pr.head}\` | ${state} |`,
      )
    }
    lines.push('')
  } else {
    lines.push('No open pull requests.')
    lines.push('')
  }
  if (github.ready.length > 0) {
    lines.push('### Ready-for-agent issues (next implementable work)')
    lines.push('')
    lines.push('| Issue | Title | Milestone |')
    lines.push('|---|---|---|')
    for (const issue of github.ready) {
      lines.push(
        `| #${issue.number} | ${issue.title.replaceAll('|', '\\|')} | ${issue.milestone} |`,
      )
    }
    lines.push('')
  } else {
    lines.push('No ready-for-agent issues open.')
    lines.push('')
  }
  if (args.note) {
    lines.push('### Reviewer focus')
    lines.push('')
    lines.push(args.note)
    lines.push('')
  }
  lines.push('## Suggested skills for the next session')
  lines.push('')
  const skills = []
  if (github.prs.length > 0) skills.push('`code-review` — review the open PRs above before merging')
  if (github.ready.length > 0)
    skills.push('`implement` + `tdd` — build the next ready-for-agent issue test-first')
  skills.push('`handoff` — compact the next conversation when the session ends')
  for (const skill of skills) lines.push(`- ${skill}`)
  lines.push('')
  lines.push('## Source of truth')
  lines.push('')
  lines.push(
    'Read `CODEX_START_PROMPT.md` for current authority and stop conditions, `PRD.md` for product requirements, `DESIGN.md`/`DESIGN_SYSTEM.md` for interaction and visual rules, and `PACKAGE_CONTRACTS.md` for package delivery order. If two controlling sources conflict, stop and reconcile the documents.',
  )
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const previous = latestHandoff()

  let since = args.since
  let sinceDescription
  if (since) {
    sinceDescription = `explicit --since=${since}`
  } else if (previous?.date) {
    since = previous.date
    sinceDescription = `changes since previous handoff ${previous.file} (${previous.date})`
  } else {
    sinceDescription = 'no previous handoff found; last 10 commits'
  }

  const [git, github] = await Promise.all([gitData(since), githubData()])
  const markdown = renderMarkdown({ args, git, github, sinceDescription })

  fs.mkdirSync(handoffsDirectory, { recursive: true })
  const outputPath = nextHandoffPath()
  fs.writeFileSync(outputPath, markdown, 'utf8')
  console.log(`Wrote handoff to ${path.relative(root, outputPath)}`)
}

main().catch((error) => {
  console.error(`handoff failed: ${error.message}`)
  process.exitCode = 1
})
