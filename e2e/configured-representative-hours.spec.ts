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
  // Each viewport project uses the same temporary service. Reset the disposable
  // scope and fixture row before every case so one project cannot poison the next.
  await service.sql(
    `
      update partner_private.store_partner_grants
      set state='active', revoked_at=null, version=version+1
      where grant_id='${input.grantId}';
      update app_public.store_weekly_hours set closes_at='18:00'
      where store_id='${ownStore}' and iso_weekday=1 and interval_index=1;
    `,
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
  const hoursSignal: {
    selected?: string
    submitted?: string
    persisted?: string
    outcome?: 'saved' | 'error' | 'unavailable'
  } = {}
  try {
    await close.fill('19:45')
    await close.press('Tab')
    hoursSignal.selected = await close.inputValue()
    await expect(close).toHaveValue('19:45')
    const [request] = await Promise.all([
      page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          new URL(request.url()).pathname.endsWith('/rpc/portal_save_hours'),
        { timeout: 15_000 },
      ),
      page.getByRole('button', { name: 'Save hours', exact: true }).click(),
    ])
    const closing = request
      .postDataJSON()
      ?.p_hours?.weekly?.find((day: { weekday: number }) => day.weekday === 1)
      ?.intervals?.[0]?.closesAt
    hoursSignal.submitted =
      typeof closing === 'string' && /^\d{2}:\d{2}$/.test(closing) ? closing : 'invalid'
    await expect(page.getByRole('status')).toHaveText('Hours saved and freshness updated.')
    hoursSignal.persisted = await weeklyClose(ownStore)
    expect(hoursSignal.submitted).toBe('19:45')
    await expect.poll(() => weeklyClose(ownStore)).toBe('19:45:00')
  } finally {
    hoursSignal.selected ??= await close.inputValue().catch(() => 'unavailable')
    hoursSignal.persisted = await weeklyClose(ownStore).catch(() => 'unavailable')
    const saved = await page
      .getByRole('status')
      .filter({ hasText: 'Hours saved and freshness updated.' })
      .isVisible()
      .catch(() => false)
    const error = await page
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false)
    hoursSignal.outcome = saved ? 'saved' : error ? 'error' : 'unavailable'
    // Allowlist clock values only; never log Auth, MFA, headers, or the raw payload.
    console.log('[issue-494-hours]', JSON.stringify(hoursSignal))
  }
  expect(await weeklyClose(siblingStore)).toBe(priorSibling)
  expect(priorOwn).not.toBe('19:45:00')
  await page.reload()
  await expect(page.locator('#hours-1-close-1')).toHaveValue('19:45')
  const shopper = await browser.newContext({ baseURL: input.origin })
  let shopperPage: Page | undefined
  const catalogSignals: Array<Promise<{ status: number; code: string; rows: number }>> = []
  try {
    shopperPage = await shopper.newPage()
    shopperPage.on('response', (response) => {
      if (
        catalogSignals.length >= 8 ||
        response.request().method() !== 'POST' ||
        !new URL(response.url()).pathname.endsWith('/functions/v1/public-catalog')
      )
        return
      catalogSignals.push(
        response
          .json()
          .then((payload) => ({
            status: response.status(),
            code: [
              'ALPHA_AUTH_REQUIRED',
              'CATALOG_UNAVAILABLE',
              'GATEWAY_UNAVAILABLE',
              'RATE_LIMITED',
            ].includes(payload?.error?.code)
              ? payload.error.code
              : response.ok()
                ? 'ok'
                : 'other',
            rows: Array.isArray(payload?.data) ? payload.data.length : 0,
          }))
          .catch(() => ({ status: response.status(), code: 'unavailable', rows: 0 })),
      )
    })
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
    try {
      const clocks = await shopperPage
        ?.locator('.store-hours dd')
        .allTextContents()
        .catch(() => [])
      const detailLoaded = await shopperPage
        ?.getByRole('heading', { name: 'Clockwork Cabinet', exact: true })
        .isVisible()
        .catch(() => false)
      // Closing first also cancels any diagnostic response body that never completes.
      await shopper.close()
      console.log(
        '[issue-494-shopper-hours]',
        JSON.stringify({
          detailLoaded: Boolean(detailLoaded),
          clocks: clocks?.flatMap((text) => text.match(/\d{1,2}:\d{2}\s*[AP]M/g) ?? []) ?? [],
          catalog: await Promise.all(catalogSignals),
        }),
      )
    } finally {
      await shopper.close()
    }
  }
  await page.screenshot({ path: info.outputPath('published-hours.png') })
})

test('revoked exact scope denies the next UI edit and preserves both stores', async ({
  page,
}, info) => {
  await login(page)
  await page.getByRole('button', { name: 'Save hours', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Hours saved and freshness updated.')
  const beforeOwn = await weeklyClose(ownStore)
  const beforeSibling = await weeklyClose(siblingStore)
  await service.sql(
    `update partner_private.store_partner_grants set state='revoked',revoked_at=statement_timestamp(),version=version+1 where grant_id='${input.grantId}';`,
  )
  await page.locator('#hours-1-close-1').fill('20:15')
  await page.getByRole('button', { name: 'Save hours', exact: true }).click()
  const error = page.getByRole('alert')
  await expect(error).toBeVisible()
  await expect(error).toContainText("We couldn't update this store portal")
  await expect(error).toBeFocused()
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(await weeklyClose(ownStore)).toBe(beforeOwn)
  expect(await weeklyClose(siblingStore)).toBe(beforeSibling)
  await page.screenshot({ path: info.outputPath('revoked-scope-denial.png') })
})

test('repeated native time edits publish the selected clock without losing changes', async ({
  page,
}) => {
  const siblingBefore = await weeklyClose(siblingStore)
  await login(page)
  const close = page.locator('#hours-1-close-1')
  let completed = 0
  let submitted = 'unavailable'
  let persisted = 'unavailable'
  try {
    for (let iteration = 0; iteration < 50; iteration++) {
      const selected = iteration % 2 === 0 ? '18:00' : '19:45'
      await close.fill(selected)
      await close.press('Tab')
      await expect(close).toHaveValue(selected)
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.endsWith('/rpc/portal_save_hours'),
          { timeout: 15_000 },
        ),
        page.getByRole('button', { name: 'Save hours', exact: true }).click(),
      ])
      const closing = response
        .request()
        .postDataJSON()
        ?.p_hours?.weekly?.find((day: { weekday: number }) => day.weekday === 1)
        ?.intervals?.[0]?.closesAt
      submitted = typeof closing === 'string' && /^\d{2}:\d{2}$/.test(closing) ? closing : 'invalid'
      expect(response.ok()).toBe(true)
      expect(submitted).toBe(selected)
      await expect(page.getByRole('status')).toHaveText('Hours saved and freshness updated.')
      persisted = await weeklyClose(ownStore)
      expect(persisted).toBe(`${selected}:00`)
      await expect(close).toHaveValue(selected)
      completed++
    }
    expect(await weeklyClose(siblingStore)).toBe(siblingBefore)
    await page.reload()
    await expect(page.locator('#hours-1-close-1')).toHaveValue('19:45')
  } finally {
    persisted = await weeklyClose(ownStore).catch(() => 'unavailable')
    console.log('[issue-494-stability]', JSON.stringify({ completed, submitted, persisted }))
  }
})
