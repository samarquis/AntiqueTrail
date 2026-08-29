import assert from 'node:assert/strict'
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

function assertAuthorizedApproval(content) {
  assert.equal(fieldValue(content, 'Decision'), 'Approved')
  assert.match(fieldValue(content, 'Reviewer'), /\S/u)
  assert.match(
    fieldValue(content, 'Reviewer role'),
    /^(?:Product Owner|Delegated design decision-maker; delegated by \S.+)$/u,
    'approval requires the Product Owner role or an explicitly named delegation source',
  )
}

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
  assert.doesNotMatch(manifest.purpose, /^Approved\b/iu)

  const designReadme = read('docs/design/README.md')
  assert.match(designReadme, /\*\*Proposed\*\* review indexes/iu)
  assert.ok(
    designReadme.indexOf('PALETTE_PROPOSAL.md') < designReadme.indexOf('[`mood.md`]'),
    'proposed review indexes must not rank above the approved palette authority',
  )
  assert.ok(
    designReadme.indexOf('ICON_PLACEMENT_SPEC.md') < designReadme.indexOf('[`mood.md`]'),
    'proposed review indexes must not rank above the approved icon authority',
  )
  assert.match(read('DESIGN_SYSTEM.md'), /proposed governed \[mood\]/iu)
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
  assert.match(content, /^- \*\*Diff fingerprint:\*\* `[0-9a-f]{40}`/mu)
  assert.match(content, /^- \*\*Decision:\*\* (?:Approved|Changes requested)$/mu)

  if (process.env.BRAND_REFERENCE_CLOSURE === '1') {
    assertAuthorizedApproval(content)
    for (const file of references) assert.match(read(file), /^- \*\*Status:\*\* Approved$/mu)
  }
})

test('closure approval accepts only explicit decision authority', () => {
  const base = read(note)
    .replace(/^- \*\*Reviewer:\*\* .+$/mu, '- **Reviewer:** Jane Reviewer')
    .replace(/^- \*\*Decision:\*\* .+$/mu, '- **Decision:** Approved')

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
})
