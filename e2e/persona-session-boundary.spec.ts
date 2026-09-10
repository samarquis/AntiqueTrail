import { expect, test } from '@playwright/test'

const representativePortal = (session: 'active' | 'expired' | 'revoked') =>
  `/store-portal?reviewAs=representative&reviewState=success&reviewSession=${session}`

test.describe('review fixture session boundary', () => {
  test('an active representative can navigate to Hours and save the declared fixture', async ({
    page,
  }) => {
    await page.goto(representativePortal('active'))
    await page.getByRole('link', { name: 'Hours & holidays' }).click()
    await expect(page.getByRole('heading', { name: 'Hours & holidays' })).toBeVisible()
    await page.getByRole('button', { name: 'Save hours' }).click()
    await expect(page.getByRole('status')).toContainText('Hours saved and freshness updated.')
  })

  for (const session of ['expired', 'revoked'] as const) {
    test(`${session} representative navigation exposes no portal record or successful write`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))

      await page.goto(representativePortal(session))
      await expect(page.getByRole('heading', { name: 'Store Portal unavailable' })).toBeVisible()
      await expect(page.getByText('Blue Finch Curios')).toHaveCount(0)
      await expect(page.getByText('Hours saved and freshness updated.')).toHaveCount(0)
      await expect(page.getByRole('alert')).toBeVisible()
      expect(errors).toEqual([])
    })
  }
})
