import { expect, test, type Locator, type Page } from '@playwright/test'

const EXPECTED_SHOPPER_NAV = [
  { name: 'Browse', path: '/stores' },
  { name: 'My Trip', path: '/trips' },
  { name: 'More', path: '/more' },
] as const

async function expectExactPath(locator: Locator, path: string) {
  const href = await locator.getAttribute('href')
  expect(new URL(href ?? '', 'http://antique-trail.test').pathname).toBe(path)
}

async function expectMinimumTargets(page: Page) {
  const undersized = await page
    .locator('a, button, input, select, textarea, [role="button"]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (!(element instanceof HTMLElement) || element.hidden) return []
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return []

        const target =
          element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)
            ? (element.closest('label') ?? element)
            : element
        const rect = target.getBoundingClientRect()
        if (!rect.width || !rect.height || (rect.width >= 48 && rect.height >= 48)) return []

        return [
          {
            element: element.outerHTML.slice(0, 180),
            height: Math.round(rect.height * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
          },
        ]
      }),
    )

  expect(undersized, `Interactive targets smaller than 48 x 48 CSS pixels`).toEqual([])
}

test.describe('Synthetic catalog design contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stores')
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible()
    await expect(page.locator('.catalog-card').first()).toBeVisible()
  })

  test('uses the approved shopper navigation and route focus behavior', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary navigation' })
    await expect(nav).toBeVisible()

    for (const destination of EXPECTED_SHOPPER_NAV) {
      const link = nav.getByRole('link', { name: destination.name, exact: true })
      await expect(link).toBeVisible()
      await expectExactPath(link, destination.path)
    }
    await expect(nav.getByText('Saved', { exact: true })).toHaveCount(0)
    await expect(nav.getByText('New since', { exact: true })).toHaveCount(0)

    await nav.getByRole('link', { name: 'More', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeFocused()

    const moreDestinations = [
      ['Saved Stores', '/saved'],
      ['Add a Place from a Link', '/capture'],
      ['Shared with Me', '/shares'],
      ['Trip Ideas', '/trip-ideas'],
      ['Account & Privacy', '/account/privacy'],
      ['Install', '/install'],
      ['Help', '/help'],
    ] as const
    for (const [name, path] of moreDestinations) {
      const link = page.getByRole('link', { name, exact: true })
      await expect(link).toBeVisible()
      await expectExactPath(link, path)
    }

    await nav.getByRole('link', { name: 'My Trip', exact: true }).click()
    const tripEntryHeading = page.getByRole('heading', { level: 1 })
    await expect(tripEntryHeading).toBeVisible()
    await expect(tripEntryHeading).toBeFocused()

    await nav.getByRole('link', { name: 'Browse', exact: true }).click()
    const browseHeading = page.getByRole('heading', { level: 1, name: 'Browse stores' })
    await expect(browseHeading).toBeFocused()
  })

  test('provides a keyboard skip link to the single main landmark', async ({ page }) => {
    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeFocused()
    for (let step = 0; step < 5; step += 1) await page.keyboard.press('Shift+Tab')
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toHaveAttribute('href', '#main-content')

    await page.keyboard.press('Enter')
    const main = page.getByRole('main')
    await expect(main).toHaveCount(1)
    await expect(page.locator('#main-content')).toBeFocused()
  })

  test('applies the exact type, surface, and minimum-target tokens', async ({ page }) => {
    const contract = await page.evaluate(async () => {
      await document.fonts.ready
      const heading = document.querySelector('h1')
      const fontFaces = Array.from(document.styleSheets).flatMap((sheet) =>
        Array.from(sheet.cssRules)
          .filter((rule) => rule.type === CSSRule.FONT_FACE_RULE)
          .map((rule) => rule.cssText),
      )
      return {
        background: getComputedStyle(document.body).backgroundColor,
        bodyFontSize: Number.parseFloat(getComputedStyle(document.body).fontSize),
        bodyLineHeight: Number.parseFloat(getComputedStyle(document.body).lineHeight),
        headingFontSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
        headingLineHeight: heading ? Number.parseFloat(getComputedStyle(heading).lineHeight) : 0,
        headingFamily: heading ? getComputedStyle(heading).fontFamily : '',
        bodyFamily: getComputedStyle(document.body).fontFamily,
        loadedFonts: {
          atkinson: document.fonts.check('18px "Atkinson Hyperlegible"'),
          newsreader: document.fonts.check('42px Newsreader'),
        },
        fontFaces,
        fontResources: performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => /\/fonts\/.*\.woff2(?:$|\?)/.test(name)),
      }
    })

    expect(contract.background).toBe('rgb(247, 243, 233)')
    expect(contract.bodyFontSize).toBe(18)
    expect(contract.bodyLineHeight).toBe(27)
    expect(contract.headingFontSize).toBe(42)
    expect(contract.headingLineHeight).toBeCloseTo(43.68, 1)
    expect(contract.headingFamily).toContain('Newsreader')
    expect(contract.bodyFamily).toContain('Atkinson Hyperlegible')
    expect(contract.loadedFonts).toEqual({ atkinson: true, newsreader: true })
    expect(contract.fontFaces).toHaveLength(3)
    expect(contract.fontFaces.every((rule) => rule.includes('/fonts/'))).toBe(true)
    expect(contract.fontResources.some((url) => url.includes('AtkinsonHyperlegible'))).toBe(true)
    expect(contract.fontResources.some((url) => url.includes('Newsreader'))).toBe(true)
    const appOrigin = new URL(page.url()).origin
    expect(contract.fontResources.every((url) => new URL(url).origin === appOrigin)).toBe(true)

    await expectMinimumTargets(page)
  })

  test('exposes only Package 1 filters and keeps search keyboard operable', async ({ page }) => {
    const search = page.getByRole('search')
    await expect(search.getByLabel('Search stores')).toBeVisible()

    for (const deferredFilter of [
      'Open now',
      'Visit status',
      'Saved only',
      'Claimed only',
      'Distance from area center',
      'State',
    ]) {
      await expect(page.getByLabel(deferredFilter, { exact: true })).toHaveCount(0)
    }

    if ((page.viewportSize()?.width ?? 0) <= 540) {
      const filtersButton = page.getByRole('button', { name: 'Filters', exact: true })
      await expect(filtersButton).toBeVisible()
      await expect(filtersButton).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByLabel('Area', { exact: true })).not.toBeVisible()
      await expect(page.getByLabel('Category', { exact: true })).not.toBeVisible()

      await filtersButton.focus()
      await page.keyboard.press('Enter')
      await expect(filtersButton).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByLabel('Area', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Category', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
    } else {
      await expect(page.getByLabel('Area', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Category', { exact: true })).toBeVisible()
    }

    const searchInput = search.getByLabel('Search stores')
    await searchInput.focus()
    await searchInput.fill('Cedar')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/stores\?q=Cedar$/)
    await expect(page.getByRole('link', { name: 'Cedar & Brass' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Blue Finch Curios' })).toHaveCount(0)
  })

  test('shows trustworthy card hours and meaningful loaded imagery', async ({ page }) => {
    const cards = page.locator('.catalog-card')
    await expect(cards).toHaveCount(12)

    for (const card of await cards.all()) {
      const name = (await card.getByRole('heading').textContent())?.trim()
      expect(name).toBeTruthy()

      const hours = card.locator('.catalog-card__hours')
      await expect(hours).toBeVisible()
      await expect(hours).toContainText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)
      await expect(hours).toContainText(/Open|Closed|Hours unavailable/)

      const image = card.getByRole('img')
      await expect(image).toHaveCount(1)
      await expect(image).toHaveAccessibleName(/\S+/)
      if ((await image.evaluate((node) => node.tagName)) === 'IMG') {
        await expect(image).toHaveAttribute('alt', /\S+/)
        expect(await image.getAttribute('alt')).toContain(name)
        await expect
          .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0)
      } else {
        await expect(card.locator('.catalog-card__placeholder')).toContainText(name!.slice(0, 1))
        await expect(card.locator('.catalog-card__placeholder')).toContainText(/Photo coming soon/)
      }
    }
  })

  test('covers success, empty, blocked, and not-found states', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 2, name: '12 stores to explore' }),
    ).toBeVisible()

    await page.goto('/stores?q=does-not-exist')
    await expect(page.getByText('No stores match those filters.')).toBeVisible()
    const emptyState = page
      .getByRole('status')
      .filter({ has: page.getByText('No stores match those filters.') })
    const clear = emptyState.getByRole('button', { name: 'Clear filters' })
    await expect(clear).toBeVisible()
    await clear.click()
    await expect(
      page.getByRole('heading', { level: 2, name: '12 stores to explore' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Show map' }).click()
    await expect(page.getByRole('status')).toContainText(
      'Map and travel-time suggestions are not available yet',
    )

    await page.goto('/stores/not-a-real-store')
    await expect(page.getByRole('heading', { level: 1, name: 'Store not found' })).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
  })

  test('reflows at the 320px CSS viewport equivalent to 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Browse stores' })).toBeVisible()

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow.body).toBeLessThanOrEqual(1)
    expect(overflow.document).toBeLessThanOrEqual(1)
    await expectMinimumTargets(page)
  })
})
