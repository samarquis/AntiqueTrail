import { expect, test, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const populatedPath = '/stores?reviewAs=anonymous&reviewState=success'
const evidenceDirectory = 'docs/evidence/issue-147'
const viewports = [
  { id: 'phone-320', width: 320, height: 900 },
  { id: 'phone-393', width: 393, height: 852 },
  { id: 'tablet-768', width: 768, height: 1024 },
  { id: 'desktop-1280', width: 1280, height: 900 },
] as const
const themes = ['light', 'dark'] as const

async function openCatalog(
  page: Page,
  path: string,
  viewport: (typeof viewports)[number],
  theme: (typeof themes)[number],
) {
  await page.setViewportSize(viewport)
  await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function captureEvidence(page: Page, name: string) {
  await page.screenshot({
    path: `${evidenceDirectory}/${name}.jpg`,
    type: 'jpeg',
    quality: 65,
    fullPage: true,
  })
}

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
  }))
  expect(widths.bodyScroll).toBeLessThanOrEqual(widths.bodyClient + 1)
  expect(widths.documentScroll).toBeLessThanOrEqual(widths.documentClient + 1)
}

async function expectMinimumTargets(page: Page) {
  const undersized = await page.locator('a, button, input, select, textarea').evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement)) return []
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden') return []
      const target =
        node instanceof HTMLInputElement && ['checkbox', 'radio'].includes(node.type)
          ? (node.closest('label') ?? node)
          : node
      const rect = target.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && (rect.width < 47.99 || rect.height < 47.99)
        ? [{ label: node.getAttribute('aria-label') ?? node.textContent?.trim(), ...rect.toJSON() }]
        : []
    }),
  )
  expect(undersized, 'interactive targets smaller than 48px').toEqual([])
}

async function expectPopulatedCatalogContract(page: Page) {
  const cards = page.locator('.catalog-card')
  await expect(cards).toHaveCount(12)
  await expect(cards.first()).toBeVisible()

  const metrics = await cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement
      const readNode = (target: HTMLElement) => {
        const style = getComputedStyle(target)
        const rect = target.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(target)
        const textRect = range.getBoundingClientRect()
        const issues: string[] = []
        if (textRect.left < rect.left - 1 || textRect.right > rect.right + 1)
          issues.push('text-horizontal-bounds')
        if (textRect.top < rect.top - 1 || textRect.bottom > rect.bottom + 1)
          issues.push('text-vertical-bounds')
        for (let ancestor = target.parentElement; ancestor && ancestor !== document.body; ) {
          const ancestorStyle = getComputedStyle(ancestor)
          const ancestorRect = ancestor.getBoundingClientRect()
          if (
            ['hidden', 'clip'].includes(ancestorStyle.overflowX) &&
            (textRect.left < ancestorRect.left - 1 || textRect.right > ancestorRect.right + 1)
          )
            issues.push(`ancestor-horizontal-clip:${ancestor.className}`)
          if (
            ['hidden', 'clip'].includes(ancestorStyle.overflowY) &&
            (textRect.top < ancestorRect.top - 1 || textRect.bottom > ancestorRect.bottom + 1)
          )
            issues.push(`ancestor-vertical-clip:${ancestor.className}`)
          ancestor = ancestor.parentElement
        }
        return {
          text: target.textContent?.trim(),
          size: Number.parseFloat(style.fontSize),
          weight: style.fontWeight,
          lineHeight: Number.parseFloat(style.lineHeight),
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          scrollWidth: target.scrollWidth,
          clientWidth: target.clientWidth,
          scrollHeight: target.scrollHeight,
          clientHeight: target.clientHeight,
          issues,
        }
      }
      const read = (selector: string) => {
        const target = element.querySelector<HTMLElement>(selector)
        if (!target) throw new Error(`Missing repeated-card field: ${selector}`)
        return readNode(target)
      }
      const readAll = (selector: string) =>
        [...element.querySelectorAll<HTMLElement>(selector)].map(readNode)
      const actions = read('.catalog-card__actions')
      const details = read('.catalog-card__details')
      const semanticNodes = [
        ...element.querySelectorAll<HTMLElement>(
          'h2, .catalog-card__area, .catalog-card__body > p:not([class]), .catalog-card__categories li, .catalog-card__hours, .catalog-card__freshness, .catalog-card__details, .catalog-card__actions',
        ),
      ].map(readNode)
      const overlaps = semanticNodes.flatMap((left, leftIndex) =>
        semanticNodes
          .slice(leftIndex + 1)
          .flatMap((right) =>
            Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1 &&
            Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1
              ? [`${left.text} <> ${right.text}`]
              : [],
          ),
      )
      return {
        card: {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        },
        area: read('.catalog-card__area'),
        title: read('h2'),
        descriptions: readAll('.catalog-card__body > p:not([class])'),
        categories: readAll('.catalog-card__categories li'),
        hours: read('.catalog-card__hours'),
        freshness: read('.catalog-card__freshness'),
        details,
        actions,
        overlaps,
      }
    }),
  )

  for (const card of metrics) {
    expect(card.area.size).toBeGreaterThanOrEqual(14)
    expect(card.categories.length).toBeGreaterThan(0)
    expect(card.categories.every((category) => category.size >= 14)).toBe(true)
    expect(card.descriptions).toHaveLength(2)
    expect(card.descriptions.every((description) => description.size >= 14)).toBe(true)
    expect(card.freshness.size).toBeGreaterThanOrEqual(14)
    expect(card.hours.size).toBeGreaterThanOrEqual(14)
    expect(card.title.size).toBeGreaterThanOrEqual(20)
    expect(`${card.area.size}/${card.area.weight}`).toBe('16/700')
    expect(card.categories.every((category) => category.size === 16)).toBe(true)
    expect(`${card.freshness.size}/${card.freshness.weight}`).toBe('16/700')
    expect(card.card.scrollWidth).toBeLessThanOrEqual(card.card.clientWidth + 1)
    expect(card.card.scrollHeight).toBeLessThanOrEqual(card.card.clientHeight + 1)
    for (const field of [
      card.area,
      card.title,
      ...card.descriptions,
      ...card.categories,
      card.hours,
      card.freshness,
      card.details,
    ]) {
      expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1)
      expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight + 1)
      expect(field.issues).toEqual([])
    }
    expect(card.overlaps).toEqual([])
    expect(card.title.bottom).toBeLessThanOrEqual(card.area.top)
    expect(card.area.bottom).toBeLessThanOrEqual(card.descriptions[0].top)
    expect(card.descriptions[0].bottom).toBeLessThanOrEqual(
      Math.min(...card.categories.map((item) => item.top)),
    )
    expect(Math.max(...card.categories.map((item) => item.bottom))).toBeLessThanOrEqual(
      card.descriptions[1].top,
    )
    expect(card.descriptions[1].bottom).toBeLessThanOrEqual(card.hours.top)
    expect(card.hours.bottom).toBeLessThanOrEqual(card.freshness.top)
    expect(card.freshness.bottom).toBeLessThanOrEqual(card.details.top)
    expect(card.details.bottom).toBeLessThanOrEqual(card.actions.top)
  }

  expect(new Set(metrics.flatMap((card) => card.categories.map((item) => item.text)))).toEqual(
    new Set(['Antique mall', 'Vintage']),
  )
  expect(new Set(metrics.map((card) => card.freshness.text))).toEqual(
    new Set(['Verified for Synthetic testing', 'Verification overdue']),
  )
  for (const field of ['area', 'hours'] as const)
    expect(metrics.every((card) => Boolean(card[field].text))).toBe(true)
  expect(metrics.every((card) => card.descriptions.every((item) => Boolean(item.text)))).toBe(true)

  await expectMinimumTargets(page)
  await expectNoDocumentOverflow(page)

  if ((await page.viewportSize())!.width <= 800) {
    const filterButton = page.getByRole('button', { name: 'Filters' })
    await expect(filterButton).toBeVisible()
    await filterButton.click()
    await expect(page.getByRole('search').getByLabel('Search stores')).toBeVisible()
    await expectMinimumTargets(page)
    await expectNoDocumentOverflow(page)
  }

  if ((await page.viewportSize())!.width <= 1023) {
    for (const card of await cards.all()) {
      for (const control of await card
        .locator('.catalog-card__details, .catalog-card__actions a, .catalog-card__actions button')
        .all()) {
        await control.scrollIntoViewIfNeeded()
        const coverage = await control.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )
          return {
            hitTarget: hit ? node === hit || node.contains(hit) : false,
            navigationOverlap: (() => {
              const navigation = document
                .querySelector<HTMLElement>('.site-header nav')
                ?.getBoundingClientRect()
              return navigation ? Math.max(0, rect.bottom - navigation.top) : 0
            })(),
          }
        })
        expect(coverage).toEqual({ hitTarget: true, navigationOverlap: 0 })
      }
    }
  }

  return metrics
}

test.describe('issue 147 catalog metadata', () => {
  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`renders twelve readable cards at ${viewport.id} in ${theme}`, async ({ page }) => {
        await openCatalog(page, populatedPath, viewport, theme)
        const metrics = await expectPopulatedCatalogContract(page)
        if (process.env.CAPTURE_ISSUE_147_EVIDENCE) {
          await captureEvidence(page, `2026-08-29-${viewport.id}-${theme}-populated`)
          if (viewport.id === 'phone-393' && theme === 'light') {
            writeFileSync(
              `${evidenceDirectory}/2026-08-29-phone-393-light-card-measurements.json`,
              `${JSON.stringify({ capturedOn: '2026-08-29', viewport, theme, cards: metrics }, null, 2)}\n`,
            )
          }
        }
      })
    }
  }

  test('measures the meaningful failed-cover placeholder variant', async ({ page }) => {
    await page.route(/blue-finch-curios-cover\.webp(?:\?.*)?$/u, (route) => route.abort('failed'))
    await openCatalog(page, `${populatedPath}&q=Blue`, viewports[1], 'light')
    const placeholder = page.locator('.catalog-card__placeholder').first()
    await expect(placeholder).toBeVisible()
    const measurement = await placeholder.locator('small').evaluate((node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(node)
      const text = range.getBoundingClientRect()
      return {
        size: Number.parseFloat(style.fontSize),
        text: node.textContent?.trim(),
        clipped:
          text.left < rect.left - 1 ||
          text.right > rect.right + 1 ||
          text.top < rect.top - 1 ||
          text.bottom > rect.bottom + 1,
      }
    })
    expect(measurement).toEqual({
      size: 15,
      text: 'Antique mall · Photo coming soon',
      clipped: false,
    })
    await expectNoDocumentOverflow(page)
    if (process.env.CAPTURE_ISSUE_147_EVIDENCE)
      await captureEvidence(page, '2026-08-29-phone-393-light-failed-cover')
  })

  for (const state of ['loading', 'empty', 'error'] as const) {
    for (const viewport of viewports) {
      for (const theme of themes) {
        test(`renders ${state} at ${viewport.id} in ${theme} without overflow`, async ({
          page,
        }) => {
          await openCatalog(
            page,
            `/stores?reviewAs=anonymous&reviewState=${state}`,
            viewport,
            theme,
          )
          const expectedHeading = {
            loading: 'Finding stores',
            empty: 'The trail is quiet for now',
            error: 'We couldn’t load the stores',
          }[state]
          await expect(page.getByRole('heading', { level: 2, name: expectedHeading })).toBeVisible()
          await expectNoDocumentOverflow(page)
          await expectMinimumTargets(page)
          if (
            process.env.CAPTURE_ISSUE_147_EVIDENCE &&
            viewport.id === 'phone-393' &&
            theme === 'light'
          ) {
            await captureEvidence(page, `2026-08-29-${viewport.id}-${theme}-${state}`)
          }
        })
      }
    }
  }

  for (const theme of themes) {
    test(`reflows a 640px viewport at the 200% standards-equivalent width in ${theme}`, async ({
      page,
    }) => {
      const sourceViewportWidth = 640
      const zoomPercent = 200
      const equivalentCssWidth = sourceViewportWidth / (zoomPercent / 100)
      expect(equivalentCssWidth).toBe(viewports[0].width)
      await openCatalog(page, populatedPath, viewports[0], theme)
      await expectPopulatedCatalogContract(page)
      if (process.env.CAPTURE_ISSUE_147_EVIDENCE) {
        await captureEvidence(page, `2026-08-29-zoom-200-percent-equivalent-${theme}`)
      }
    })
  }

  for (const viewport of viewports) {
    for (const theme of themes) {
      test(`expands with WCAG text spacing at ${viewport.id} in ${theme}`, async ({ page }) => {
        await openCatalog(page, populatedPath, viewport, theme)
        await page.addStyleTag({
          content: `
            :where(*:not(svg, svg *)) {
              line-height: 1.5 !important;
              letter-spacing: 0.12em !important;
              word-spacing: 0.16em !important;
            }
            p { margin-bottom: 2em !important; }
          `,
        })
        await expectPopulatedCatalogContract(page)
        if (process.env.CAPTURE_ISSUE_147_EVIDENCE && viewport.id === 'phone-320') {
          await captureEvidence(page, `2026-08-29-${viewport.id}-${theme}-text-spacing`)
        }
      })
    }
  }
})
