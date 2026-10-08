import { expect, test, type Locator } from '@playwright/test'

declare global {
  interface Window {
    __publicSharePayload?: { title?: string; url?: string }
  }
}

async function expectTouchTarget(control: Locator) {
  const bounds = await control.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThanOrEqual(48)
  expect(bounds!.height).toBeGreaterThanOrEqual(48)
}

test.describe('public Store Details sharing', () => {
  test('shares a safe same-store URL to an anonymous recipient with keyboard and theme support', async ({
    page,
    browser,
  }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload: { title?: string; url?: string }) => {
          window.__publicSharePayload = payload
        },
      })
    })

    const entryUrl = '/stores/blue-finch-curios?accountId=private-canary#trip-private'
    await page.goto(entryUrl)
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Add to Trip/u })).toBeVisible()

    const shareButton = page.getByRole('button', { name: 'Share store' })
    await expect(shareButton).toBeVisible()
    await expectTouchTarget(shareButton)

    const themeColors: string[] = []
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      themeColors.push(await shareButton.evaluate((element) => getComputedStyle(element).color))
      await page.screenshot({ path: testInfo.outputPath(`share-${theme}.png`) })
    }
    expect(themeColors[0]).not.toBe(themeColors[1])

    const originalUrl = page.url()
    await shareButton.focus()
    await expect(shareButton).toBeFocused()
    await page.keyboard.press('Enter')

    const payload = await page.evaluate(() => window.__publicSharePayload)
    expect(payload).toEqual({
      title: 'Blue Finch Curios',
      url: new URL('/stores/blue-finch-curios', originalUrl).href,
    })
    expect(page.url()).toBe(originalUrl)
    expect(payload?.url).not.toMatch(/[?#]/u)

    const recipientContext = await browser.newContext()
    try {
      const recipient = await recipientContext.newPage()
      await recipient.goto(payload!.url!)
      await expect(recipient).toHaveURL(payload!.url!)
      await expect(
        recipient.getByRole('heading', { level: 1, name: 'Blue Finch Curios' }),
      ).toBeVisible()
    } finally {
      await recipientContext.close()
    }
  })

  test('keeps Details open and exposes a selectable link after clipboard denial', async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw new Error('share unavailable')
        },
      })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('clipboard denied')
          },
        },
      })
    })

    const entryUrl = '/stores/blue-finch-curios?accountId=private-canary#trip-private'
    await page.goto(entryUrl)
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
    const originalUrl = page.url()

    const shareButton = page.getByRole('button', { name: 'Share store' })
    await expectTouchTarget(shareButton)
    await shareButton.click()
    await expect(page.getByRole('alert')).toHaveText(/sharing failed/i)

    const copyButton = page.getByRole('button', { name: 'Copy link' })
    await expectTouchTarget(copyButton)
    await copyButton.click()

    await expect(page.getByRole('alert')).toHaveText(/clipboard access is unavailable/i)
    const publicLink = page.getByRole('textbox', { name: 'Public store link' })
    await expect(publicLink).toHaveValue(new URL('/stores/blue-finch-curios', page.url()).href)
    await expect(publicLink).toHaveAttribute('readonly')
    await expectTouchTarget(publicLink)
    expect(page.url()).toBe(originalUrl)

    await publicLink.focus()
    const selection = await publicLink.evaluate((element: HTMLInputElement) => ({
      start: element.selectionStart,
      end: element.selectionEnd,
      length: element.value.length,
    }))
    expect(selection).toEqual({ start: 0, end: selection.length, length: selection.length })

    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
      await page.screenshot({ path: testInfo.outputPath(`copy-denied-${theme}.png`) })
    }
  })

  test('does not offer a stale share action for a missing store', async ({ page }) => {
    await page.goto('/stores/issue-564-missing-store')
    await expect(page.getByRole('heading', { name: 'Store not found' })).toBeVisible()
    await expect(page.getByRole('button', { name: /share store|copy link/i })).toHaveCount(0)
  })
})
