import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/app/styles.css'), 'utf8')
const storePhotosSource = readFileSync(
  resolve(process.cwd(), 'src/features/catalog/StorePhotosPage.tsx'),
  'utf8',
)
const storeGallerySource = readFileSync(
  resolve(process.cwd(), 'src/features/catalog/components.tsx'),
  'utf8',
)
const mediaOverlaySource = readFileSync(
  resolve(process.cwd(), 'src/features/catalog/mediaOverlay.tsx'),
  'utf8',
)

function declarations(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  if (!match) throw new Error(`Missing ${selector} token block`)
  return match[1]
}

function token(block: string, name: string, root = declarations(':root'), seen = new Set<string>()) {
  if (seen.has(name)) throw new Error(`Circular --${name} definition`)
  seen.add(name)
  const declaration = (source: string) =>
    source.match(new RegExp(`--${name}:\\s*([^;]+);`, 'i'))?.[1]?.trim()
  const value = declaration(block) ?? declaration(root)
  if (!value) throw new Error(`Missing --${name}`)
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  const reference = value.match(/^var\((--[a-z0-9-]+)\)$/i)?.[1]
  if (reference) return token(block, reference.slice(2), root, seen)
  throw new Error(`--${name} must resolve to an approved hex token, received ${value}`)
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

const themeColorTokens = [
  'ink',
  'muted',
  'paper',
  'card',
  'line',
  'teal',
  'teal-dark',
  'mint',
  'rust',
  'gold',
  'olive',
  'focus-inner',
  'focus-outer',
] as const

const rootColorExceptions = new Set(['media-overlay-surface', 'media-overlay-text', 'on-action'])

const artColorExceptions = new Set([
  '.shopper-store-card__placeholder|background',
  '.catalog-map-panel|border',
  '.catalog-map-panel|background',
  '.catalog-map-panel::before|border',
  '.catalog-card__placeholder|background',
  '.catalog-card__placeholder::before, .catalog-card__placeholder::after|border',
  '.catalog-card__placeholder > span|border',
  '.catalog-card__placeholder > span|background',
  '.catalog-card__placeholder > small|color',
  "main > article > img, main > article > [role='img']|background",
  '.accessible-map__plot|background',
  "[data-theme='dark'] .shopper-store-card__placeholder|background",
  "[data-theme='dark'] .catalog-map-panel|border-color",
  "[data-theme='dark'] .catalog-map-panel|background",
  "[data-theme='dark'] .catalog-map-panel::before|border-color",
  "[data-theme='dark'] .catalog-card__placeholder|background",
  "[data-theme='dark'] .catalog-card__placeholder::before, [data-theme='dark'] .catalog-card__placeholder::after|border-color",
  "[data-theme='dark'] .catalog-card__placeholder > span|border-color",
  "[data-theme='dark'] .catalog-card__placeholder > span|background",
  "[data-theme='dark'] .catalog-card__placeholder > small|color",
  "[data-theme='dark'] main > article > [role='img']|background",
  "[data-theme='dark'] .accessible-map__plot|background",
])

function normalizeSelector(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()
}

function semanticColorViolations(source: string) {
  const violations: string[] = []
  const parsed = postcss.parse(source)
  const rootBlocks = new Map<string, Map<string, string>>()

  parsed.walkRules((rule) => {
    const selector = normalizeSelector(rule.selector)
    if (selector === ':root' || selector === ":root[data-theme='dark']") {
      rootBlocks.set(
        selector,
        new Map(
          rule.nodes
            ?.filter((node) => node.type === 'decl')
            .map((node) => [node.prop.trim(), node.value.trim()]) ?? [],
        ),
      )
    }
  })

  const light = rootBlocks.get(':root')
  const dark = rootBlocks.get(":root[data-theme='dark']")
  if (!light || !dark) return ['contract: missing light or dark root token block']
  for (const name of themeColorTokens) {
    const property = `--${name}`
    if (!/^#[0-9a-f]{6}$/i.test(light.get(property) ?? ''))
      violations.push(`contract: ${property} needs an approved light hex value`)
    if (!/^#[0-9a-f]{6}$/i.test(dark.get(property) ?? ''))
      violations.push(`contract: ${property} needs an approved dark hex value`)
  }

  parsed.walkDecls((declaration) => {
    const parent = declaration.parent
    const selector = parent?.type === 'rule' ? normalizeSelector(parent.selector) : ''
    const key = `${selector}|${declaration.prop.trim()}`
    const value = declaration.value.trim()
    const rawColor = /#[0-9a-f]{3,8}\b|\brgba?\s*\(/i.test(value)
    const systemColor = /\b(?:Canvas(?:Text)?|Button(?:Face|Text)|Highlight)\b/.test(value)
    const inForcedColors = (() => {
      for (let node = parent; node; node = node.parent) {
        if (node.type === 'atrule' && node.name === 'media' && /forced-colors:\s*active/i.test(node.params))
          return true
      }
      return false
    })()

    if (systemColor && !inForcedColors)
      violations.push(`${declaration.source?.start?.line ?? 0}: system color outside forced-colors rule`)
    if (!rawColor) return
    if (selector === ':root' || selector === ":root[data-theme='dark']") {
      const name = declaration.prop.trim().replace(/^--/, '')
      if (!themeColorTokens.includes(name as (typeof themeColorTokens)[number]) && !rootColorExceptions.has(name))
        violations.push(`${declaration.source?.start?.line ?? 0}: undocumented root color ${name}`)
      return
    }
    if (!artColorExceptions.has(key))
      violations.push(`${declaration.source?.start?.line ?? 0}: undocumented reusable color ${key}`)
  })

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

describe('semantic color-token regression contract', () => {
  it('keeps every reusable literal at the approved theme boundary or a documented art exception', () => {
    const violations = semanticColorViolations(styles)
    expect(violations, `Unapproved semantic colors:\n${violations.join('\n')}`).toEqual([])
  })

  it.each([
    [
      'a raw shared surface',
      'background: var(--surface-chrome);',
      'background: #fffdfc;',
    ],
    ['a missing dark token pair', '--gold: #b99554;', '--gold: var(--card);'],
    [
      'an undocumented art exception',
      '/* #143 owns this narrow media contract; #142 retains broad semantic-color ownership. */',
      '/* #143 owns this narrow media contract; #142 retains broad semantic-color ownership. */\n.fake { color: #41635b; }',
    ],
    ['a system color outside forced colors', 'color: var(--muted);', 'color: CanvasText;'],
  ])('rejects %s', (_name, approved, mutant) => {
    const mutated = styles.replace(approved, mutant)
    expect(mutated).not.toBe(styles)
    expect(semanticColorViolations(mutated)).not.toEqual([])
  })
})

describe('shared media overlay contrast contract', () => {
  it('uses opaque tokens that exceed caption and control contrast floors in both themes', () => {
    const root = declarations(':root')
    const surface = token(root, 'media-overlay-surface')
    const foreground = token(root, 'media-overlay-text')
    const ratio = contrast(surface, foreground)

    expect(Number.isFinite(ratio)).toBe(true)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeGreaterThanOrEqual(3)
    expect(declarations(":root[data-theme='dark']")).not.toContain('--media-overlay-')
    expect(surface).toMatch(/^#[0-9a-f]{6}$/i)
    expect(foreground).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('puts every caption, unavailable state, and lightbox control on the shared surface', () => {
    const surface = declarations('.media-overlay-surface')
    expect(surface).toContain('color: var(--media-overlay-text);')
    expect(surface).toContain('background: var(--media-overlay-surface);')
    expect(surface).toContain('opacity: 1;')
    expect(surface).not.toMatch(/gradient|rgba?|color-mix/i)
    expect(styles).not.toMatch(/linear-gradient\(transparent,\s*rgb\(32 40 51/i)

    const revealedTile = declarations('.store-photos--reveal .store-photos__tile')
    expect(revealedTile).not.toContain('opacity:')

    expect(storePhotosSource).toMatch(
      /MediaCaption media=\{item\} className="store-photos__feature-caption"/,
    )
    expect(storePhotosSource).toMatch(/MediaTileOverlay media=\{item\}/)
    expect(storePhotosSource).toMatch(
      /MediaCaption media=\{lightboxPhoto\} className="store-photos__lightbox-caption"/,
    )
    expect(storeGallerySource).toMatch(
      /MediaCaption media=\{selected\} className="store-gallery__plate"/,
    )
    expect(storeGallerySource).toMatch(
      /MediaCaption media=\{selected\} className="store-gallery__room-caption"/,
    )
    expect(mediaOverlaySource).toMatch(/classNames\(MEDIA_OVERLAY_SURFACE_CLASS, className\)/)
    for (const source of [storePhotosSource, storeGallerySource]) {
      expect(source.match(/MEDIA_OVERLAY_CONTROL_CLASS/g)?.length).toBe(4)
    }
    for (const selector of [
      'store-photos__lightbox-close',
      'store-photos__lightbox-nav store-photos__lightbox-nav--prev',
      'store-photos__lightbox-nav store-photos__lightbox-nav--next',
    ]) {
      expect(storePhotosSource).toContain(
        `className={\`${'${MEDIA_OVERLAY_CONTROL_CLASS}'} ${selector}\`}`,
      )
    }
    for (const selector of [
      'store-gallery__room-close',
      'store-gallery__room-nav store-gallery__room-nav--prev',
      'store-gallery__room-nav store-gallery__room-nav--next',
    ]) {
      expect(storeGallerySource).toContain(
        `className={\`${'${MEDIA_OVERLAY_CONTROL_CLASS}'} ${selector}\`}`,
      )
    }
    expect(styles).not.toMatch(/overflow-x:\s*(?:clip|hidden)/i)
  })

  it('keeps tile information persistent with explicit focus and forced-colors boundaries', () => {
    expect(declarations('.store-photos__tile-overlay')).not.toMatch(
      /opacity:\s*0|visibility:\s*hidden|display:\s*none/i,
    )
    expect(styles).not.toMatch(/store-photos__tile:(?:hover|focus-visible)[^{]+tile-overlay/i)
    expect(declarations('.store-photos__tile:focus-visible')).toContain(
      'outline: 3px solid var(--media-overlay-text);',
    )
    expect(declarations('.media-overlay-control.media-overlay-control:focus-visible')).toContain(
      'outline: 3px solid var(--media-overlay-text);',
    )
    expect(styles).toMatch(/@media \(forced-colors: active\)[\s\S]+CanvasText[\s\S]+ButtonFace/)
    expect(styles).toMatch(/media-overlay-control:focus-visible[\s\S]+outline-color:\s*Highlight/)
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
