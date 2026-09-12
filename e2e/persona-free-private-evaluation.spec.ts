import { expect, test } from '@playwright/test'

const reviewUrl = (path: string, identity: string, state = 'success') =>
  `${path}${path.includes('?') ? '&' : '?'}reviewAs=${identity}&reviewState=${state}`

test.describe('issue 251 free private evaluation personas', () => {
  test.describe.configure({ mode: 'serial' })

  test('[fpe:shopper-priority-computer] follows the priority shopper transition chain', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/stores?q=Blue&area=topeka-ks', 'shopper-a'))
    await expect(page.locator('a.catalog-card__details')).toBeVisible()
    const saveAction = page.locator('[aria-label="Private save action"]')
    const saveButton = saveAction.getByRole('button', {
      name: /^(Save store|Remove saved store) Blue Finch Curios$/,
    })
    await expect(saveButton).toBeVisible()
    if ((await saveButton.innerText()) === 'Save store') {
      await saveButton.click()
      await expect(saveAction.getByRole('status')).toContainText('Store saved')
    }

    await page.locator('a.catalog-card__details').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Blue Finch Curios' })).toBeVisible()
    const galleryChoices = page
      .getByRole('group', { name: 'Choose a store photo' })
      .getByRole('button')
    await expect(galleryChoices).toHaveCount(50)
    await galleryChoices.nth(1).click()
    await expect(galleryChoices.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /^Enlarge image:/ })).toBeVisible()

    await page.goto(
      reviewUrl('/trips/new?addStoreId=00000000-0000-4000-8000-000000000001', 'shopper-a'),
    )
    await expect(page).toHaveURL(/\/trips\/new\?addStoreId=/)
    await page.getByLabel('Trip name').fill('Saturday archive walk')
    await page.getByLabel('Date').fill('2026-09-12')
    await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Added to Saturday archive walk' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'View Trip' }).click()

    const stops = page.getByLabel('Ordered trip stops')
    const blueFinchStop = stops.locator('li').filter({ hasText: 'Blue Finch Curios' })
    await expect(blueFinchStop).toBeVisible()
    await page.getByLabel('Priority for Blue Finch Curios').selectOption('must')
    await page.getByLabel('Dwell minutes for Blue Finch Curios').fill('75')
    await page.getByLabel('Dwell minutes for Blue Finch Curios').blur()
    await expect(stops.locator('li').filter({ hasText: 'Blue Finch Curios' })).toContainText(
      'must, 75 minutes',
    )
  })

  test('[fpe:shopper-returning-interruption] preserves cancellation and offline honesty', async ({
    page,
    context,
  }) => {
    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Saved stores' })).toBeVisible()
    await expect(page.getByText('Blue Finch Curios')).toBeVisible()
    await page.setViewportSize({ width: 393, height: 852 })

    const cancellationPage = await context.newPage()
    await cancellationPage.goto(reviewUrl('/stores/blue-finch-curios', 'anonymous'))
    await cancellationPage
      .getByRole('link', { name: /save blue finch curios.*requires sign-in/i })
      .click()
    await cancellationPage.getByRole('link', { name: 'Cancel and return without saving' }).click()
    await expect(cancellationPage.getByRole('heading', { name: 'Blue Finch Curios' })).toBeFocused()
    await expect(
      cancellationPage.evaluate(() =>
        sessionStorage.getItem('antique-trail:jit-private-action:v1'),
      ),
    ).resolves.toBeNull()
    await cancellationPage.close()

    await page.goto(reviewUrl('/saved', 'shopper-a'))
    await expect(page.getByRole('button', { name: 'Remove saved store' })).toBeVisible()
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const privateAction = page.locator('[aria-label="Private save action"]')
    await expect(privateAction.getByRole('status')).toContainText(/private changes are paused/i)
    await expect(
      privateAction.getByRole('button', { name: 'Save unavailable offline' }),
    ).toBeDisabled()
    await context.setOffline(false)
  })

  test('[fpe:partner-navigator-boundary] keeps one-trip partner and Navigator boundaries explicit', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/trips/trip-a/invite', 'shopper-a'))
    await expect(
      page.getByRole('heading', { level: 1, name: 'Trip Partner and Navigator' }),
    ).toBeVisible()
    await page.getByLabel('Partner verified email').fill('shopper-b@local.invalid')
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await expect(page.getByText(/One invitation is pending until/)).toBeVisible()

    await page.goto(
      '/trip-invitations?reviewAs=shopper-b&reviewState=success#token=review-trip-invite-shopper-a',
    )
    await expect(page.getByRole('alert')).toContainText(/couldn't update this trip/i)
    await expect(page.getByText("Avery's antique day")).toHaveCount(0)

    await page.goto(reviewUrl('/trips/trip-a/go', 'shopper-a'))
    await expect(page.getByRole('heading', { level: 1, name: 'Go' })).toBeVisible()
    await expect(page.getByText(/does not claim route feasibility or travel time/)).toBeVisible()
  })

  test('[fpe:representative-boundary] keeps the Representative scope separate', async ({
    page,
  }) => {
    await page.goto(reviewUrl('/store-portal', 'representative'))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto(reviewUrl('/corrections/correction-a', 'representative'))
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText(/shopper|permission|available/i).first()).toBeVisible()
  })

  test('[fpe:administrator-boundary] keeps Administrator operations separate', async ({ page }) => {
    await page.goto(reviewUrl('/admin', 'administrator'))
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto(reviewUrl('/corrections/correction-a', 'administrator'))
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText(/shopper|permission|available/i).first()).toBeVisible()
  })
})
