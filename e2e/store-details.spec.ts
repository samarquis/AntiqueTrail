import { expect, test, type Page } from '@playwright/test'

async function expectMinimumTargets(page: Page) {
  const undersized = await page
    .locator('main a, main button, main input, main select, main textarea, main [role="button"]')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (!(element instanceof HTMLElement) || element.hidden) return []
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return []
        const rect = element.getBoundingClientRect()
        if (!rect.width || !rect.height || (rect.width >= 48 && rect.height >= 48)) return []
        return [
          {
            name: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 80),
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
          },
        ]
      }),
    )
  expect(undersized, 'Store Details actions smaller than 48 × 48 CSS pixels').toEqual([])
}

async function openPrimaryStore(page: Page) {
  await page.goto('/stores?q=Blue&area=topeka-ks')
  const storeLink = page.getByRole('link', { name: 'Blue Finch Curios', exact: true })
  await expect(storeLink).toBeVisible()
  await storeLink.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, 480))
  await storeLink.click()
  await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
  const heading = page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
}

test.describe('Store Details decision-screen contract', () => {
  test('shows the complete visit decision hierarchy and honest source information', async ({
    page,
  }) => {
    await openPrimaryStore(page)

    await expect(page.getByRole('heading', { name: 'About this store' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hours', exact: true })).toBeVisible()
    await expect(
      page.getByText(/Open now|Closed now|Closed today|Open state unavailable/),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: /special hours & exceptions/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contact & location' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accessibility' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Source & freshness' })).toBeVisible()
    await expect(page.getByText('Step-free entrance at the blue front door')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Late-summer lighting collection' }),
    ).toBeVisible()
    await expect(page.getByText('Antique Trail Synthetic Store fixture')).toBeVisible()
    await expect(page.getByText('Labor Day', { exact: true })).toBeVisible()
    await expect(page.getByText(/September 7, 2026.*Closed/)).toBeVisible()
    await expect(
      page.getByRole('link', { name: /visit official website.*new window/i }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /instagram.*new window/i })).toBeVisible()

    await expect(
      page.getByText(/directions are unavailable for this fictional address/i),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: /navigate in maps/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /add to trip|private memory/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /suggest a correction/i })).toBeVisible()
    await expectMinimumTargets(page)
  })

  test('keeps opening state, actions, Photos, and Hours & location before the photo wall', async ({
    page,
  }) => {
    await page.goto('/stores/blue-finch-curios', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible({
      timeout: 30_000,
    })
    const opening = page.getByLabel("Today's opening information")
    const actions = page.getByRole('navigation', { name: 'Store visit actions' })
    const sections = page.getByRole('navigation', { name: 'Store sections' })
    const about = page.getByRole('region', { name: 'About this store' })
    await expect(opening).toBeVisible()
    await expect(sections.getByRole('link', { name: 'Photos' })).toHaveAttribute(
      'href',
      '#gallery-heading',
    )
    await expect(sections.getByRole('link', { name: 'Hours & location' })).toHaveAttribute(
      'href',
      '#hours-heading',
    )
    expect(
      await actions.evaluate((element) => {
        const cover = document.querySelector('.store-gallery--cover')
        return Boolean(
          cover && element.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      }),
    ).toBe(true)
    expect(
      await sections.evaluate((element) => {
        const cover = document.querySelector('.store-gallery--cover')
        return Boolean(
          cover && cover.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        )
      }),
    ).toBe(true)
    for (const locator of [opening, actions, sections, about]) {
      expect(
        await locator.evaluate((element) => {
          const wall = document.querySelector('.store-gallery--collection')
          return Boolean(
            wall && element.compareDocumentPosition(wall) & Node.DOCUMENT_POSITION_FOLLOWING,
          )
        }),
      ).toBe(true)
    }
  })

  test('supports gallery selection, enlargement, focus containment, and focus return', async ({
    page,
  }) => {
    await openPrimaryStore(page)
    const galleryChoices = page.getByRole('group', { name: 'Choose a store photo' })
    await expect(galleryChoices).toBeVisible()
    const choices = galleryChoices.getByRole('button')
    expect(await choices.count()).toBeGreaterThan(1)

    const second = choices.nth(1)
    await second.focus()
    await page.keyboard.press('Enter')
    await expect(second).toHaveAttribute('aria-pressed', 'true')

    const enlarge = page.getByRole('button', { name: /^Enlarge image:/ })
    await enlarge.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog')
    const close = dialog.getByRole('button', { name: 'Close enlarged image' })
    const previous = dialog.getByRole('button', { name: 'Previous photo' })
    const next = dialog.getByRole('button', { name: 'Next photo' })
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(previous).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(next).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(next).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(enlarge).toBeFocused()
  })

  test('keeps the gallery usable when a selected image request is blocked', async ({ page }) => {
    let blockedRequests = 0
    await page.route(/blue-finch-curios-gallery-aisle\.webp(?:\?.*)?$/u, async (route) => {
      blockedRequests += 1
      await route.abort('failed')
    })

    await page.goto('/stores/blue-finch-curios')
    const gallery = page.locator('.store-gallery')
    const choices = page.getByRole('group', { name: 'Choose a store photo' }).getByRole('button')
    await expect(choices).toHaveCount(50)
    await expect.poll(() => blockedRequests).toBeGreaterThan(0)

    const failedChoice = choices.nth(1)
    await failedChoice.click()
    await expect(failedChoice).toHaveAttribute('aria-pressed', 'true')
    await expect(gallery.getByRole('img', { name: 'Store image unavailable' })).toBeVisible()
    await expect(gallery).toContainText('Photo unavailable')
    await expect(failedChoice).toContainText('Unavailable')

    await choices.first().click()
    await expect(choices.first()).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Enlarge image:/ })).toBeVisible()
  })

  test('recovers from an enlarged-image failure and returns focus inside the gallery', async ({
    page,
  }) => {
    await page.goto('/stores/blue-finch-curios')
    const gallery = page.locator('.store-gallery')
    const enlarge = page.getByRole('button', { name: /^Enlarge image:/ })
    await enlarge.click()

    const dialog = page.getByRole('dialog')
    const enlargedImage = dialog.getByRole('img')
    await expect(enlargedImage).toBeVisible()
    await enlargedImage.evaluate((image) => image.dispatchEvent(new Event('error')))

    await expect(dialog).toHaveCount(0)
    await expect(gallery.getByRole('img', { name: 'Store image unavailable' })).toBeVisible()
    await expect(gallery).toContainText('Photo unavailable')
    await expect(gallery.locator(':focus')).toHaveCount(1)
    await expect(gallery.getByRole('group', { name: 'Choose a store photo' })).toContainText(
      'Unavailable',
    )
  })

  test('returns to the exact Browse query, scroll position, and originating store', async ({
    page,
  }) => {
    await page.goto('/stores?q=Blue&area=topeka-ks')
    const storeLink = page.getByRole('link', { name: 'Blue Finch Curios', exact: true })
    await storeLink.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, 420))
    await storeLink.click()
    const expectedScroll = await page.evaluate(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem('antique-trail:browse-return') ?? '{}',
      ) as { scrollY?: number }
      return saved.scrollY
    })
    expect(expectedScroll).toEqual(expect.any(Number))
    await page.getByRole('link', { name: 'Back to Browse' }).click()

    await expect(page).toHaveURL(/\/stores\?q=Blue&area=topeka-ks$/)
    await expect(storeLink).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScroll)
  })

  test('returns from full photos to the originating photo link with its reading position', async ({
    page,
  }) => {
    await openPrimaryStore(page)
    const photosLink = page.getByRole('link', { name: /see all 50 photos/i })
    await photosLink.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, 760))

    await photosLink.click()
    const expectedScroll = await page.evaluate(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem('antique-trail:store-return') ?? '{}',
      ) as { scrollY?: number }
      return saved.scrollY
    })
    expect(expectedScroll).toEqual(expect.any(Number))
    await expect(page).toHaveURL(/\/stores\/blue-finch-curios\/photos$/)
    await page.getByRole('link', { name: 'Back to Blue Finch Curios' }).click()

    await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScroll)
    await expect(photosLink).toBeFocused()
  })

  test('reflows without clipping at narrow, intermediate, and desktop widths', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 })
    await page.goto('/stores/blue-finch-curios', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible({
      timeout: 30_000,
    })
    for (const width of [320, 390, 800, 900, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      const geometry = await page.evaluate(() => {
        const article = document.querySelector<HTMLElement>('.store-detail__article')
        const main = document.querySelector<HTMLElement>('main.store-detail')
        const header = document.querySelector<HTMLElement>('.store-detail__header')
        const gallery = document.querySelector<HTMLElement>('.store-gallery')
        const actions = document.querySelector<HTMLElement>('.store-detail__actions')
        const title = document.querySelector<HTMLElement>('.store-detail__header h1')
        const visitGrid = document.querySelector<HTMLElement>('.store-detail__visit-grid')
        const hoursTable = document.querySelector<HTMLElement>('.store-hours')
        return {
          bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          articleWidth: article?.getBoundingClientRect().width ?? 0,
          mainWidth: main?.getBoundingClientRect().width ?? 0,
          articleBorder: article ? getComputedStyle(article).borderTopWidth : '',
          articleRadius: article ? getComputedStyle(article).borderRadius : '',
          headerPadding: header
            ? Number.parseFloat(getComputedStyle(header).paddingInlineStart)
            : 0,
          galleryPadding: gallery
            ? Number.parseFloat(getComputedStyle(gallery).paddingInlineStart)
            : 0,
          actionsPadding: actions
            ? Number.parseFloat(getComputedStyle(actions).paddingInlineStart)
            : 0,
          titleMaxWidth: title ? getComputedStyle(title).maxWidth : '',
          visitGridColumns: visitGrid ? getComputedStyle(visitGrid).gridTemplateColumns : '',
          hoursTableMaxWidth: hoursTable ? getComputedStyle(hoursTable).maxWidth : '',
        }
      })
      expect(geometry.bodyOverflow, `${width}px body overflow`).toBeLessThanOrEqual(1)
      expect(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1)
      if (width >= 1024) {
        expect(geometry.articleWidth, `${width}px article fills main`).toBeGreaterThanOrEqual(
          geometry.mainWidth - 1,
        )
        expect(geometry.articleBorder).toBe('0px')
        expect(geometry.articleRadius).toBe('0px')
        const expectedGutter = Math.min(64, Math.max(32, width * 0.03))
        expect(geometry.headerPadding).toBeCloseTo(expectedGutter, 0)
        expect(geometry.galleryPadding).toBeCloseTo(expectedGutter, 0)
        expect(geometry.actionsPadding).toBeCloseTo(expectedGutter, 0)
        expect(geometry.titleMaxWidth).toBe('none')
        expect(geometry.visitGridColumns.split(' ')).toHaveLength(2)
        expect(geometry.hoursTableMaxWidth).toBe('576px')
      } else {
        expect(geometry.articleWidth).toBeLessThanOrEqual(720)
      }
      await expectMinimumTargets(page)
    }
  })

  test('pins the Store sections navigation as the only top band on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/stores/blue-finch-curios')
    const nav = page.getByRole('navigation', { name: 'Store sections' })
    await expect(nav).toBeVisible()

    await expect
      .poll(() =>
        page.locator('.site-header').evaluate((element) => getComputedStyle(element).position),
      )
      .toBe('static')
    await expect
      .poll(() => nav.evaluate((element) => getComputedStyle(element).position))
      .toBe('sticky')

    for (const [label, target] of [
      ['Hours & location', '#hours-heading'],
      ['Source', '#source-heading'],
      ['About', '#about-heading'],
      ['Photos', '#gallery-heading'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(new RegExp(`${target.replace('#', '\\#')}$`))
      const scrollMargin = await page
        .locator(target)
        .evaluate((heading) => getComputedStyle(heading).scrollMarginTop)
      expect(Number.parseFloat(scrollMargin), `${target} offsets the pinned band`).toBeGreaterThan(
        0,
      )
      await expect
        .poll(() => nav.evaluate((element) => getComputedStyle(element).position))
        .toBe('sticky')
    }

    await nav.getByRole('link', { name: 'Hours & location' }).click()
    const clearance = await page
      .locator('#hours-heading')
      .evaluate(
        (heading, navHeight) => heading.getBoundingClientRect().top - navHeight + 1,
        await nav.evaluate((element) => element.getBoundingClientRect().height),
      )
    expect(clearance, 'the pinned section lands below the navigation').toBeGreaterThanOrEqual(0)

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const back = page.getByRole('link', { name: 'Back to Browse' })
    await back.scrollIntoViewIfNeeded()
    await expect(back).toBeInViewport()
    await expect(back).toBeVisible()
  })

  test('keeps the Store sections navigation wrapped in narrow layouts', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/stores/blue-finch-curios')
    const nav = page.getByRole('navigation', { name: 'Store sections' })
    await expect(nav).toBeVisible()
    await expect
      .poll(() => nav.evaluate((element) => getComputedStyle(element).position))
      .toBe('static')
    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - document.body.clientWidth,
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))
    expect(overflow.body).toBeLessThanOrEqual(1)
    expect(overflow.document).toBeLessThanOrEqual(1)
  })

  test('keeps section navigation immediate when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/stores/cedar-brass')
    const nav = page.getByRole('navigation', { name: 'Store sections' })
    await expect(nav).toBeVisible()
    const motion = await nav.evaluate((element) => ({
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transitionSeconds: Number.parseFloat(getComputedStyle(element).transitionDuration),
      animationSeconds: Number.parseFloat(getComputedStyle(element).animationDuration),
    }))
    expect(motion.scrollBehavior).toBe('auto')
    expect(motion.transitionSeconds).toBeLessThanOrEqual(0.000_01)
    expect(motion.animationSeconds).toBeLessThanOrEqual(0.000_01)
  })

  test('captures the ordered desktop, tablet, and mobile review views', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'One deterministic evidence set is sufficient.')
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'tablet', width: 900, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/stores/blue-finch-curios')
      await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
      await page.screenshot({
        path: `docs/evidence/ui-02/store-details-${viewport.name}.png`,
        fullPage: true,
      })
    }
  })

  test('keeps sparse and not-found recovery inside the Store Details contract', async ({
    page,
  }) => {
    await page.goto('/stores/cedar-brass')
    await expect(page.getByRole('heading', { level: 1, name: 'Cedar & Brass' })).toBeFocused()
    await expect(page.getByText(/contact details have not been supplied/i)).toBeVisible()
    await expect(page.getByText(/accessibility information is unavailable/i)).toBeVisible()
    await expect(page.getByText(/has not published any updates/i)).toBeVisible()
    await expect(page.getByText(/source information unavailable/i)).toBeVisible()

    await page.goto('/stores/not-a-real-store')
    await expect(page.getByRole('heading', { level: 1, name: 'Store not found' })).toBeFocused()
    await expect(page.getByRole('link', { name: 'Back to stores' })).toHaveAttribute(
      'href',
      '/stores',
    )
  })

  test('shows all store updates on the updates page and restores the store scroll/focus', async ({
    page,
  }) => {
    await page.goto('/stores/blue-finch-curios')
    const seeAll = page.getByRole('link', { name: 'See all store updates' })
    await expect(seeAll).toBeVisible()
    await seeAll.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollTo(0, 1500))
    await seeAll.click()

    await expect(page).toHaveURL(/\/stores\/blue-finch-curios\/updates$/)
    const heading = page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })
    await expect(heading).toBeVisible()
    for (const title of [
      'Late-summer lighting collection',
      'Holiday hours posted',
      'New finds in the back room',
      'Saturday pop-up restock',
    ]) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
    const expectedScroll = await page.evaluate(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem('antique-trail:store-return') ?? '{}',
      ) as { scrollY?: number }
      return saved.scrollY
    })
    expect(expectedScroll).toEqual(expect.any(Number))

    await page.getByRole('link', { name: 'Back to Blue Finch Curios' }).click()
    await expect(page).toHaveURL(/\/stores\/blue-finch-curios$/)
    await expect(seeAll).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(expectedScroll)
  })

  test('shows an honest empty state on the updates page for a store with no updates', async ({
    page,
  }) => {
    await page.goto('/stores/cedar-brass/updates')
    await expect(page.getByRole('heading', { level: 1, name: 'Cedar & Brass' })).toBeFocused()
    await expect(page.getByText(/has not published any updates/i)).toBeVisible()
  })
})
