import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const token = 'A'.repeat(43)

function challenge(origin: string, count = 0) {
  return {
    challengeId:
      count === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
    challenge: 'aa'.repeat(32),
    rpId: '127.0.0.1',
    origin,
    expiresAt: '2026-09-07T12:00:00Z',
    state: 'pending',
    allowCredentials: [],
    registrationCompletedCount: count,
    registrationTargetCount: 2,
  }
}

async function installCredentialStub(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    class FakeAttestationResponse {
      clientDataJSON = Uint8Array.from([1]).buffer
      attestationObject = Uint8Array.from([2]).buffer
    }
    class FakePublicKeyCredential {
      rawId = Uint8Array.from([3, 4]).buffer
      response = new FakeAttestationResponse()
    }
    Object.defineProperty(window, 'PublicKeyCredential', { value: FakePublicKeyCredential })
    Object.defineProperty(window, 'AuthenticatorAttestationResponse', {
      value: FakeAttestationResponse,
    })
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create: async () => new FakePublicKeyCredential(), get: async () => null },
    })
  })
}

test('setup completes two credentials and scrubs the capability at phone and desktop widths', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium' || testInfo.project.name === 'mobile',
    'The default browser suite runs the local review harness; use reviewer-credentials-route.config.ts for this transport-backed route test.',
  )
  page.setDefaultTimeout(60_000)
  let registrations = 0
  await page.route('**/auth/v1/**', async (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }),
  )
  await page.route('**/functions/v1/reviewer-credentials', async (route) => {
    const body = route.request().postDataJSON() as { operation: string }
    if (body.operation === 'request_registration') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(challenge(new URL(page.url()).origin, registrations)),
      })
      return
    }
    if (body.operation === 'complete_registration') {
      registrations += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          credentialRecordId: `credential-${registrations}`,
          state: registrations === 2 ? 'active' : 'pending',
        }),
      })
      return
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'unavailable' }),
    })
  })
  await installCredentialStub(page)
  await page.goto(`/reviewer/setup#token=${token}`)
  await expect(page).toHaveURL(/\/reviewer\/setup$/u)
  await expect(page.locator('h1')).toHaveText('Set up reviewer security keys')
  await expect(page.locator('body')).not.toContainText(token)
  await page.getByRole('button', { name: 'Add first security key' }).click()
  await expect(page.getByText('Security keys added: 1 of 2.')).toBeVisible()
  await page.getByRole('button', { name: 'Add backup security key' }).click()
  await expect(page.getByRole('link', { name: 'Finish' })).toBeVisible()
  const successA11y = await new AxeBuilder({ page }).analyze()
  expect(successA11y.violations).toEqual([])
})

test('missing capability is denied generically', async ({ page }) => {
  await page.goto('/reviewer/credentials')
  await expect(page.getByRole('alert')).toHaveText(/invalid, expired, or unavailable/iu)
  const deniedA11y = await new AxeBuilder({ page }).analyze()
  expect(deniedA11y.violations).toEqual([])
})
