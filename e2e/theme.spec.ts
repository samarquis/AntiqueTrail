import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Theme behavior contract: index.html sets data-theme before first paint from
// the saved switcher choice, falling back to the system preference; the
// in-app toggle overrides and persists. See DESIGN_SYSTEM.md dark tokens and
// the #110/#112 acceptance criteria.

test('follows the system color scheme when no choice is saved', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/stores')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('manual toggle persists across reloads and beats the system preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/stores')

  const toggle = page.getByRole('button', { name: 'Switch to dark theme' })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

const DARK_JOURNEYS = [
  { path: '/stores', name: 'Browse' },
  { path: '/stores/blue-finch-curios', name: 'Store Details' },
  { path: '/stores/blue-finch-curios/photos', name: 'Photo gallery' },
  { path: '/more', name: 'More menu' },
] as const

const SEMANTIC_ROLE_SURFACES = [
  { id: 'public-listing', path: '/stores?reviewAs=anonymous&reviewState=success' },
  { id: 'shopper-saved', path: '/saved?reviewAs=shopper-a&reviewState=success' },
  { id: 'shopper-trip', path: '/trips?reviewAs=shopper-a&reviewState=success' },
  { id: 'portal', path: '/store-portal?reviewAs=representative&reviewState=success' },
  { id: 'partner', path: '/partner/status?reviewAs=representative&reviewState=success' },
  { id: 'administrator', path: '/admin?reviewAs=administrator&reviewState=success' },
  { id: 'error-state', path: '/stores?reviewAs=anonymous&reviewState=error' },
] as const

const APPROVED_THEME_TOKENS = {
  light: {
    ink: '#202833',
    muted: '#5d6876',
    paper: '#f6f4f0',
    card: '#fffdfc',
    line: '#d8dce2',
    action: '#4c628a',
    link: '#344a70',
    selected: '#e2e7f0',
    danger: '#a75e4d',
    warning: '#b98b45',
    context: '#68758a',
    focusInner: '#fffdfc',
    focusOuter: '#202833',
  },
  dark: {
    ink: '#f3eee4',
    muted: '#b7b0a5',
    paper: '#121519',
    card: '#252b33',
    line: '#3b4552',
    action: '#8795b5',
    link: '#8795b5',
    selected: '#1a1f26',
    danger: '#b56e5b',
    warning: '#b99554',
    context: '#b7b0a5',
    focusInner: '#121519',
    focusOuter: '#f3eee4',
  },
} as const

for (const theme of ['light', 'dark'] as const) {
  for (const surface of SEMANTIC_ROLE_SURFACES) {
    test(`${surface.id} retains approved semantic colors in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
      await page.goto(surface.path)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .not.toBe('rgba(0, 0, 0, 0)')

      const tokens = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        return {
          ink: style.getPropertyValue('--ink').trim(),
          muted: style.getPropertyValue('--muted').trim(),
          paper: style.getPropertyValue('--paper').trim(),
          card: style.getPropertyValue('--card').trim(),
          line: style.getPropertyValue('--line').trim(),
          action: style.getPropertyValue('--teal').trim(),
          link: style.getPropertyValue('--teal-dark').trim(),
          selected: style.getPropertyValue('--mint').trim(),
          danger: style.getPropertyValue('--rust').trim(),
          warning: style.getPropertyValue('--gold').trim(),
          context: style.getPropertyValue('--olive').trim(),
          focusInner: style.getPropertyValue('--focus-inner').trim(),
          focusOuter: style.getPropertyValue('--focus-outer').trim(),
          bodyColor: getComputedStyle(document.body).color,
          bodySurface: getComputedStyle(document.body).backgroundColor,
        }
      })
      expect(tokens).toMatchObject(APPROVED_THEME_TOKENS[theme])
      expect(tokens.bodyColor, `${surface.id} body uses --ink`).not.toBe(tokens.bodySurface)

      if (process.env.CAPTURE_ISSUE_142_EVIDENCE && testInfo.project.name === 'desktop') {
        await page.screenshot({
          path: `docs/evidence/issue-142/rendered/${theme}-${surface.id}.png`,
          fullPage: true,
        })
      }
    })
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} stale status retains contrast and a non-color honesty companion`, async ({
    page,
  }) => {
    await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
    await page.goto('/stores/cedar-brass?reviewAs=anonymous&reviewState=success')
    const status = page.locator('.status-badge--stale')
    await expect(status).toBeVisible()
    await expect(status).toContainText('Listing details need review')
    await expect(
      page.getByText('This listing may be out of date. Confirm before travel.', { exact: true }),
    ).toBeVisible()
    const measurement = await status.evaluate((element) => {
      const style = getComputedStyle(element)
      const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number)
      const luminance = (value: string) => {
        const [red, green, blue] = channels(value).map((channel) => {
          const normalized = channel / 255
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
      }
      const [lighter, darker] = [luminance(style.color), luminance(style.backgroundColor)].sort(
        (first, second) => second - first,
      )
      return {
        contrast: (lighter + 0.05) / (darker + 0.05),
        border: style.borderTopColor,
        background: style.backgroundColor,
      }
    })
    expect(measurement.contrast).toBeGreaterThanOrEqual(4.5)
    expect(measurement.border).not.toBe(measurement.background)
  })

  test(`${theme} error summary retains contrast and a visible boundary`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('at-theme', value), theme)
    await page.goto('/auth/mfa')
    const summary = page.locator('.error-summary')
    await expect(summary).toHaveAttribute('role', 'alert')
    await expect(summary.getByRole('heading')).toBeVisible()
    const measurement = await summary.evaluate((element) => {
      const style = getComputedStyle(element)
      const heading = element.querySelector('h2')!
      const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number)
      const luminance = (value: string) => {
        const [red, green, blue] = channels(value).map((channel) => {
          const normalized = channel / 255
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue
      }
      const [lighter, darker] = [
        luminance(getComputedStyle(heading).color),
        luminance(style.backgroundColor),
      ].sort((first, second) => second - first)
      return {
        contrast: (lighter + 0.05) / (darker + 0.05),
        border: style.borderTopColor,
        background: style.backgroundColor,
      }
    })
    expect(measurement.contrast).toBeGreaterThanOrEqual(4.5)
    expect(measurement.border).not.toBe(measurement.background)
  })
}

for (const journey of DARK_JOURNEYS) {
  test(`${journey.name} renders a themed surface that differs from light`, async ({ page }) => {
    await page.goto(journey.path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Cold-transform can serve before stylesheets apply; wait for real paint.
    const readSurface = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await expect.poll(readSurface, { timeout: 15_000 }).not.toBe('rgba(0, 0, 0, 0)')
    const lightSurface = await readSurface()

    await page.evaluate(() => window.localStorage.setItem('at-theme', 'dark'))
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const darkSurface = await readSurface()
    expect(darkSurface, `${journey.name} dark body surface`).not.toBe(lightSurface)
  })
}

test('dark journeys pass axe contrast and a11y rules', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  for (const journey of DARK_JOURNEYS) {
    await page.goto(journey.path)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(
      serious.map((v) => ({ id: v.id, nodes: v.nodes.length })),
      `${journey.name} dark-mode critical/serious violations`,
    ).toEqual([])
  }
})

test('shared form controls retain semantic contrast, keyboard focus, and forced-colors boundaries', async ({
  page,
}) => {
  await page.goto('/stores')
  const search = page.getByLabel('Search stores')
  await expect(search).toBeVisible()
  await expect(search).toHaveCSS('min-height', '48px')
  await search.focus()
  await expect(search).toBeFocused()
  await expect(search).toHaveCSS('border-color', 'rgb(52, 74, 112)')
  await expect
    .poll(() => search.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe('none')

  await page.evaluate(() => window.localStorage.setItem('at-theme', 'dark'))
  await page.reload()
  const darkSearch = page.getByLabel('Search stores')
  await expect(darkSearch).toHaveCSS('border-color', 'rgb(135, 149, 181)')
  await expect
    .poll(() => darkSearch.evaluate((element) => getComputedStyle(element, '::placeholder').color))
    .toBe('rgb(183, 176, 165)')

  await page.emulateMedia({ forcedColors: 'active' })
  await page.reload()
  const forcedSearch = page.getByLabel('Search stores')
  await expect
    .poll(() => page.evaluate(() => matchMedia('(forced-colors: active)').matches))
    .toBe(true)
  await expect(forcedSearch).toHaveCSS('border-style', 'solid')
  await forcedSearch.focus()
  await expect(forcedSearch).toHaveCSS('outline-style', 'solid')
})
