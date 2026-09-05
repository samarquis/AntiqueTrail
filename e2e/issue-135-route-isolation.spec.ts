import { expect, test } from '@playwright/test'

const portalRoutes = [
  '',
  '/info',
  '/photos',
  '/hours',
  '/changes',
  '/updates',
  '/links',
  '/support',
  '/preview',
]

for (const route of portalRoutes) {
  test(`Portal ${route || 'home'} denies every unscoped identity on direct navigation`, async ({
    page,
  }) => {
    for (const identity of ['anonymous', 'shopper-a', 'shopper-b', 'administrator']) {
      await page.goto(`/store-portal${route}?reviewAs=${identity}&reviewState=success`)
      if (route === '') {
        await expect(page.getByRole('heading', { name: 'Store Portal unavailable' })).toBeVisible()
      } else {
        await expect(page.getByRole('alert')).toHaveText(
          'Store Portal access is unavailable for this account or session.',
        )
      }
      await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
      await expect(page.locator('main input, main textarea')).toHaveCount(0)
    }
  })

  test(`Portal ${route || 'home'} renders a denied screen for the permission-denied fixture`, async ({
    page,
  }) => {
    await page.goto(`/store-portal${route}?reviewAs=representative&reviewState=success`)
    await expect(page.locator('main h1')).toBeVisible()
    await page.goto(`/store-portal${route}?reviewAs=representative&reviewState=permission-denied`)
    await expect(page.getByRole('alert')).toHaveText(
      'Store Portal access is unavailable for this account or session.',
    )
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
    await expect(page.locator('main input, main textarea')).toHaveCount(0)
  })
}

for (const route of ['status', 'draft']) {
  test(`Partner ${route} denies anonymous direct access without exposing a case`, async ({
    page,
  }) => {
    await page.goto(`/partner/${route}?reviewAs=anonymous&reviewState=success`)
    await expect(page.getByRole('alert')).toHaveText(
      "We couldn't continue this invitation. Check the link or try again.",
    )
    await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
    await expect(page.locator('main input, main textarea')).toHaveCount(0)
  })
}

test('anonymous claim access requires sign-in before displaying any claim fields', async ({
  page,
}) => {
  await page.goto('/partner/claim?reviewAs=anonymous&reviewState=success')
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page.getByLabel('Relationship to the store')).toHaveCount(0)
  await expect(page.getByLabel('Authority statement')).toHaveCount(0)
  await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
})
