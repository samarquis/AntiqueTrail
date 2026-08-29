import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const surfaces = [
  {
    id: 'public-catalog',
    path: '/stores?reviewAs=anonymous&reviewState=success',
    roles: { labels: true, cardFacts: false, statuses: true, adjacentHeadings: true },
  },
  {
    id: 'shopper-saved',
    path: '/saved?reviewAs=shopper-a&reviewState=success',
    roles: { labels: false, cardFacts: true, statuses: false, adjacentHeadings: false },
  },
  {
    id: 'shopper-trips',
    path: '/trips?reviewAs=shopper-a&reviewState=success',
    roles: { labels: false, cardFacts: false, statuses: false, adjacentHeadings: false },
  },
  {
    id: 'store-portal',
    path: '/store-portal?reviewAs=representative&reviewState=success',
    roles: { labels: false, cardFacts: true, statuses: false, adjacentHeadings: true },
  },
  {
    id: 'admin-queue',
    path: '/admin?reviewAs=administrator&reviewState=success',
    roles: { labels: false, cardFacts: false, statuses: false, adjacentHeadings: true },
  },
  {
    id: 'store-photos',
    path: '/stores/blue-finch-curios/photos?reviewAs=anonymous&reviewState=success',
    roles: { labels: false, cardFacts: false, statuses: false, adjacentHeadings: false },
  },
] as const

const requiredViewports = [
  { id: 'mobile-393', width: 393, height: 852 },
  { id: 'desktop', width: 1280, height: 900 },
] as const

const additionalViewports = [
  { id: 'mobile-390', width: 390, height: 844 },
  { id: 'tablet', width: 768, height: 1024 },
  // Playwright cannot emulate browser zoom; 320 CSS px is the 200% reflow area from 640px.
  { id: 'reflow-320', width: 320, height: 900 },
] as const

const themes = ['light', 'dark'] as const

async function openSurface(
  page: Page,
  path: string,
  viewport: { width: number; height: number },
  theme: (typeof themes)[number],
) {
  await page.setViewportSize(viewport)
  await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function typographyMetrics(page: Page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const h1 = getComputedStyle(document.querySelector('h1')!)
    const isRendered = (element: HTMLElement) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        !element.closest('[aria-hidden="true"], .sr-only')
      )
    }
    const visibleStyles = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)].filter(isRendered).map((element) => {
        const style = getComputedStyle(element)
        return {
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
          lineHeight: style.lineHeight,
        }
      })
    const headingRoles = [...document.querySelectorAll<HTMLElement>('h1, h2, h3')]
      .filter(isRendered)
      .map((element) => {
        const style = getComputedStyle(element)
        const cardTitle = element.matches('.catalog-card h2, .shopper-store-card h2')
        return {
          role: cardTitle ? 3 : Number(element.tagName.slice(1)),
          family: style.fontFamily,
          size: Number.parseFloat(style.fontSize),
        }
      })

    const textElements = new Set<HTMLElement>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim() && node.parentElement) textElements.add(node.parentElement)
    }
    const textIssues = [...textElements].flatMap((element) => {
      if (!isRendered(element)) return []
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const issues: string[] = []
      const label = `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 48)}`
      const viewportWidth = document.documentElement.clientWidth

      if (rect.left < -1 || rect.right > viewportWidth + 1) issues.push(`${label}:viewport-bounds`)
      if (
        ['hidden', 'clip'].includes(style.overflowX) &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        issues.push(`${label}:own-horizontal-clip`)
      }
      if (
        ['hidden', 'clip'].includes(style.overflowY) &&
        element.scrollHeight > element.clientHeight + 1
      ) {
        issues.push(`${label}:own-vertical-clip`)
      }

      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ) {
        const ancestorStyle = getComputedStyle(ancestor)
        const ancestorRect = ancestor.getBoundingClientRect()
        if (
          ['hidden', 'clip'].includes(ancestorStyle.overflowX) &&
          (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1)
        ) {
          issues.push(`${label}:ancestor-horizontal-clip`)
          break
        }
        if (
          ['hidden', 'clip'].includes(ancestorStyle.overflowY) &&
          (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1)
        ) {
          issues.push(`${label}:ancestor-vertical-clip`)
          break
        }
        ancestor = ancestor.parentElement
      }
      return issues
    })

    return {
      body: { size: body.fontSize, lineHeight: body.lineHeight },
      h1: { family: h1.fontFamily, size: h1.fontSize },
      headingRoles,
      labels: visibleStyles('label'),
      buttons: visibleStyles('button, .button'),
      cardFacts: visibleStyles('.shopper-store-card__facts dt, .portal-status__facts dt'),
      statuses: visibleStyles('.catalog-card__freshness, .status-badge'),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      textIssues,
    }
  })
}

function expectSemanticRoles(
  metrics: Awaited<ReturnType<typeof typographyMetrics>>,
  context: string,
  expected: (typeof surfaces)[number]['roles'],
) {
  expect(metrics.documentWidth, `${context} horizontal overflow`).toBeLessThanOrEqual(
    metrics.viewportWidth + 1,
  )
  expect(metrics.body).toEqual({ size: '18px', lineHeight: '27px' })
  expect(metrics.h1.family).toContain('Newsreader')
  expect(metrics.h1.size).toBe('42px')
  expect(metrics.textIssues, `${context} clipped or out-of-bounds text`).toEqual([])

  const expectedHeadingSizes = new Map([
    [1, 42],
    [2, 29],
    [3, 23],
  ])
  expect(metrics.headingRoles.length, `${context} rendered heading count`).toBeGreaterThan(0)
  for (const heading of metrics.headingRoles) {
    expect(heading.family, `${context} heading role ${heading.role} family`).toContain('Newsreader')
    expect(heading.size, `${context} heading role ${heading.role} size`).toBe(
      expectedHeadingSizes.get(heading.role),
    )
  }
  const renderedRoleSizes = new Map(
    metrics.headingRoles.map((heading) => [heading.role, heading.size]),
  )
  const adjacentRatios = [
    renderedRoleSizes.has(1) && renderedRoleSizes.has(2)
      ? renderedRoleSizes.get(1)! / renderedRoleSizes.get(2)!
      : null,
    renderedRoleSizes.has(2) && renderedRoleSizes.has(3)
      ? renderedRoleSizes.get(2)! / renderedRoleSizes.get(3)!
      : null,
  ].filter((ratio): ratio is number => ratio !== null)
  if (expected.adjacentHeadings) {
    expect(adjacentRatios.length, `${context} rendered adjacent heading pairs`).toBeGreaterThan(0)
  }
  for (const ratio of adjacentRatios) expect(ratio).toBeGreaterThanOrEqual(1.25)

  if (expected.labels) expect(metrics.labels.length, `${context} labels`).toBeGreaterThan(0)
  for (const label of metrics.labels) {
    expect(`${label.size}/${label.weight}`, `${context} label role`).toBe('16px/700')
  }
  expect(metrics.buttons.length, `${context} buttons`).toBeGreaterThan(0)
  expect(
    metrics.buttons.every(
      (button) =>
        button.family.includes('Atkinson Hyperlegible') &&
        button.size === '16px' &&
        button.weight === '700',
    ),
  ).toBe(true)
  if (expected.cardFacts)
    expect(metrics.cardFacts.length, `${context} card facts`).toBeGreaterThan(0)
  for (const fact of metrics.cardFacts) {
    expect(`${fact.size}/${fact.weight}`, `${context} card fact role`).toBe('15px/700')
  }
  if (expected.statuses) expect(metrics.statuses.length, `${context} statuses`).toBeGreaterThan(0)
  for (const status of metrics.statuses) {
    expect(`${status.size}/${status.weight}`, `${context} status role`).toBe('16px/700')
  }
}

test.describe('issue 144 semantic typography rendered contract', () => {
  test('equivalent roles resolve to the same computed values across audience routes', async ({
    page,
  }) => {
    const readRole = async (path: string, selector: string) => {
      await openSurface(page, path, requiredViewports[1], 'light')
      const values = await page.locator(selector).evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element)
          return {
            family: style.fontFamily,
            size: style.fontSize,
            weight: style.fontWeight,
            lineHeight: style.lineHeight,
          }
        }),
      )
      expect(values.length, `${path} must expose ${selector}`).toBeGreaterThan(0)
      return values
    }

    const sectionHeadings = [
      await readRole(surfaces[0].path, '.catalog-results-heading h2'),
      await readRole(surfaces[3].path, 'main h2'),
      await readRole(surfaces[4].path, 'main h2'),
    ]
    expect(sectionHeadings.flat().every((role) => role.family.includes('Newsreader'))).toBe(true)
    expect(new Set(sectionHeadings.flat().map((role) => role.size))).toEqual(new Set(['29px']))

    const cardHeadings = [
      await readRole(surfaces[0].path, '.catalog-card h2'),
      await readRole(surfaces[1].path, '.shopper-store-card h2'),
    ]
    expect(new Set(cardHeadings.flat().map((role) => role.size))).toEqual(new Set(['23px']))

    const factLabels = [
      await readRole(surfaces[1].path, '.shopper-store-card__facts dt'),
      await readRole(surfaces[3].path, '.portal-status__facts dt'),
    ]
    expect(new Set(factLabels.flat().map((role) => `${role.size}/${role.weight}`))).toEqual(
      new Set(['15px/700']),
    )

    const formLabels = [
      await readRole(surfaces[0].path, 'label'),
      await readRole('/admin/access?reviewAs=administrator&reviewState=success', 'label'),
    ]
    expect(new Set(formLabels.flat().map((role) => `${role.size}/${role.weight}`))).toEqual(
      new Set(['16px/700']),
    )

    const buttons = []
    for (const surface of surfaces.slice(0, 5)) {
      buttons.push(await readRole(surface.path, 'button, .button'))
    }
    expect(new Set(buttons.flat().map((role) => `${role.size}/${role.weight}`))).toEqual(
      new Set(['16px/700']),
    )

    const statuses = await readRole(
      '/stores/blue-finch-curios?reviewAs=anonymous&reviewState=success',
      '.status-badge',
    )
    expect(new Set(statuses.map((role) => `${role.size}/${role.weight}`))).toEqual(
      new Set(['16px/700']),
    )
  })

  for (const viewport of requiredViewports) {
    for (const theme of themes) {
      for (const surface of surfaces) {
        test(`${surface.id} at ${viewport.id} in ${theme}`, async ({ page }) => {
          await openSurface(page, surface.path, viewport, theme)
          expectSemanticRoles(
            await typographyMetrics(page),
            `${surface.id} ${viewport.id} ${theme}`,
            surface.roles,
          )

          if (process.env.CAPTURE_ISSUE_144_EVIDENCE) {
            await page.screenshot({
              path: `docs/evidence/issue-144/${viewport.id}-${theme}-${surface.id}.png`,
              fullPage: true,
            })
          }
        })
      }
    }
  }

  for (const viewport of additionalViewports) {
    for (const surface of surfaces) {
      test(`${surface.id} reflows at ${viewport.id}`, async ({ page }) => {
        await openSurface(page, surface.path, viewport, 'light')
        expectSemanticRoles(
          await typographyMetrics(page),
          `${surface.id} ${viewport.id}`,
          surface.roles,
        )
      })
    }
  }

  for (const surface of surfaces) {
    test(`${surface.id} retains roles in forced colors`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: 'active' })
      await openSurface(page, surface.path, requiredViewports[0], 'light')
      await expect
        .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
        .toBe(true)
      expectSemanticRoles(
        await typographyMetrics(page),
        `${surface.id} forced colors`,
        surface.roles,
      )
    })

    test(`${surface.id} has no serious accessibility violation in dark theme`, async ({ page }) => {
      await openSurface(page, surface.path, requiredViewports[0], 'dark')
      const results = await new AxeBuilder({ page }).analyze()
      expect(
        results.violations
          .filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
          .map((violation) => ({ id: violation.id, nodes: violation.nodes.length })),
      ).toEqual([])
    })
  }
})
