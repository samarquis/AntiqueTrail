const REQUIRED_TICKET_SECTIONS = ['Problem', 'Plan', 'Outcome', 'Acceptance', 'Verification']

const LEGACY_TICKET_SECTIONS = [
  'Reason for ticket',
  'Current evidence',
  'Plan requirements',
  'Plan conformance',
  'What must change',
  'Acceptance criteria',
  'Verification',
  'Dependencies and non-goals',
]

const REQUIRED_PULL_REQUEST_SECTIONS = [
  'Ticket',
  'Outcome',
  'Plan',
  'Evidence',
  'Plan change authorization',
]

const LEGACY_PULL_REQUEST_SECTIONS = [
  'Ticket',
  'Reason addressed',
  'Plan requirements',
  'Plan conformance',
  'Acceptance evidence',
  'Verification',
  'Plan change authorization',
]

const PLAN_FILES = new Set([
  'PLAN_GOVERNANCE.md',
  'README.md',
  'PLANNING_INDEX.md',
  'CODEX_START_PROMPT.md',
  'PRODUCT_DECISIONS.md',
  'PRD.md',
  'DESIGN.md',
  'DESIGN_SYSTEM.md',
  'SECURITY_AND_TRUST.md',
  'IMPLEMENTATION_PLAN.md',
  'PACKAGE_CONTRACTS.md',
  'PLAN_ACCEPTANCE.md',
  'manifest.json',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/plan-governed-ticket.yml',
  '.github/pull_request_template.md',
  '.github/workflows/issue-plan-governance.yml',
  '.github/workflows/pr-plan-governance.yml',
  '.github/workflows/ci.yml',
  'scripts/plan-governance-contract.mjs',
  'scripts/plan-governance-contract.test.mjs',
  'docs/agents/issue-tracker.md',
])

function normalizeHeading(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function sectionsFrom(body = '') {
  const sections = new Map()
  const headingPattern = /^#{2,6}\s+(.+?)\s*$/gm
  const matches = [...body.matchAll(headingPattern)]

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const next = matches[index + 1]
    const contentStart = match.index + match[0].length
    const contentEnd = next?.index ?? body.length
    sections.set(normalizeHeading(match[1]), body.slice(contentStart, contentEnd).trim())
  }

  return sections
}

function section(sections, name) {
  return sections.get(normalizeHeading(name)) ?? ''
}

function validateRequiredSections(body, names) {
  const sections = sectionsFrom(body)
  const errors = []

  for (const name of names) {
    const content = section(sections, name)
    if (!content || content.length < 8) {
      errors.push(`Missing or empty section: ${name}`)
    }
  }

  return { sections, errors }
}

function hasExactPlanReference(content) {
  return (
    /(?:^|[\s`/])[^\s`]+\.md\b/i.test(content) &&
    /(?:heading|section|§|—|\s-\s|#{1,6}\s)/i.test(content)
  )
}

function isProtectedPlanFile(filename) {
  return (
    PLAN_FILES.has(filename) ||
    filename.startsWith('docs/adr/') ||
    filename.startsWith('docs/design/') ||
    filename.startsWith('docs/specs/')
  )
}

function addedLines(patch = '') {
  return patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')
}

function removedLines(patch = '') {
  return patch.split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---'))
}

export function validatePlanTicket(body) {
  const parsed = sectionsFrom(body)
  const legacy = !parsed.has(normalizeHeading('Problem'))
  const { sections, errors } = validateRequiredSections(
    body,
    legacy ? LEGACY_TICKET_SECTIONS : REQUIRED_TICKET_SECTIONS,
  )
  const plan = section(sections, legacy ? 'Plan requirements' : 'Plan')
  const acceptance = section(sections, legacy ? 'Acceptance criteria' : 'Acceptance')

  if (plan && !hasExactPlanReference(plan)) {
    errors.push('Plan must cite a controlling .md file and an exact heading or section.')
  }
  if (acceptance && !/^- \[ \]\s+\S/m.test(acceptance)) {
    errors.push('Acceptance must contain at least one unchecked criterion.')
  }
  const criteria = acceptance.match(/^- \[ \]\s+\S.*$/gm) ?? []
  if (!legacy && criteria.length > 5) {
    errors.push('Acceptance must contain no more than five criteria.')
  }

  return { valid: errors.length === 0, errors }
}

export function validatePlanPullRequest(body, files = []) {
  const parsed = sectionsFrom(body)
  const legacy = !parsed.has(normalizeHeading('Outcome'))
  const { sections, errors } = validateRequiredSections(
    body,
    legacy ? LEGACY_PULL_REQUEST_SECTIONS : REQUIRED_PULL_REQUEST_SECTIONS,
  )
  const ticket = section(sections, 'Ticket')
  const plan = section(sections, legacy ? 'Plan requirements' : 'Plan')
  const planDeclaration = legacy ? section(sections, 'Plan conformance') : plan
  const authorization = section(sections, 'Plan change authorization')
  const protectedChanges = files.filter(
    (file) =>
      file.filename !== 'PLAN_CHANGELOG.md' &&
      (isProtectedPlanFile(file.filename) || isProtectedPlanFile(file.previous_filename ?? '')),
  )
  const changelog = files.find((file) => file.filename === 'PLAN_CHANGELOG.md')

  if (ticket && !/#\d+\b/.test(ticket)) {
    errors.push('Ticket must reference a GitHub issue number.')
  }
  if (plan && !hasExactPlanReference(plan)) {
    errors.push('Plan must cite a controlling .md file and an exact heading or section.')
  }
  if (
    planDeclaration &&
    !/(conforming work; no plan change|authorized plan amendment|existing plan requirement|authorized plan amendment already merged)/i.test(
      planDeclaration,
    )
  ) {
    errors.push('Plan must declare conforming work or identify an authorized amendment.')
  }

  if (protectedChanges.length > 0) {
    if (!/authorized plan amendment/i.test(planDeclaration)) {
      errors.push('Protected plan files changed without an authorized plan amendment declaration.')
    }
    if (!/\bupdate plan\b/i.test(authorization)) {
      errors.push(
        'Protected plan files changed without the exact update plan authorization directive.',
      )
    }
    if (!changelog) {
      errors.push('Protected plan files changed without PLAN_CHANGELOG.md.')
    } else {
      const hasFullContents =
        typeof changelog.beforeContent === 'string' && typeof changelog.afterContent === 'string'
      const additions = hasFullContents
        ? changelog.afterContent.slice(changelog.beforeContent.length)
        : addedLines(changelog.patch)
      if (!/Authorization directive:\s*`update plan`/i.test(additions)) {
        errors.push('PLAN_CHANGELOG.md must add an Authorization directive: `update plan` receipt.')
      }
      if (
        (hasFullContents && !changelog.afterContent.startsWith(changelog.beforeContent)) ||
        (!hasFullContents && removedLines(changelog.patch).length > 0)
      ) {
        errors.push('PLAN_CHANGELOG.md is append-only; existing lines were removed.')
      }
    }
  } else if (changelog) {
    errors.push('PLAN_CHANGELOG.md changed without an accompanying protected plan amendment.')
  }

  return {
    valid: errors.length === 0,
    errors,
    protectedFiles: protectedChanges.map((file) => file.filename),
  }
}
