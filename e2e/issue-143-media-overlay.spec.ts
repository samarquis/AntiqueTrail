import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'

const evidenceRoot = 'docs/evidence/issue-143/2026-08-29'
const shouldCapture = process.env.CAPTURE_ISSUE_143_EVIDENCE === '1'

const viewports = [
  { name: 'mobile-320', width: 320, height: 900, hasTouch: true },
  { name: 'tablet-768-touch', width: 768, height: 1024, hasTouch: true },
  { name: 'desktop-1440', width: 1440, height: 1000, hasTouch: false },
] as const
const themes = ['light', 'dark'] as const
const fixtures = ['near-white', 'high-detail', 'near-black', 'unavailable'] as const
const privateCanary =
  /object[_ -]?key|signed[_ -]?url|private[_ -]?key|token=|signature=|expires=|x-amz-|reviewer|moderation|provider response/iu

test.describe.configure({ timeout: 60_000 })

function fixtureSvg(fixture: Exclude<(typeof fixtures)[number], 'unavailable'>) {
  if (fixture === 'high-detail')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><defs><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse"><path fill="#fffdfc" d="M0 0h4v4H0zm4 4h4v4H4z"/><path fill="#121519" d="M4 0h4v4H4zM0 4h4v4H0z"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`
  const fill = fixture === 'near-white' ? '#fffdfc' : '#121519'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960"><rect width="100%" height="100%" fill="${fill}"/></svg>`
}

async function routeFixture(page: Page, fixture: (typeof fixtures)[number]) {
  await page.route(/\/synthetic-stores\/.*\.webp(?:\?.*)?$/u, async (route) => {
    if (fixture === 'unavailable') return route.abort('failed')
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: fixtureSvg(fixture),
      headers: { 'Cache-Control': 'no-store' },
    })
  })
}

async function contextFor(
  browser: Browser,
  baseURL: string | undefined,
  viewport: (typeof viewports)[number],
  theme: (typeof themes)[number],
  forcedColors: 'active' | 'none' = 'none',
) {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: viewport.width, height: viewport.height },
    hasTouch: viewport.hasTouch,
    colorScheme: theme,
    forcedColors,
  })
  await context.addInitScript((selectedTheme) => {
    window.localStorage.setItem('at-theme', selectedTheme)
  }, theme)
  return context
}

function rgba(value: string) {
  const channels = value.match(/[\d.]+/gu)?.map(Number) ?? []
  return {
    red: channels[0] ?? 0,
    green: channels[1] ?? 0,
    blue: channels[2] ?? 0,
    alpha: channels.length > 3 ? channels[3] : 1,
  }
}

function luminance({ red, green, blue }: ReturnType<typeof rgba>) {
  const [r, g, b] = [red, green, blue]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(rgba(first)), luminance(rgba(second))].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

type ExpectedSurface = { selector: string; count: number }

async function expectContained(page: Page, selector: string, index: number) {
  const locator = page.locator(selector).nth(index)
  await locator.evaluate((element) => {
    document.documentElement.style.scrollBehavior = 'auto'
    element.scrollIntoView({ block: 'center', inline: 'center' })
  })
  await expect(locator).toBeVisible()
  const measurement = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const textRects = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      textRects.push(
        ...Array.from(range.getClientRects()).map((textRect) => ({
          left: textRect.left,
          right: textRect.right,
          top: textRect.top,
          bottom: textRect.bottom,
        })),
      )
    }
    const ancestors: Array<{ element: HTMLElement; style: CSSStyleDeclaration }> = []
    let ancestor = element.parentElement
    while (ancestor) {
      ancestors.push({ element: ancestor, style: getComputedStyle(ancestor) })
      ancestor = ancestor.parentElement
    }
    const fixedIndex = ancestors.findIndex(({ style }) => style.position === 'fixed')
    const establishesFixedContainingBlock = (style: CSSStyleDeclaration) =>
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.backdropFilter !== 'none' ||
      /(?:layout|paint|strict|content)/u.test(style.contain) ||
      /(?:transform|perspective|filter)/u.test(style.willChange)
    const fixedContainingBlockIndex =
      fixedIndex < 0
        ? -1
        : ancestors.findIndex(
            ({ style }, index) => index > fixedIndex && establishesFixedContainingBlock(style),
          )
    const clippingAncestors =
      fixedIndex < 0 || fixedContainingBlockIndex >= 0
        ? ancestors
        : ancestors.slice(0, fixedIndex + 1)
    const clips = []
    for (const { element: clippingAncestor, style } of clippingAncestors) {
      if (/(auto|clip|hidden|scroll)/u.test(`${style.overflowX} ${style.overflowY}`)) {
        const ancestorRect = clippingAncestor.getBoundingClientRect()
        clips.push({
          left: ancestorRect.left,
          right: ancestorRect.right,
          top: ancestorRect.top,
          bottom: ancestorRect.bottom,
        })
      }
    }
    const style = getComputedStyle(element)
    return {
      color: style.color,
      background: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      textRects,
      clips,
      viewport: { width: innerWidth, height: innerHeight },
    }
  })
  expect(measurement.rect.left).toBeGreaterThanOrEqual(-1)
  expect(measurement.rect.right).toBeLessThanOrEqual(measurement.viewport.width + 1)
  expect(measurement.rect.top).toBeGreaterThanOrEqual(-1)
  expect(measurement.rect.bottom).toBeLessThanOrEqual(measurement.viewport.height + 1)
  for (const textRect of measurement.textRects) {
    expect(textRect.left).toBeGreaterThanOrEqual(measurement.rect.left - 1)
    expect(textRect.right).toBeLessThanOrEqual(measurement.rect.right + 1)
    expect(textRect.top).toBeGreaterThanOrEqual(measurement.rect.top - 1)
    expect(textRect.bottom).toBeLessThanOrEqual(measurement.rect.bottom + 1)
  }
  for (const clip of measurement.clips) {
    expect(measurement.rect.left).toBeGreaterThanOrEqual(clip.left - 1)
    expect(measurement.rect.right).toBeLessThanOrEqual(clip.right + 1)
    expect(measurement.rect.top).toBeGreaterThanOrEqual(clip.top - 1)
    expect(measurement.rect.bottom).toBeLessThanOrEqual(clip.bottom + 1)
  }
  return measurement
}

async function expectOpaqueSurfaces(page: Page, expected: ExpectedSurface[], forcedColors = false) {
  for (const { selector, count } of expected) {
    await expect(page.locator(selector)).toHaveCount(count)
    for (let index = 0; index < count; index += 1) {
      const surface = await expectContained(page, selector, index)
      expect(rgba(surface.background).alpha).toBe(1)
      expect(surface.backgroundImage).toBe('none')
      expect(surface.color).not.toBe(surface.background)
      if (!forcedColors)
        expect(contrast(surface.color, surface.background)).toBeGreaterThanOrEqual(4.5)
    }
  }
}

async function expectNoSeriousAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).include('.store-photos').analyze()
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  expect(
    serious.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })),
    label,
  ).toEqual([])
}

async function expectPageGeometry(page: Page) {
  const originalX = await page.evaluate(() => window.scrollX)
  await page.evaluate(() => window.scrollTo({ left: 99999 }))
  const reachableX = await page.evaluate(() => window.scrollX)
  await page.evaluate((left) => window.scrollTo({ left }), originalX)
  const geometry = await page.evaluate(() => ({
    body: { scroll: document.body.scrollWidth, client: document.body.clientWidth },
    root: {
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    },
    userVisible: [
      document.body.innerText,
      ...Array.from(document.body.querySelectorAll('*')).flatMap((element) =>
        Array.from(element.attributes)
          .filter(
            (attribute) =>
              attribute.name === 'title' ||
              attribute.name.startsWith('aria-') ||
              attribute.name.startsWith('data-'),
          )
          .map((attribute) => attribute.value),
      ),
    ].join('\n'),
  }))
  expect(reachableX).toBe(0)
  expect(geometry.body.scroll).toBeLessThanOrEqual(geometry.body.client + 1)
  expect(geometry.root.scroll).toBeLessThanOrEqual(geometry.root.client + 1)
  expect(geometry.userVisible).not.toMatch(privateCanary)
}

async function expectUnobscured(page: Page, selector: string) {
  const controls = page.locator(selector)
  const count = await controls.count()
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    await expectContained(page, selector, index)
    const failures = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const points = [[rect.left + rect.width / 2, rect.top + rect.height / 2]]
      return points.flatMap(([x, y]) => {
        const target = document.elementFromPoint(x, y)
        return target !== null && (target === element || element.contains(target))
          ? []
          : [{ x, y, target: target ? `${target.tagName}.${target.className}` : 'null' }]
      })
    })
    expect(failures, `${selector}[${index}] covered hit points`).toEqual([])
  }
}

async function expectNoFixedNavigationIntersection(page: Page, selector: string) {
  const elements = page.locator(selector)
  const count = await elements.count()
  for (let index = 0; index < count; index += 1) {
    await elements
      .nth(index)
      .evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center' }))
    const intersections = await elements.nth(index).evaluate((element) => {
      const fixed = Array.from(document.querySelectorAll('body *')).filter((candidate) => {
        const style = getComputedStyle(candidate)
        return (
          (style.position === 'fixed' || style.position === 'sticky') &&
          !candidate.closest('.store-photos__lightbox') &&
          candidate.getBoundingClientRect().width > 0 &&
          candidate.getBoundingClientRect().height > 0
        )
      })
      const rect = element.getBoundingClientRect()
      return fixed
        .filter((candidate) => {
          if (candidate === element || candidate.contains(element) || element.contains(candidate))
            return false
          const other = candidate.getBoundingClientRect()
          return (
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top
          )
        })
        .map((candidate) => `${element.className} intersects ${candidate.className}`)
    })
    expect(intersections).toEqual([])
  }
}

async function expectLightbox(page: Page, touch: boolean, capturePath?: string) {
  const tile = page.locator('.store-photos__tile:not(:disabled)').first()
  await expect(tile).toBeVisible()
  await expect(tile).toHaveAccessibleName(/View photo \d+:/u)
  if (touch) await tile.tap()
  else await tile.click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.store-photos__background')).toHaveAttribute('inert', '')
  expect(
    await page.locator('.store-photos__back').evaluate((element) => {
      ;(element as HTMLElement).focus()
      return document.activeElement === element
    }),
  ).toBe(false)
  await expect(dialog.getByRole('status')).toHaveText('Photo 2 of 4')
  const controls = [
    dialog.getByRole('button', { name: 'Close enlarged photo' }),
    dialog.getByRole('button', { name: 'Previous photo' }),
    dialog.getByRole('button', { name: 'Next photo' }),
  ]
  for (const control of controls) {
    await expect(control).toBeVisible()
    const measurement = await control.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        width: rect.width,
        height: rect.height,
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor,
      }
    })
    expect(measurement.width).toBeGreaterThanOrEqual(48)
    expect(measurement.height).toBeGreaterThanOrEqual(48)
    expect(rgba(measurement.background).alpha).toBe(1)
    expect(contrast(measurement.color, measurement.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(measurement.border, measurement.background)).toBeGreaterThanOrEqual(3)
  }
  await expectOpaqueSurfaces(page, [
    { selector: '.store-photos__lightbox-caption', count: 1 },
    { selector: '.media-overlay-position', count: 1 },
  ])
  await expectUnobscured(page, '.store-photos__lightbox .media-overlay-control')
  await expectNoFixedNavigationIntersection(
    page,
    '.store-photos__lightbox-caption, .store-photos__lightbox .media-overlay-position, .store-photos__lightbox .media-overlay-control',
  )

  const overlap = await page.evaluate(() => {
    const caption = document.querySelector('.store-photos__lightbox-caption')
    const controls = [...document.querySelectorAll('.media-overlay-control')]
    if (!(caption instanceof HTMLElement)) return false
    const captionRect = caption.getBoundingClientRect()
    return controls.some((control) => {
      const rect = control.getBoundingClientRect()
      return !(
        rect.right <= captionRect.left ||
        rect.left >= captionRect.right ||
        rect.bottom <= captionRect.top ||
        rect.top >= captionRect.bottom
      )
    })
  })
  expect(overlap).toBe(false)
  await controls[1].click()
  await expect(dialog.getByRole('status')).toHaveText('Photo 1 of 4')
  await controls[1].click()
  await expect(dialog.getByRole('status')).toHaveText('Photo 4 of 4')
  await controls[2].click()
  await controls[2].click()
  await controls[2].click()
  await expect(dialog.getByRole('status')).toHaveText('Photo 3 of 4')
  if (capturePath) await page.screenshot({ path: capturePath })
  await controls[0].click()
  await expect(tile).toBeFocused()
  await expect(page.locator('.store-photos__background')).not.toHaveAttribute('inert', '')
}

for (const viewport of viewports) {
  for (const theme of themes) {
    for (const fixture of fixtures) {
      test(`${viewport.name} ${theme} ${fixture} keeps media information readable`, async ({
        browser,
        baseURL,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The explicit context matrix runs once.')
        const context = await contextFor(browser, baseURL, viewport, theme)
        const page = await context.newPage()
        const browserMessages: string[] = []
        page.on('console', (message) => browserMessages.push(message.text()))
        page.on('pageerror', (error) => browserMessages.push(error.message))
        await routeFixture(page, fixture)
        await page.goto('/stores/blue-finch-curios/photos')
        await expect(
          page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' }),
        ).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

        if (fixture === 'unavailable') {
          await expect(page.getByRole('img', { name: 'Photo unavailable' }).first()).toBeVisible()
          await expect(page.getByRole('button', { name: /unavailable/iu }).first()).toBeDisabled()
        } else {
          const tile = page.locator('.store-photos__tile').first()
          await expect(tile.locator('.store-photos__tile-overlay')).toBeVisible()
          await expect(tile).toHaveAccessibleName(
            /View photo 2: Narrow brick-walled shop aisle.+ Caption: The fictional Blue Finch Curios main aisle/u,
          )
          if (!viewport.hasTouch) await tile.hover()
          await tile.focus()
          await expect(tile).toBeFocused()
        }

        await expectOpaqueSurfaces(
          page,
          fixture === 'unavailable'
            ? [
                { selector: '.store-photos__missing', count: 1 },
                { selector: '.store-photos__tile-unavailable', count: 3 },
              ]
            : [
                { selector: '.store-photos__feature-caption', count: 1 },
                { selector: '.store-photos__tile-overlay', count: 3 },
              ],
        )
        await expectPageGeometry(page)
        if (fixture !== 'unavailable') {
          await expectUnobscured(page, '.store-photos__tile')
          await expectNoFixedNavigationIntersection(
            page,
            '.store-photos__feature-caption, .store-photos__tile',
          )
        }
        await expectNoSeriousAxeViolations(page, `${viewport.name} ${theme} ${fixture}`)
        if (shouldCapture)
          await page.screenshot({
            path: `${evidenceRoot}/${viewport.name}-${theme}-${fixture}.png`,
            fullPage: true,
          })
        if (fixture !== 'unavailable')
          await expectLightbox(
            page,
            viewport.hasTouch,
            shouldCapture && theme === 'light' && fixture === 'high-detail'
              ? `${evidenceRoot}/${viewport.name}-lightbox.png`
              : undefined,
          )
        expect(browserMessages.join('\n')).not.toMatch(privateCanary)
        await context.close()
      })
    }
  }
}

for (const viewport of viewports) {
  test(`${viewport.name} forced colors keeps captions, focus, and controls usable`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The explicit context matrix runs once.')
    const context = await contextFor(browser, baseURL, viewport, 'light', 'active')
    const page = await context.newPage()
    await routeFixture(page, 'high-detail')
    await page.goto('/stores/blue-finch-curios/photos')
    await expect
      .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
      .toBe(true)
    const tile = page.locator('.store-photos__tile').first()
    await tile.focus()
    await expect(tile).toHaveCSS('outline-style', 'solid')
    await expectOpaqueSurfaces(
      page,
      [
        { selector: '.store-photos__feature-caption', count: 1 },
        { selector: '.store-photos__tile-overlay', count: 3 },
      ],
      true,
    )
    if (viewport.hasTouch) await tile.tap()
    else await tile.press('Enter')
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Close enlarged photo' })).toBeFocused()
    for (const control of await dialog.locator('.media-overlay-control').all()) {
      await expect(control).toBeVisible()
      await expect(control).toHaveCSS('border-style', 'solid')
      const colors = await control.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          color: style.color,
          background: style.backgroundColor,
          border: style.borderTopColor,
          outline: style.outlineColor,
          width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height,
        }
      })
      expect(colors.color).not.toBe(colors.background)
      expect(colors.border).not.toBe(colors.background)
      expect(colors.width).toBeGreaterThanOrEqual(48)
      expect(colors.height).toBeGreaterThanOrEqual(48)
    }
    await dialog.getByRole('button', { name: 'Close enlarged photo' }).focus()
    const focused = await dialog
      .getByRole('button', { name: 'Close enlarged photo' })
      .evaluate((element) => ({
        outline: getComputedStyle(element).outlineColor,
        background: getComputedStyle(element).backgroundColor,
      }))
    expect(focused.outline).not.toBe(focused.background)
    await expectOpaqueSurfaces(
      page,
      [
        { selector: '.store-photos__lightbox-caption', count: 1 },
        { selector: '.media-overlay-position', count: 1 },
      ],
      true,
    )
    await expectUnobscured(page, '.store-photos__lightbox .media-overlay-control')
    await expectNoSeriousAxeViolations(page, `${viewport.name} forced colors`)
    if (shouldCapture)
      await page.screenshot({ path: `${evidenceRoot}/${viewport.name}-forced-colors.png` })
    await context.close()
  })
}

test('forced colors keeps unavailable media named and discernible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One focused unavailable-state run is sufficient.')
  await page.setViewportSize({ width: 320, height: 900 })
  await page.emulateMedia({ forcedColors: 'active' })
  await routeFixture(page, 'unavailable')
  await page.goto('/stores/blue-finch-curios/photos')
  await expect(page.getByRole('img', { name: 'Photo unavailable' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /unavailable/iu }).first()).toBeDisabled()
  await expectOpaqueSurfaces(
    page,
    [
      { selector: '.store-photos__missing', count: 1 },
      { selector: '.store-photos__tile-unavailable', count: 3 },
    ],
    true,
  )
  await expectNoFixedNavigationIntersection(
    page,
    '.store-photos__missing, .store-photos__tile-unavailable',
  )
})

test('Store Details consumes the shared forced-colors modal contract', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One focused adjacent-consumer run is sufficient.')
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.emulateMedia({ forcedColors: 'active' })
  await routeFixture(page, 'high-detail')
  await page.goto('/stores/blue-finch-curios')

  const opener = page.locator('.store-gallery__enlarge')
  await expect(opener).toBeVisible()
  await opener.click()
  const dialog = page.locator('.store-gallery__room')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close enlarged image' })).toBeFocused()
  await expect(page.locator('.store-gallery__background')).toHaveAttribute('inert', '')
  const backgroundFocusBlocked = await page
    .locator('.store-gallery__print')
    .first()
    .evaluate((element) => {
      ;(element as HTMLElement).focus()
      return document.activeElement !== element
    })
  expect(backgroundFocusBlocked).toBe(true)
  await expectOpaqueSurfaces(
    page,
    [
      { selector: '.store-gallery__room-caption', count: 1 },
      { selector: '.store-gallery__room > .media-overlay-position', count: 1 },
    ],
    true,
  )
  await expect(dialog.locator('.media-overlay-control')).toHaveCount(3)
  for (const control of await dialog.locator('.media-overlay-control').all()) {
    const measurement = await control.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        width: rect.width,
        height: rect.height,
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor,
      }
    })
    expect(measurement.width).toBeGreaterThanOrEqual(48)
    expect(measurement.height).toBeGreaterThanOrEqual(48)
    expect(measurement.color).not.toBe(measurement.background)
    expect(measurement.border).not.toBe(measurement.background)
  }
  const close = dialog.getByRole('button', { name: 'Close enlarged image' })
  await close.focus()
  const focused = await close.evaluate((element) => ({
    outline: getComputedStyle(element).outlineColor,
    background: getComputedStyle(element).backgroundColor,
  }))
  expect(focused.outline).not.toBe(focused.background)
  await expectUnobscured(page, '.store-gallery__room .media-overlay-control')
  await expectNoFixedNavigationIntersection(
    page,
    '.store-gallery__room-caption, .store-gallery__room > .media-overlay-position, .store-gallery__room .media-overlay-control',
  )
  await expect(dialog.getByRole('status')).toHaveText('Photo 1 of 4')
  await dialog.getByRole('button', { name: 'Previous photo' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Photo 4 of 4')
  await dialog.getByRole('button', { name: 'Next photo' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Photo 1 of 4')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  await expect(page.locator('.store-gallery__background')).not.toHaveAttribute('inert', '')
})

test('delayed decode, keyboard flow, and reduced motion preserve the solid contract', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One deterministic interaction run is sufficient.')
  let releaseImages = () => {}
  const imageGate = new Promise<void>((resolve) => {
    releaseImages = resolve
  })
  await page.route(/\/synthetic-stores\/.*\.webp(?:\?.*)?$/u, async (route) => {
    await imageGate
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: fixtureSvg('high-detail'),
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/stores/blue-finch-curios/photos', { waitUntil: 'domcontentloaded' })
  const tile = page.locator('.store-photos__tile').first()
  await expect(tile.locator('.store-photos__tile-overlay')).toBeVisible()
  await expectOpaqueSurfaces(page, [
    { selector: '.store-photos__feature-caption', count: 1 },
    { selector: '.store-photos__tile-overlay', count: 3 },
  ])
  expect(
    await tile.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
  ).toBeLessThanOrEqual(0.00001)
  releaseImages()
  await tile.focus()
  await tile.press('Enter')
  const dialog = page.getByRole('dialog')
  const close = dialog.getByRole('button', { name: 'Close enlarged photo' })
  const previous = dialog.getByRole('button', { name: 'Previous photo' })
  const next = dialog.getByRole('button', { name: 'Next photo' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(previous).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(next).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tile).toBeFocused()
})

test('WCAG text spacing and unbroken copy remain contained at 320px', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One deterministic geometry run is sufficient.')
  await page.setViewportSize({ width: 320, height: 900 })
  await routeFixture(page, 'near-white')
  await page.goto('/stores/blue-finch-curios/photos')
  const tile = page.locator('.store-photos__tile').first()
  await tile.locator('.store-photos__tile-caption').evaluate((element) => {
    element.textContent =
      'A-deliberately-long-public-caption-without-natural-breaks-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  })
  await page.addStyleTag({
    content: `
      .store-photos { line-height: 1.5 !important; }
      .store-photos * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      .store-photos p { margin-bottom: 2em !important; }
    `,
  })
  await expectOpaqueSurfaces(page, [
    { selector: '.store-photos__feature-caption', count: 1 },
    { selector: '.store-photos__tile-overlay', count: 3 },
  ])
  await expectUnobscured(page, '.store-photos__tile')
  await expectPageGeometry(page)
  await expectLightbox(
    page,
    false,
    shouldCapture ? `${evidenceRoot}/mobile-320-text-spacing-lightbox.png` : undefined,
  )
})
