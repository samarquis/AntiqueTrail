import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.map(Number)
    if (!channels || channels.length < 3)
      throw new Error(`Expected a computed RGB color, received ${color}`)
    const [red, green, blue] = [channels[0]!, channels[1]!, channels[2]!]
    const linear = (value: number) => {
      const normalized = value / 255
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  }

  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

async function tabTo(page: Page, target: Locator) {
  for (
    let index = 0;
    index < 40 && !(await target.evaluate((element) => element === document.activeElement));
    index += 1
  )
    await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

async function expectMobileNavigationFits(page: Page) {
  await expect
    .poll(() =>
      page.locator('.site-header nav').evaluate((nav) => {
        const bounds = nav.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth
      }),
    )
    .toBe(true)
}

async function expectForcedColorsContrast(scope: Locator, focusTarget: Locator) {
  const evidence = await scope.evaluate((root) => {
    const systemProbe = document.createElement('span')
    systemProbe.style.cssText =
      'position:fixed;left:-10000px;color:CanvasText;background-color:Canvas'
    document.body.append(systemProbe)
    const systemStyle = getComputedStyle(systemProbe)
    const systemColors = {
      text: systemStyle.color,
      canvas: systemStyle.backgroundColor,
    }
    systemProbe.remove()

    const isTransparent = (color: string) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent'
    const visible = (element: Element) => {
      const style = getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.getClientRects().length > 0
      )
    }
    const text = [root, ...root.querySelectorAll('*')].filter(visible).flatMap((element) => {
      const hasText = Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
      )
      const isFormControl = element.matches('input, select, textarea, button')
      if (!hasText && !isFormControl) return []

      const style = getComputedStyle(element)
      let surface: Element | null = element
      let background = systemColors.canvas
      while (surface) {
        const surfaceStyle = getComputedStyle(surface)
        if (!isTransparent(surfaceStyle.backgroundColor)) {
          background = surfaceStyle.backgroundColor
          break
        }
        surface = surface.parentElement
      }
      return [{ foreground: style.color, background }]
    })

    return { systemColors, text }
  })
  const focus = await focusTarget.evaluate((element) => {
    const style = getComputedStyle(element)
    let surface: Element | null = element
    let background = 'transparent'
    while (surface) {
      const surfaceStyle = getComputedStyle(surface)
      if (
        surfaceStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        surfaceStyle.backgroundColor !== 'transparent'
      ) {
        background = surfaceStyle.backgroundColor
        break
      }
      surface = surface.parentElement
    }
    return {
      focused: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      background,
    }
  })

  expect(evidence.text.length).toBeGreaterThan(0)
  expect(
    contrastRatio(evidence.systemColors.text, evidence.systemColors.canvas),
  ).toBeGreaterThanOrEqual(4.5)
  for (const sample of evidence.text)
    expect(contrastRatio(sample.foreground, sample.background)).toBeGreaterThanOrEqual(4.5)
  expect(focus.focused).toBe(true)
  expect(focus.focusVisible).toBe(true)
  expect(focus.outlineStyle).not.toBe('none')
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThan(0)
  expect(contrastRatio(focus.outlineColor, focus.background)).toBeGreaterThanOrEqual(3)
}

test('Help and Store Details expose correction drafts without implying submission', async ({
  page,
}) => {
  await page.goto('/help')
  await expect(page.getByRole('heading', { name: 'Correct store information' })).toBeVisible()
  await expect(
    page.getByText(
      /correction drafts are available during this public-test stage, but you cannot submit them/i,
    ),
  ).toBeVisible()

  const accessibility = await new AxeBuilder({ page }).include('main').analyze()
  expect(accessibility.violations).toEqual([])

  await page.goto('/stores/blue-finch-curios')
  await expect(page.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  const draftLink = page.getByRole('link', { name: 'Draft a correction' })
  await expect(draftLink).toHaveAttribute('href', '/stores/blue-finch-curios/correction')
  await expect(page.getByText(/drafts are available.*submission is unavailable/i)).toBeVisible()

  const detailsAccessibility = await new AxeBuilder({ page })
    .include('.catalog-private-actions')
    .analyze()
  expect(detailsAccessibility.violations).toEqual([])

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(draftLink).toBeVisible()
  const darkAccessibility = await new AxeBuilder({ page })
    .include('.catalog-private-actions')
    .analyze()
  expect(darkAccessibility.violations).toEqual([])

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await expect(draftLink).toBeVisible()
  const reducedMotion = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const forcedColors = await page.evaluate(() => matchMedia('(forced-colors: active)').matches)
  expect({ reducedMotion, forcedColors }).toEqual({ reducedMotion: true, forcedColors: true })
  // Axe 4.13.0 can read stale -webkit-text-fill-color in forced colors (axe-core#3978).
  // Verify system-mapped text and focus contrast above; keep every other Axe rule active.
  const forcedColorsAccessibility = await new AxeBuilder({ page })
    .include('.catalog-private-actions')
    .disableRules('color-contrast')
    .analyze()
  expect(forcedColorsAccessibility.violations).toEqual([])

  // Narrow viewport simulates reflow at 200% zoom; browser-chrome zoom is not emulated here.
  await page.setViewportSize({ width: 640, height: 900 })
  await page.addStyleTag({
    content:
      '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
  })
  await expectMobileNavigationFits(page)
  await expect(draftLink).toBeVisible()
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(horizontalOverflow).toBe(false)

  await tabTo(page, draftLink)
  await expectForcedColorsContrast(page.locator('.catalog-private-actions'), draftLink)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/stores/blue-finch-curios/correction')
  await expect(page.getByRole('heading', { name: 'Suggest a correction' })).toBeFocused()
})

test('direct correction route saves a local draft, denies form submission, and returns to the store', async ({
  page,
}) => {
  const correctionRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/correction-submit'))
      correctionRequests.push(request.url())
  })

  await page.goto('/stores/blue-finch-curios/correction')
  await expect(page.getByRole('heading', { name: 'Suggest a correction' })).toBeVisible()
  await expect(
    page.getByText(/prepare a correction draft.*submission is unavailable.*browser tab/i),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in to submit/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /submit correction/i })).toHaveCount(0)

  const category = page.getByLabel('What needs correction?')
  const description = page.getByLabel('Description')
  await category.focus()
  await page.keyboard.press('Tab')
  await expect(description).toBeFocused()
  await page.keyboard.type('Weekend hours have changed')
  await page.getByLabel('Public source URL (optional)').fill('https://example.com/hours')

  const savedDraft = await page.evaluate(() =>
    sessionStorage.getItem('antique-trail:correction-draft:blue-finch-curios'),
  )
  expect(savedDraft).not.toBeNull()
  expect(JSON.parse(savedDraft!)).toMatchObject({
    description: 'Weekend hours have changed',
    publicSourceUrl: 'https://example.com/hours',
  })

  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit())
  expect(correctionRequests).toEqual([])
  await page.reload()
  await expect(page.getByLabel('Description')).toHaveValue('Weekend hours have changed')

  const accessibility = await new AxeBuilder({ page }).include('main').analyze()
  expect(accessibility.violations).toEqual([])

  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const darkPageAccessibility = await new AxeBuilder({ page }).include('main').analyze()
  expect(darkPageAccessibility.violations).toEqual([])

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  const formModeMedia = await page.evaluate(() => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    forcedColors: matchMedia('(forced-colors: active)').matches,
  }))
  expect(formModeMedia).toEqual({ reducedMotion: true, forcedColors: true })
  const cancelLink = page.getByRole('link', { name: 'Cancel and return to this store' })
  const forcedColorsPageAccessibility = await new AxeBuilder({ page })
    .include('main')
    // Keep all checks except the axe-core 4.13.0 forced-colors contrast false positive.
    .disableRules('color-contrast')
    .analyze()
  expect(forcedColorsPageAccessibility.violations).toEqual([])

  // Narrow viewport simulates reflow at 200% zoom; browser-chrome zoom is not emulated here.
  await page.setViewportSize({ width: 640, height: 900 })
  await page.addStyleTag({
    content:
      '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
  })
  await expectMobileNavigationFits(page)
  await expect(page.locator('form')).toBeVisible()
  await expect(page.getByLabel('Description')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Cancel and return to this store' })).toBeVisible()
  const formHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(formHorizontalOverflow).toBe(false)

  await tabTo(page, cancelLink)
  await expectForcedColorsContrast(page.locator('main'), cancelLink)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
  await expect(page.getByRole('heading', { name: /blue finch curios/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /blue finch curios/i })).toBeFocused()
  await page.getByRole('link', { name: 'Draft a correction' }).click()
  await expect(page.getByLabel('Description')).toHaveValue('Weekend hours have changed')
  expect(correctionRequests).toEqual([])
})
