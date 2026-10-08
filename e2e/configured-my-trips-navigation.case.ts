import { expect, type Page } from '@playwright/test'

type ConfiguredTrip = {
  id: string
  name: string
  localDate: string
}

async function openMyTripsThroughMore(page: Page) {
  await page.goto('/stores')
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary navigation' })
  await expect(primaryNavigation.getByRole('link')).toHaveText([
    'Browse',
    'Saved stores',
    'More',
  ])
  await primaryNavigation.getByRole('link', { name: 'More', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeFocused()
  const myTrips = page
    .getByRole('navigation', { name: 'More destinations' })
    .getByRole('link', { name: 'My trips', exact: true })
  await expect(myTrips).toBeVisible()
  await myTrips.click()
  await expect(page.getByRole('heading', { level: 1, name: 'My trips' })).toBeFocused()
}

export async function verifyConfiguredMyTripsVisibleNavigation(
  shopperA: Page,
  shopperB: Page,
  trip: ConfiguredTrip,
) {
  await openMyTripsThroughMore(shopperA)
  const row = shopperA
    .getByLabel('My trips')
    .locator('li')
    .filter({ hasText: trip.name })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(trip.localDate)
  const tripLink = row.getByRole('link', { name: trip.name, exact: true })
  await expect(tripLink).toHaveAttribute('href', `/trips/${trip.id}/plan`)
  await tripLink.click()
  await expect(shopperA).toHaveURL(new RegExp(`/trips/${trip.id}/plan$`))
  await expect(
    shopperA.getByRole('heading', { level: 1, name: trip.name, exact: true }),
  ).toBeFocused()
  await expect(shopperA.getByText(`Trip date: ${trip.localDate}`)).toBeVisible()

  await openMyTripsThroughMore(shopperB)
  await expect(
    shopperB.getByRole('link', { name: trip.name, exact: true }),
  ).toHaveCount(0)
}
