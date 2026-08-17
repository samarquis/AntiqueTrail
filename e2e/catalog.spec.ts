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

async function expectLandscapeCatalogCover(page: Page, viewportWidth: number) {
  await page.setViewportSize({
    width: viewportWidth,
    height: viewportWidth <= 540 ? 844 : 1000,
  })
  await page.goto('/stores')

  const card = page.locator('.catalog-card').first()
  const image = card.locator('.catalog-card__image')
  await expect(card).toBeVisible()
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0)

  const geometry = await card.evaluate((cardNode) => {
    const imageNode = cardNode.querySelector<HTMLImageElement>('.catalog-card__image')
    if (!imageNode) throw new Error('Catalog cover image was not rendered')
    const cardRect = cardNode.getBoundingClientRect()
    const imageRect = imageNode.getBoundingClientRect()
    return {
      cardWidth: cardRect.width,
      imageWidth: imageRect.width,
      imageHeight: imageRect.height,
      objectFit: getComputedStyle(imageNode).objectFit,
    }
  })

  expect(geometry.objectFit).toBe('cover')
  expect(geometry.imageWidth / geometry.imageHeight).toBeGreaterThanOrEqual(1.25)
  expect(geometry.imageWidth / geometry.cardWidth).toBeGreaterThanOrEqual(0.9)
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
      ['Saved Stores', '/saved', true],
      ['Add a Place from a Link', '/capture', true],
      ['Shared with Me', '/shares', true],
      ['Trip Ideas', '/trip-ideas', true],
      ['Account & Privacy', '/account/privacy', true],
      ['Install', '/install', false],
      ['Help', '/help', false],
    ] as const
    for (const [name, path, requiresSignIn] of moreDestinations) {
      const link = page.getByRole('link', {
        name: new RegExp(`^${name}( Requires sign-in)?$`),
      })
      await expect(link).toBeVisible()
      await expectExactPath(link, path)
      if (requiresSignIn) {
        await expect(link).toContainText('Requires sign-in')
      }
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
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press('Shift+Tab')
      if (await skipLink.evaluate((element) => element === document.activeElement)) break
    }
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

  test('reserves rust for destructive states: area labels use muted, hover uses teal-dark', async ({
    page,
  }) => {
    const mutedRgb = 'rgb(93, 106, 102)'
    const rustRgb = 'rgb(182, 78, 46)'

    const areaLabel = page.locator('.catalog-card__area').first()
    await expect(areaLabel).toBeVisible()
    await expect(areaLabel).toHaveCSS('color', mutedRgb)

    const link = page.locator('.catalog-card h2 a').first()
    await link.hover()
    await expect(link).toHaveCSS('color', 'rgb(7, 85, 79)')

    const colors = await page.evaluate((rust) => {
      const area = document.querySelector('.catalog-card__area')
      const anchor = document.querySelector<HTMLAnchorElement>('.catalog-card h2 a')
      return {
        area: area ? getComputedStyle(area).color : '',
        hovered: anchor ? getComputedStyle(anchor).color : '',
        rust,
      }
    }, rustRgb)
    expect(colors.area).not.toBe(colors.rust)
    expect(colors.hovered).not.toBe(colors.rust)
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

    if ((page.viewportSize()?.width ?? 0) <= 800) {
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
        const alt = await image.getAttribute('alt')
        expect(alt?.trim().length).toBeGreaterThan(20)
        expect(alt?.toLocaleLowerCase()).not.toContain(name.toLocaleLowerCase())
        await image.scrollIntoViewIfNeeded()
        await expect
          .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0)
      } else {
        await expect(card.locator('.catalog-card__placeholder')).toContainText(name!.slice(0, 1))
        await expect(card.locator('.catalog-card__placeholder')).toContainText(/Photo coming soon/)
      }
    }
  })

  test('keeps Browse covers landscape and card-width at desktop, tablet, and phone sizes', async ({
    page,
  }) => {
    for (const viewportWidth of [1440, 900, 390]) {
      await expectLandscapeCatalogCover(page, viewportWidth)
    }
  })

  test('keeps a listing usable when its cover request is blocked', async ({ page }) => {
    let blockedRequests = 0
    await page.route(/blue-finch-curios-cover\.webp(?:\?.*)?$/u, async (route) => {
      blockedRequests += 1
      await route.abort('failed')
    })

    await page.goto('/stores?q=Blue')
    const card = page.locator('.catalog-card').filter({ hasText: 'Blue Finch Curios' })
    await expect(card).toBeVisible()
    await expect.poll(() => blockedRequests).toBeGreaterThan(0)
    await expect(card.getByRole('img', { name: 'Store image unavailable' })).toBeVisible()
    await expect(card).toContainText(/Photo coming soon/i)
    await expect(card.getByRole('link', { name: 'Blue Finch Curios', exact: true })).toBeVisible()
    await expect(card.locator('.catalog-card__hours')).toContainText(
      /Open|Closed|Hours unavailable/,
    )
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
