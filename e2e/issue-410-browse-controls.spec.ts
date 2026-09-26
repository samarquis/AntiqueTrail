import { expect, test, type Locator, type Page } from '@playwright/test'

type Theme = 'light' | 'dark'

const cases = [
  { theme: 'light', width: 320 },
  { theme: 'light', width: 1280 },
  { theme: 'dark', width: 320 },
  { theme: 'dark', width: 1280 },
] as const satisfies ReadonlyArray<{ theme: Theme; width: number }>

const expectedColors = {
  light: {
    primary: { foreground: 'rgb(255, 253, 252)', background: 'rgb(76, 98, 138)' },
    disabled: { foreground: 'rgb(93, 104, 118)', background: 'rgb(226, 231, 240)' },
    location: 'rgb(93, 104, 118)',
  },
  dark: {
    primary: { foreground: 'rgb(243, 238, 228)', background: 'rgb(37, 43, 51)' },
    disabled: { foreground: 'rgb(183, 176, 165)', background: 'rgb(26, 31, 38)' },
    location: 'rgb(183, 176, 165)',
  },
} as const

async function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    const channels = (value: string) => value.match(/\d+/gu)!.slice(0, 3).map(Number)
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
      foreground: style.color,
      background: style.backgroundColor,
      ratio: (lighter + 0.05) / (darker + 0.05),
    }
  })
}

async function openFilters(page: Page) {
  const trigger = page.getByRole('button', { name: /^filters(?: · active)?$/iu })
  if (await trigger.isVisible()) await trigger.click()
}

for (const { theme, width } of cases) {
  test(`${theme} Browse controls remain readable and operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript((savedTheme) => localStorage.setItem('at-theme', savedTheme), theme)
    await page.goto('/stores')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('heading', { level: 1, name: /browse stores/iu })).toBeVisible()

    const searchField = page.getByLabel('Search stores')
    const searchButton = page.getByRole('button', { name: 'Search', exact: true })
    await expect(searchField).toBeVisible()
    await expect(searchButton).toBeVisible()

    await openFilters(page)
    const applyButton = page.getByRole('button', { name: 'Apply filters' })
    const clearButton = page.getByRole('button', { name: 'Clear filters' })
    await expect(applyButton).toBeVisible()
    await expect(clearButton).toBeVisible()

    for (const [control, expected] of [
      [searchButton, expectedColors[theme].primary],
      [applyButton, expectedColors[theme].primary],
      [clearButton, expectedColors[theme].disabled],
    ] as const) {
      const colors = await contrastRatio(control)
      expect(colors).toMatchObject(expected)
      expect(colors.ratio, JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5)
    }

    const location = page.locator('.catalog-card__area').first()
    await expect(location).toBeVisible()
    const locationColors = await location.evaluate((element) => {
      const root = getComputedStyle(document.documentElement)
      return {
        foreground: getComputedStyle(element).color,
        neutral: root.getPropertyValue('--muted').trim(),
        danger: root.getPropertyValue('--rust').trim(),
      }
    })
    expect(locationColors.foreground).not.toBe(locationColors.danger)
    await expect(location).toHaveCSS('color', expectedColors[theme].location)

    await searchField.fill('Blue Finch')
    await searchField.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Blue Finch Curios' })).toBeVisible()
    await expect(page.locator('.catalog-card')).toHaveCount(1)

    await openFilters(page)
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.locator('.catalog-card')).toHaveCount(12)

    await openFilters(page)
    await page.getByLabel('Category').selectOption('vintage')
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page.locator('.catalog-card')).toHaveCount(6)
    await expect(page.getByRole('heading', { level: 2, name: 'Cedar & Brass' })).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Blue Finch Curios' }),
    ).not.toBeVisible()
  })
}
