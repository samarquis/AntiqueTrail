import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/app/styles.css'), 'utf8')

function declarations(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Missing ${selector} token block`)
  return match[1]
}

function token(block: string, name: string) {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'))
  if (!match) throw new Error(`Missing --${name}`)
  return match[1]
}

function contrast(first: string, second: string) {
  const luminance = (color: string) => {
    const channels = color
      .slice(1)
      .match(/../g)!
      .map((hex) => Number.parseInt(hex, 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const typographyTokens: Record<string, ReadonlySet<string>> = {
  'font-family': new Set(['--font-ui', '--font-display']),
  'font-size': new Set([
    '--type-size-caption',
    '--type-size-supporting',
    '--type-size-label',
    '--type-size-body',
    '--type-size-lede',
    '--type-size-heading-3',
    '--type-size-heading-2',
    '--type-size-heading-1',
  ]),
  'font-weight': new Set(['--type-weight-regular', '--type-weight-strong']),
  'line-height': new Set([
    '--type-leading-compact',
    '--type-leading-supporting',
    '--type-leading-body',
    '--type-leading-display-tight',
    '--type-leading-display',
    '--type-leading-display-relaxed',
  ]),
  'letter-spacing': new Set([
    '--type-tracking-display',
    '--type-tracking-display-subtle',
    '--type-tracking-uppercase',
    '--type-tracking-uppercase-wide',
  ]),
}

const rawTypographyExceptions = new Map([
  ['.store-gallery__missing strong|font-size', '5rem'],
  ['.store-photos__feature-caption|font-size', 'clamp(1.35rem, 3.4vw, 2.1rem)'],
  ['.store-photos__missing strong|font-size', '3rem'],
  ['.store-photos__lightbox-nav|font-size', '1.6rem'],
])

const semanticTypographyTokens = new Set(
  Object.values(typographyTokens).flatMap((tokens) => [...tokens]),
)

function normalizeCssIdentifier(value: string) {
  return value
    .replace(
      /\\([0-9a-f]{1,6})\s?|\\([^\r\n0-9a-f])/gi,
      (_escape, hex: string | undefined, character: string | undefined) => {
        if (!hex) return character ?? ''
        const codePoint = Number.parseInt(hex, 16)
        return codePoint === 0 || codePoint > 0x10ffff ? '\ufffd' : String.fromCodePoint(codePoint)
      },
    )
    .toLowerCase()
}

function typographyViolations(source: string) {
  const violations: string[] = []
  let parsed: ReturnType<typeof postcss.parse>
  try {
    parsed = postcss.parse(source)
  } catch (error) {
    return [`Invalid CSS: ${error instanceof Error ? error.message : String(error)}`]
  }

  const normalizeSelector = (value: string) =>
    value
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim()
  const canonicalRoots = parsed.nodes.filter(
    (node) => node.type === 'rule' && normalizeSelector(node.selector) === ':root',
  )
  if (canonicalRoots.length !== 1) {
    violations.push(`contract: expected one top-level :root, found ${canonicalRoots.length}`)
  }
  const canonicalRoot = canonicalRoots[0]
  const definitionCounts = new Map([...semanticTypographyTokens].map((token) => [token, 0]))

  parsed.walkDecls((declaration) => {
    const property = normalizeCssIdentifier(declaration.prop.trim())
    const value = declaration.value.trim()
    const parent = declaration.parent
    const selector =
      parent?.type === 'rule'
        ? normalizeSelector(parent.selector)
        : parent?.type === 'atrule'
          ? `@${parent.name}`
          : ''
    const location = declaration.source?.start?.line ?? 0
    const report = () => violations.push(`${location}: ${selector} { ${declaration.toString()}; }`)

    if (property.startsWith('--font-') || property.startsWith('--type-')) {
      if (!semanticTypographyTokens.has(property) || parent !== canonicalRoot) {
        report()
        return
      }
      definitionCounts.set(property, (definitionCounts.get(property) ?? 0) + 1)
      return
    }

    if (parent?.type === 'atrule' && parent.name.toLowerCase() === 'font-face') return
    if (!typographyTokens[property] && property !== 'font') return

    if (property === 'font') {
      const inheritedControls =
        selector === 'button, input, select, textarea' && value === 'inherit'
      if (!inheritedControls) report()
      return
    }

    const token = value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1]
    if (token && typographyTokens[property]?.has(token)) return
    if (rawTypographyExceptions.get(`${selector}|${property}`) === value) return
    report()
  })

  for (const [token, count] of definitionCounts) {
    if (count !== 1) violations.push(`contract: expected one ${token} definition, found ${count}`)
  }

  return violations
}

describe('shared native form-control tokens', () => {
  const themes = [
    { name: 'light', block: declarations(':root') },
    { name: 'dark', block: declarations(":root[data-theme='dark']") },
  ]

  it.each(themes)(
    '$name tokens meet text, boundary, disabled, invalid, and focus contrast',
    ({ block }) => {
      const card = token(block, 'card')
      expect(contrast(token(block, 'control-placeholder'), card)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token(block, 'control-border'), card)).toBeGreaterThanOrEqual(3)
      expect(
        contrast(token(block, 'control-disabled-border'), token(block, 'control-disabled-bg')),
      ).toBeGreaterThanOrEqual(3)
      expect(contrast(token(block, 'control-invalid-border'), card)).toBeGreaterThanOrEqual(3)
      expect(contrast(token(block, 'focus-outer'), card)).toBeGreaterThanOrEqual(3)
      expect(
        contrast(token(block, 'focus-inner'), token(block, 'control-border')),
      ).toBeGreaterThanOrEqual(3)
    },
  )

  it('uses semantic tokens in the shared control, disabled, invalid, and forced-colors rules', () => {
    expect(styles).toContain('border: 1px solid var(--control-border);')
    expect(styles).toContain('color: var(--control-placeholder);')
    expect(styles).toContain('border-color: var(--control-disabled-border);')
    expect(styles).toContain("[aria-invalid='true']")
    expect(styles).toContain('border: 1px solid CanvasText;')
    expect(styles).not.toContain('border: 1px solid #a9aba1;')
    expect(styles).not.toContain('color: #6a7d76;')
  })
})

describe('semantic typography contract', () => {
  it('defines the documented semantic role tokens and an intentional heading scale', () => {
    const root = declarations(':root')
    const requiredTokens = [
      'font-ui',
      'font-display',
      'type-size-caption',
      'type-size-supporting',
      'type-size-label',
      'type-size-body',
      'type-size-lede',
      'type-size-heading-3',
      'type-size-heading-2',
      'type-size-heading-1',
      'type-leading-compact',
      'type-leading-supporting',
      'type-leading-body',
      'type-leading-display-tight',
      'type-leading-display',
      'type-leading-display-relaxed',
      'type-tracking-display',
      'type-tracking-display-subtle',
      'type-tracking-uppercase',
      'type-tracking-uppercase-wide',
      'type-weight-regular',
      'type-weight-strong',
    ]

    for (const name of requiredTokens) expect(root).toContain(`--${name}:`)

    const sizeInPixels = (name: string) => {
      const value = root.match(new RegExp(`--${name}:\\s*([0-9.]+)rem;`))?.[1]
      if (!value) throw new Error(`Missing rem value for --${name}`)
      return Number(value) * 16
    }
    const heading1 = sizeInPixels('type-size-heading-1')
    const heading2 = sizeInPixels('type-size-heading-2')
    const heading3 = sizeInPixels('type-size-heading-3')

    expect(heading1 / heading2).toBeGreaterThanOrEqual(1.25)
    expect(heading2 / heading3).toBeGreaterThanOrEqual(1.25)
    expect(sizeInPixels('type-size-body')).toBe(18)
    expect(sizeInPixels('type-size-label')).toBeGreaterThanOrEqual(16)
    expect(sizeInPixels('type-size-caption')).toBeGreaterThanOrEqual(13)
  })

  it('uses tokens for typography declarations unless an isolated exception is documented', () => {
    const violations = typographyViolations(styles)
    expect(violations, `Unapproved raw typography declarations:\n${violations.join('\n')}`).toEqual(
      [],
    )
  })

  it.each([
    ['wrong-role token', 'font-size: var(--type-size-body);', 'font-size: var(--ink);'],
    [
      'raw fallback',
      'font-size: var(--type-size-body);',
      'font-size: var(--type-size-body, 10px);',
    ],
    [
      'token arithmetic',
      'font-size: var(--type-size-body);',
      'font-size: calc(var(--type-size-body) - 2px);',
    ],
    ['raw font shorthand', 'font: inherit;', 'font: 12px Arial;'],
    ['uppercase property', 'font-size: var(--type-size-body);', 'FONT-SIZE: 10px;'],
    ['newline-formatted value', 'font-size: var(--type-size-body);', 'font-size:\n 10px;'],
    ['escaped hyphen', 'font-size: var(--type-size-body);', 'font\\2d size: 10px;'],
    ['escaped letter', 'font-size: var(--type-size-body);', 'f\\6f nt-size: 11px;'],
  ])('rejects the %s mutant', (_name, approved, mutant) => {
    const mutated = styles.replace(approved, mutant)
    expect(mutated).not.toBe(styles)
    expect(typographyViolations(mutated)).not.toEqual([])
  })

  it('rejects arbitrary exception comments and unapproved selector/value pairs', () => {
    const mutant = `${styles}\n/* typography-exception: arbitrary */\n.fake { font-size: 10px; }\n`
    expect(typographyViolations(mutant)).toContainEqual(expect.stringContaining('.fake'))
  })

  it('rejects local semantic token redefinitions', () => {
    const mutant = `${styles}\n.fake { --type-size-body: 10px; font-size: var(--type-size-body); }\n`
    expect(typographyViolations(mutant)).toContainEqual(expect.stringContaining('.fake'))
  })

  it('rejects a later root block that overrides the canonical contract', () => {
    const mutant = `${styles}\n:root { --type-size-body: 10px; }\n`
    expect(typographyViolations(mutant)).toContainEqual(expect.stringContaining(':root'))
  })

  it('rejects a duplicate token inside the canonical root contract', () => {
    const approved = '--type-size-body: 1.125rem;'
    const mutant = styles.replace(approved, `${approved}\n  ${approved}`)
    expect(mutant).not.toBe(styles)
    expect(typographyViolations(mutant)).toContainEqual(
      expect.stringContaining('expected one --type-size-body definition, found 2'),
    )
  })

  it('uses the display family token for the catalog placeholder and normal headings', () => {
    expect(declarations('.catalog-card__placeholder > span')).toContain(
      'font-family: var(--font-display);',
    )
    expect(styles).toMatch(/h1,\s*h2,\s*h3\s*\{[^}]*font-family: var\(--font-display\);/s)
  })
})
