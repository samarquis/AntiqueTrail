import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import process from 'node:process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const references = ['docs/design/mood.md', 'docs/design/voice.md', 'docs/design/tokens.md']
const checklist = 'docs/design/BRAND_REFERENCE_REVIEW_CHECKLIST.md'
const inbound = ['docs/design/README.md', 'DESIGN_SYSTEM.md']
const note = 'docs/evidence/issue-146/brand-reference-review-2026-08-29.md'

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

function requirePatterns(content, patterns, label) {
  for (const pattern of patterns)
    assert.match(content, new RegExp(pattern, 'iu'), `${label} must match ${pattern}`)
}

function fieldValue(content, field) {
  return content.match(new RegExp(`^- \\*\\*${field}:\\*\\* (.+)$`, 'mu'))?.[1]?.trim() ?? ''
}

function unquote(value) {
  return value.replace(/^`|`$/gu, '')
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 8 * 1024 * 1024,
  })
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed: ${String(result.stderr ?? '').trim()}`,
  )
  return result.stdout
}

function candidateDiffFingerprint(base, candidate) {
  assert.match(base, /^[0-9a-f]{40}$/u)
  assert.match(candidate, /^[0-9a-f]{40}$/u)
  git(['cat-file', '-e', `${base}^{commit}`])
  git(['cat-file', '-e', `${candidate}^{commit}`])
  assert.equal(
    git(['merge-base', base, candidate]).trim(),
    base,
    'candidate base must be an ancestor of the reviewed candidate',
  )
  const diff = git(['diff', '--binary', `${base}...${candidate}`, '--', '.', `:(exclude)${note}`], {
    encoding: 'buffer',
  })
  return git(['hash-object', '--stdin'], { input: diff }).trim()
}

function assertCandidateProvenance(content, expectedBase, expectedCandidate) {
  const base = unquote(fieldValue(content, 'Candidate base').split(/\s+/u)[0])
  const candidate = unquote(fieldValue(content, 'Candidate HEAD').split(/\s+/u)[0])
  const fingerprint = unquote(fieldValue(content, 'Diff fingerprint').split(/\s+/u)[0])
  assert.equal(base, expectedBase, 'approval base must match the supplied base commit')
  assert.equal(candidate, expectedCandidate, 'approval candidate must match the supplied HEAD')
  assert.equal(
    fingerprint,
    candidateDiffFingerprint(base, candidate),
    'recorded fingerprint must match the self-excluding candidate diff',
  )
}

function referenceStatus() {
  const statuses = new Set(references.map((file) => fieldValue(read(file), 'Status')))
  assert.equal(statuses.size, 1, 'all three brand references must have the same status')
  const [status] = statuses
  assert.match(status, /^(?:Proposed|Changes requested|Approved)$/u)
  return status
}

function assertInboundStatus(status) {
  assert.match(
    read('docs/design/README.md'),
    new RegExp(`\\*\\*${status}\\*\\* review indexes`, 'iu'),
    'design README status must match the three governed references',
  )
  assert.match(
    read('DESIGN_SYSTEM.md'),
    new RegExp(`The \\*\\*${status}\\*\\* governed`, 'iu'),
    'DESIGN_SYSTEM status must match the three governed references',
  )
}

function assertAuthorizedApproval(content) {
  assert.equal(fieldValue(content, 'Decision'), 'Approved')
  assert.match(fieldValue(content, 'Reviewer'), /\S/u)
  assert.match(
    fieldValue(content, 'Reviewer role'),
    /^(?:Product Owner|Delegated design decision-maker; delegated by \S.+)$/u,
    'approval requires the Product Owner role or an explicitly named delegation source',
  )
  const candidate = unquote(fieldValue(content, 'Candidate HEAD').split(/\s+/u)[0])
  assert.match(candidate, /^[0-9a-f]{40}$/u, 'approval requires the exact reviewed candidate HEAD')
  assert.match(
    unquote(fieldValue(content, 'Candidate base').split(/\s+/u)[0]),
    /^[0-9a-f]{40}$/u,
    'approval requires the exact candidate base commit',
  )
  assert.match(
    unquote(fieldValue(content, 'Diff fingerprint').split(/\s+/u)[0]),
    /^[0-9a-f]{40}$/u,
    'approval requires a regenerated self-excluding diff fingerprint',
  )
  assert.equal(fieldValue(content, 'Checklist result'), 'Passed')
  for (const field of [
    'Mood critique',
    'Voice critique',
    'Token Compliance critique',
    'Representative route matrix',
  ])
    assert.equal(fieldValue(content, field), 'Pass', `approval requires ${field}: Pass`)
  assert.doesNotMatch(
    fieldValue(content, 'Checks'),
    /human.+required|pending|changes requested/iu,
    'approval checks cannot retain a pending human-review disclaimer',
  )
  assert.doesNotMatch(
    fieldValue(content, 'Intentionally deferred questions'),
    /approver identity|approval decision|human.+required|pending/iu,
    'approval cannot defer the approval authority or decision itself',
  )
}

if (process.env.BRAND_REFERENCE_FINGERPRINT_BASE && process.env.BRAND_REFERENCE_FINGERPRINT_HEAD)
  process.stdout.write(
    `BRAND_REFERENCE_DIFF_FINGERPRINT=${candidateDiffFingerprint(
      process.env.BRAND_REFERENCE_FINGERPRINT_BASE,
      process.env.BRAND_REFERENCE_FINGERPRINT_HEAD,
    )}\n`,
  )

function anchors(content) {
  const seen = new Map()
  return new Set(
    [...content.matchAll(/^#{1,6}\s+(.+)$/gmu)].map(([, heading]) => {
      const base = heading
        .trim()
        .toLowerCase()
        .replace(/[`*_~]/gu, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/gu, '-')
      const occurrence = seen.get(base) ?? 0
      seen.set(base, occurrence + 1)
      return occurrence ? `${base}-${occurrence}` : base
    }),
  )
}

function validateLinks(relativePath) {
  const content = read(relativePath)
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const href = match[1]
    if (/^(?:https?:|mailto:)/u.test(href)) continue
    const [pathname, fragment] = href.split('#')
    const target = resolve(root, dirname(relativePath), pathname || relativePath)
    assert.ok(existsSync(target), `${relativePath} has broken link ${href}`)
    if (fragment && extname(target).toLowerCase() === '.md') {
      assert.ok(
        anchors(readFileSync(target, 'utf8')).has(fragment),
        `${relativePath} has broken anchor ${href}`,
      )
    }
  }
}

test('brand references and discovery seams exist', () => {
  for (const file of [...references, checklist, ...inbound, note])
    assert.ok(existsSync(resolve(root, file)), `missing ${file}`)

  for (const file of inbound) {
    const content = read(file)
    for (const reference of ['mood.md', 'voice.md', 'tokens.md'])
      assert.match(
        content,
        new RegExp(reference.replace('.', '\\.')),
        `${file} must link ${reference}`,
      )
  }

  const manifest = JSON.parse(read('manifest.json'))
  for (const file of [...references, checklist])
    assert.ok(manifest.files.includes(file), `manifest missing ${file}`)
  assert.doesNotMatch(
    manifest.purpose,
    /\b(?:Proposed|Approved|Changes requested)\b/iu,
    'manifest purpose must stay status-neutral; reference and inbound-index fields own status',
  )
  assert.match(manifest.handoff_version, /^\d+\.\d+$/u)
  const latestReferenceReview = references
    .map((file) => fieldValue(read(file), 'Last reviewed'))
    .sort()
    .at(-1)
  assert.ok(
    manifest.generated_date >= latestReferenceReview,
    'manifest generated_date must not predate a governed reference review',
  )

  const designReadme = read('docs/design/README.md')
  const status = referenceStatus()
  assertInboundStatus(status)
  assert.ok(
    designReadme.indexOf('PALETTE_PROPOSAL.md') < designReadme.indexOf('[`mood.md`]'),
    'proposed review indexes must not rank above the approved palette authority',
  )
  assert.ok(
    designReadme.indexOf('ICON_PLACEMENT_SPEC.md') < designReadme.indexOf('[`mood.md`]'),
    'proposed review indexes must not rank above the approved icon authority',
  )
})

test('governance blocks are complete and non-self-approving', () => {
  for (const file of references) {
    const content = read(file)
    assert.equal((content.match(/^#\s+/gmu) ?? []).length, 1, `${file} must have one H1`)
    for (const field of [
      'Status',
      'Owner',
      'Last reviewed',
      'Approval mechanism',
      'Authority and precedence',
      'Cross-references',
    ])
      assert.match(
        content,
        new RegExp(`^- \\*\\*${field}:\\*\\* \\S.+$`, 'mu'),
        `${file} missing ${field}`,
      )
    assert.match(content, /^- \*\*Status:\*\* (?:Proposed|Changes requested|Approved)$/mu)
    requirePatterns(
      content,
      [
        'Product Owner',
        'source precedence',
        'conflict',
        'mood.md|Mood',
        'voice.md|Voice',
        'tokens.md|token',
      ],
      file,
    )
  }
  assert.match(read(references[0]), /DESIGN\.md.+interaction and copy intent/isu)
  assert.match(read(references[0]), /DESIGN_SYSTEM\.md.+exact visuals/isu)
  assert.match(read(references[1]), /DESIGN\.md.+controls interaction and copy intent/isu)
  assert.match(read(references[2]), /DESIGN_SYSTEM\.md.+owns exact visual values/isu)
})

test('mood contract covers identity, imagery, prohibitions, and audiences', () => {
  const content = read(references[0])
  requirePatterns(
    content,
    [
      'Daylight Archive',
      'Midnight Archive',
      'Emotional register indexed from approved authority',
      'quiet',
      'trustworthy',
      'legible',
      'locally curious',
      'archival without nostalgic clutter',
      'teal',
      'mint-glass',
      'bottle-green',
      'parchment',
      'sepia',
      'distressed type',
      'barnwood',
      'decorative antique clutter',
      'false endorsement|endorsement',
      'generic vintage collage',
      'image.*unavailable',
      'ICON_PLACEMENT_SPEC.md',
      '/stores',
      '/saved',
      '/trips',
      '/store-portal',
      '/admin',
      'forced-colors',
    ],
    'mood.md',
  )
})

test('voice contract covers required states, audiences, vocabulary, and fixture boundary', () => {
  const content = read(references[1])
  requirePatterns(
    content,
    [
      'plainspoken',
      'calm',
      'precise',
      "older adult's time",
      'Navigation',
      'Buttons',
      'Loading',
      'Empty',
      'Error',
      'Status and freshness',
      'Privacy and safety',
      'Store Portal',
      'Administrator',
      'verified',
      'reported',
      'pending',
      'unavailable',
      'fictional',
      'synthetic',
      'endorsement',
      'travel-time',
      'private-data visibility',
      'Review harness versus production',
      'illustrative enforcement examples',
      'not contracted product copy',
      'Authenticated shopper',
      'Store Representative',
    ],
    'voice.md',
  )
})

test('token index covers every category without copying color values', () => {
  const content = read(references[2])
  requirePatterns(
    content,
    [
      'Color and contrast',
      'Typography',
      'Spacing, radius, and elevation',
      'Focus',
      'Motion',
      'Target size',
      'Responsive behavior',
      'Components and states',
      'Dark theme',
      'Forced colors',
      'forced-colors',
      'contrast.*threshold',
      'clay/rust',
      'brass/gold',
      'Issue #141',
      'Issue #142',
      'literal exceptions',
      'styles.css',
      'styles.test.ts',
    ],
    'tokens.md',
  )
  const valueContent = content
    .replace(/#(?:141|142)\b/gu, '')
    .replace(/\]\(https?:\/\/[^)]+\)/gu, '')
  assert.doesNotMatch(
    valueContent,
    /#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b/iu,
    'tokens.md must not copy hexadecimal values',
  )
})

test('checklist covers human judgment and the representative matrix', () => {
  const content = read(checklist)
  requirePatterns(
    content,
    [
      'Mood critique',
      'Voice critique',
      'Token Compliance critique',
      'one H1',
      'bidirectional',
      'palette',
      'light',
      'dark',
      'forced-colors',
      '/stores',
      '/saved',
      '/trips',
      '/store-portal',
      '/admin',
      'phone',
      'tablet',
      'desktop',
      'Product Owner',
      'deferred questions',
    ],
    checklist,
  )
})

test('local links and Markdown anchors resolve', () => {
  for (const file of [...references, checklist, ...inbound]) validateLinks(file)
})

test('dated decision note is complete and closure mode requires real approval', () => {
  const content = read(note)
  for (const field of [
    'Date and time zone',
    'Candidate base',
    'Candidate HEAD',
    'Diff fingerprint',
    'Reviewer',
    'Reviewer role',
    'Decision',
    'Checklist result',
    'Checks',
    'Intentionally deferred questions',
  ])
    assert.match(
      content,
      new RegExp(`^- \\*\\*${field}:\\*\\* \\S.+$`, 'mu'),
      `${note} missing ${field}`,
    )
  assert.match(
    fieldValue(content, 'Candidate base'),
    /^(?:`[0-9a-f]{40}`|Pending\b)/u,
    'non-approved evidence must either pin a base or state that it is pending',
  )
  assert.match(
    fieldValue(content, 'Candidate HEAD'),
    /^(?:`[0-9a-f]{40}`|Pending\b)/u,
    'non-approved evidence must either pin a candidate or state that it is pending',
  )
  assert.match(
    fieldValue(content, 'Diff fingerprint'),
    /^(?:`[0-9a-f]{40}`|Pending\b)/u,
    'non-approved evidence must either pin a fingerprint or state that it is pending',
  )
  assert.match(content, /^- \*\*Decision:\*\* (?:Approved|Changes requested)$/mu)

  if (process.env.BRAND_REFERENCE_CLOSURE === '1') {
    const expectedBase = process.env.BRAND_REFERENCE_BASE_HEAD ?? ''
    const expectedCandidate = process.env.BRAND_REFERENCE_CANDIDATE_HEAD ?? ''
    assert.match(
      expectedBase,
      /^[0-9a-f]{40}$/u,
      'closure requires BRAND_REFERENCE_BASE_HEAD for the reviewed PR base',
    )
    assert.match(
      expectedCandidate,
      /^[0-9a-f]{40}$/u,
      'closure requires BRAND_REFERENCE_CANDIDATE_HEAD for the exact reviewed commit',
    )
    assertAuthorizedApproval(content)
    assertCandidateProvenance(content, expectedBase, expectedCandidate)
    assert.equal(referenceStatus(), 'Approved')
    assertInboundStatus('Approved')
    const decisionDate = fieldValue(content, 'Date and time zone').match(/^\d{4}-\d{2}-\d{2}/u)?.[0]
    assert.ok(decisionDate, 'approval requires an ISO decision date')
    for (const file of references)
      assert.equal(
        fieldValue(read(file), 'Last reviewed'),
        decisionDate,
        `${file} Last reviewed must match the approval date`,
      )
    assert.equal(
      JSON.parse(read('manifest.json')).generated_date,
      decisionDate,
      'manifest generated_date must match the approval date',
    )
  }
})

test('closure approval accepts only explicit decision authority', () => {
  const [candidateHead, ...candidateParents] = git(['rev-list', '--parents', '-n', '1', 'HEAD'])
    .trim()
    .split(/\s+/u)
  const baseHead = candidateParents.at(-1)
  assert.ok(baseHead, 'provenance fixture requires a candidate with at least one parent')
  const realFingerprint = candidateDiffFingerprint(baseHead, candidateHead)
  const candidate = 'a'.repeat(40)
  const fingerprint = 'b'.repeat(40)
  const base = read(note)
    .replace(/^- \*\*Reviewer:\*\* .+$/mu, '- **Reviewer:** Jane Reviewer')
    .replace(/^- \*\*Decision:\*\* .+$/mu, '- **Decision:** Approved')
    .replace(/^- \*\*Candidate base:\*\* .+$/mu, `- **Candidate base:** \`${baseHead}\``)
    .replace(/^- \*\*Candidate HEAD:\*\* .+$/mu, `- **Candidate HEAD:** \`${candidate}\``)
    .replace(/^- \*\*Diff fingerprint:\*\* .+$/mu, `- **Diff fingerprint:** \`${fingerprint}\``)
    .replace(/^- \*\*Checklist result:\*\* .+$/mu, '- **Checklist result:** Passed')
    .replace(
      /^- \*\*Checks:\*\* .+$/mu,
      '- **Checks:** Automated checks and authorized human review passed.',
    )
    .replace(
      /^- \*\*Intentionally deferred questions:\*\* .+$/mu,
      '- **Intentionally deferred questions:** None',
    )
    .replace(/^- \*\*Mood critique:\*\* .+$/mu, '- **Mood critique:** Pass')
    .replace(/^- \*\*Voice critique:\*\* .+$/mu, '- **Voice critique:** Pass')
    .replace(/^- \*\*Token Compliance critique:\*\* .+$/mu, '- **Token Compliance critique:** Pass')
    .replace(
      /^- \*\*Representative route matrix:\*\* .+$/mu,
      '- **Representative route matrix:** Pass',
    )

  const productOwner = base.replace(
    /^- \*\*Reviewer role:\*\* .+$/mu,
    '- **Reviewer role:** Product Owner',
  )
  assert.doesNotThrow(() => assertAuthorizedApproval(productOwner))
  assert.doesNotThrow(() =>
    assertAuthorizedApproval(
      productOwner.replace(
        /^- \*\*Checks:\*\* .+$/mu,
        '- **Checks:** Automated structural checks and human review passed.',
      ),
    ),
  )

  const delegate = base.replace(
    /^- \*\*Reviewer role:\*\* .+$/mu,
    '- **Reviewer role:** Delegated design decision-maker; delegated by Pat Product Owner',
  )
  assert.doesNotThrow(() => assertAuthorizedApproval(delegate))

  const unauthorized = base.replace(
    /^- \*\*Reviewer role:\*\* .+$/mu,
    '- **Reviewer role:** Friend',
  )
  assert.throws(() => assertAuthorizedApproval(unauthorized))
  assert.throws(() =>
    assertAuthorizedApproval(
      productOwner.replace('- **Mood critique:** Pass', '- **Mood critique:** Pending'),
    ),
  )
  const provenance = productOwner
    .replace(`\`${candidate}\``, `\`${candidateHead}\``)
    .replace(`\`${fingerprint}\``, `\`${realFingerprint}\``)
  assert.doesNotThrow(() => assertCandidateProvenance(provenance, baseHead, candidateHead))
  assert.throws(() => assertCandidateProvenance(provenance, baseHead, 'c'.repeat(40)))
  assert.throws(() =>
    assertCandidateProvenance(
      provenance.replace(`\`${realFingerprint}\``, `\`${fingerprint}\``),
      baseHead,
      candidateHead,
    ),
  )
})
