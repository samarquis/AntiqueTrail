import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const theme of ['light', 'dark'] as const) {
  test(`category metadata meets AA on Browse and Details in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((chosen) => localStorage.setItem('at-theme', chosen), theme)
    for (const route of ['/stores/blue-finch-curios', '/stores']) {
      await page.goto(route)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const categories = page.locator('.catalog-card__categories li')
      await expect(categories.first()).toBeVisible()
      if (route === '/stores') await expect(page.locator('.catalog-card')).toHaveCount(12)
      else await expect(categories).toContainText(['Antique mall'])
      const scan = await new AxeBuilder({ page }).include('main').analyze()
      expect(scan.violations, `${route} full-main accessibility`).toEqual([])
      const colors = await categories.first().evaluate((element) => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--muted)'
        element.append(probe)
        const token = getComputedStyle(probe).color
        probe.remove()
        return { foreground: getComputedStyle(element).color, token }
      })
      expect(colors.foreground).toBe(colors.token)
    }
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/stores/blue-finch-curios')
    await expect(
      page.getByRole('heading', { name: 'Blue Finch Curios', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1)
    await page.emulateMedia({ forcedColors: 'active' })
    const category = page.locator('.catalog-card__categories li').first()
    const forced = await category.evaluate((element) => {
      const style = getComputedStyle(element)
      const probe = document.createElement('span')
      probe.style.cssText = 'color:CanvasText;background:Canvas'
      element.append(probe)
      const system = getComputedStyle(probe)
      const result = {
        foreground: style.color,
        background: style.backgroundColor,
        canvasText: system.color,
        canvas: system.backgroundColor,
      }
      probe.remove()
      return result
    })
    expect(forced.foreground).toBe(forced.canvasText)
    expect(forced.background).toBe(forced.canvas)
    expect(forced.foreground).not.toBe(forced.background)
  })
}
