import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createLocalService } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(
  fs.readFileSync(process.env.CONFIGURED_REPRESENTATIVE_HOURS_INPUT!, 'utf8'),
)
const service = createLocalService({ resumeDirectory: input.directory })
const ownStore = input.stores.own
const siblingStore = input.stores.sibling

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function login(page: Page, returnTo = '/store-portal/hours') {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  await page.getByLabel('Email', { exact: true }).fill(input.representative.email)
  await page.getByLabel('Password', { exact: true }).fill(input.representative.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Verify your sign-in', exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Authentication code', { exact: true })
    .fill(totp(input.representative.totpSecret))
  await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  await expect(page).toHaveURL(/\/store-portal\/hours$/)
}

const weeklyClose = (store: string) =>
  service
    .sql(
      `select closes_at::text from app_public.store_weekly_hours where store_id='${store}' and iso_weekday=1 and interval_index=1;`,
    )
    .then((result: string) => result.trim())

test.beforeEach(async () => {
  // Each viewport project uses the same temporary service. Re-arm the scoped
  // grant before every case so one project's revocation cannot poison the next.
  await service.sql(
    `update partner_private.store_partner_grants set state='active',revoked_at=null,version=version+1 where grant_id='${input.grantId}';`,
  )
})

test('Representative publishes exact-store Monday hours through real Auth and MFA', async ({
  page,
  browser,
}, info) => {
  const priorOwn = await weeklyClose(ownStore)
  const priorSibling = await weeklyClose(siblingStore)
  await login(page)
  const close = page.locator('#hours-1-close-1')
  await close.fill('19:45')
  await close.press('Tab')
  await expect(close).toHaveValue('19:45')
  await page.getByRole('button', { name: 'Save hours', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Hours saved and freshness updated.')
  await expect.poll(() => weeklyClose(ownStore)).toBe('19:45:00')
  expect(await weeklyClose(siblingStore)).toBe(priorSibling)
  expect(priorOwn).not.toBe('19:45:00')
  await page.reload()
  await expect(page.locator('#hours-1-close-1')).toHaveValue('19:45')
  const shopper = await browser.newContext({ baseURL: input.origin })
  try {
    const shopperPage = await shopper.newPage()
    await shopperPage.goto('/auth/sign-in?returnTo=%2Fstores%2Fclockwork-cabinet')
    await shopperPage.getByLabel('Email', { exact: true }).fill(input.users[1].email)
    await shopperPage.getByLabel('Password', { exact: true }).fill(input.users[1].password)
    await shopperPage.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(shopperPage).toHaveURL(/\/stores\/clockwork-cabinet$/)
    await expect(
      shopperPage.getByText(
        process.env.CONFIGURED_REPRESENTATIVE_HOURS_WRONG_READBACK === '1' ? /6:45 PM/ : /7:45 PM/,
      ),
    ).toBeVisible()
  } finally {
    await shopper.close()
  }
  await page.screenshot({ path: info.outputPath('published-hours.png') })
})

test('revoked exact scope denies the next UI edit and preserves both stores', async ({
  page,
}, info) => {
  await login(page)
  const beforeOwn = await weeklyClose(ownStore)
  const beforeSibling = await weeklyClose(siblingStore)
  await service.sql(
    `update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),version=version+1 where grant_id='${input.grantId}';`,
  )
  await page.locator('#hours-1-close-1').fill('20:15')
  await page.getByRole('button', { name: 'Save hours', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText("We couldn't update this store portal")
  await expect(page.locator('#hours-1-close-1')).toBeFocused()
  expect(await weeklyClose(ownStore)).toBe(beforeOwn)
  expect(await weeklyClose(siblingStore)).toBe(beforeSibling)
  await page.screenshot({ path: info.outputPath('revoked-scope-denial.png') })
})
