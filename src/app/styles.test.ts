import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
