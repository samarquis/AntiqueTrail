import { resolve } from 'node:path'
import { chromium, expect, test, type Page } from '@playwright/test'

async function expectPublicTestNavigation(page: Page, viewportWidth: number) {
  const primary = page.getByRole('navigation', { name: 'Primary navigation' })
  const links = primary.getByRole('link')
  await expect(links).toHaveCount(3)
  await expect(primary.getByRole('link', { name: 'Browse', exact: true })).toHaveAttribute(
    'href',
    '/stores',
  )
  await expect(primary.getByRole('link', { name: /saved stores/i })).toHaveAttribute(
    'href',
    '/saved',
  )
  await expect(primary.getByRole('link', { name: 'More', exact: true })).toHaveAttribute(
    'href',
    '/more',
  )
  await expect(primary.getByRole('link', { name: /trip|create account/i })).toHaveCount(0)

  const geometry = await links.evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        fontSize: Number.parseFloat(getComputedStyle(item).fontSize),
        clipped: item.scrollWidth > item.clientWidth || item.scrollHeight > item.clientHeight,
      }
    }),
  )
  expect(geometry.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true)
  expect(geometry.every(({ fontSize }) => fontSize >= 16)).toBe(true)
  expect(geometry.every(({ clipped }) => !clipped)).toBe(true)
  expect(geometry.every(({ left, right }) => left >= 0 && right <= viewportWidth)).toBe(true)
  expect(geometry[0].right).toBeLessThanOrEqual(geometry[1].left)
  expect(geometry[1].right).toBeLessThanOrEqual(geometry[2].left)
}

test('anonymous and signed-in public-test shells keep three fitted destinations', async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 1440, height: 1000 },
  ]) {
    for (const identity of ['anonymous', 'shopper-a']) {
      await page.setViewportSize(viewport)
      await page.goto(`/stores?reviewAs=${identity}&reviewState=success`)
      await expectPublicTestNavigation(page, viewport.width)
    }
  }
})

test('public-test navigation fits an actual 320px CSS viewport at 200% browser zoom', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium')
  test.skip(
    testInfo.project.name !== 'chromium',
    'Issue-specific config owns one actual browser-zoom proof.',
  )
  const extension = resolve('e2e/fixtures/issue-131-zoom')
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    timeout: 30_000,
    viewport: { width: 640, height: 800 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }))
    const page = await context.newPage()
    await page.goto(`${testInfo.project.use.baseURL}/stores?reviewAs=anonymous&reviewState=success`)
    expect(
      await worker.evaluate(`(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.setZoom(tab.id, 2);
        return chrome.tabs.getZoom(tab.id);
      })()`),
    ).toBe(2)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(320)

    for (const identity of ['anonymous', 'shopper-a']) {
      await page.goto(
        `${testInfo.project.use.baseURL}/stores?reviewAs=${identity}&reviewState=success`,
      )
      await expectPublicTestNavigation(page, 320)
    }
  } finally {
    await context.close()
  }
})
