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
