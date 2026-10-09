import { expect, test, type Locator, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

type Input = {
  endpoint: string
  anonKey: string
  origin: string
  output: string
  storeId: string
  siblingStoreId: string
  storeSlug: string
  siblingSlug: string
  storeName: string
  owner: { email: string; password: string; totpSecret: string }
  shopper: { email: string; password: string }
}

const inputPath = process.env.CONFIGURED_OWNER_STORE_UPDATES_INPUT
if (!inputPath) throw new Error('CONFIGURED_OWNER_STORE_UPDATES_INPUT is required')
const input: Input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))

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

async function loginOwner(page: Page) {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent('/owner/stores')}`)
  await page.getByLabel('Email', { exact: true }).fill(input.owner.email)
  await page.getByLabel('Password', { exact: true }).fill(input.owner.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible()
  await page.getByLabel('Authentication code', { exact: true }).fill(totp(input.owner.totpSecret))
  await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  await expect(page).toHaveURL(/\/owner\/stores$/)
}

async function loginShopper(page: Page) {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent('/stores')}`)
  await page.getByLabel('Email', { exact: true }).fill(input.shopper.email)
  await page.getByLabel('Password', { exact: true }).fill(input.shopper.password)
  const responsePromise = page.waitForResponse((response) =>
    response.url().includes('/auth/v1/token?grant_type=password'),
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  expect((await responsePromise).status()).toBe(200)
  await expect(page).toHaveURL(/\/stores$/)
}

function rpcRequest(request: import('@playwright/test').Request, name: string) {
  return request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/rpc/${name}`)
}

const visualStates = [
  { name: 'wide-light', width: 1440, height: 1000, colorScheme: 'light' },
  { name: 'wide-dark', width: 1440, height: 1000, colorScheme: 'dark' },
  { name: 'narrow-light', width: 390, height: 844, colorScheme: 'light' },
  { name: 'narrow-dark', width: 390, height: 844, colorScheme: 'dark' },
] as const

async function captureResponsiveMatrix(page: Page, surface: string) {
  for (const state of visualStates) {
    await page.setViewportSize({ width: state.width, height: state.height })
    await page.emulateMedia({ colorScheme: state.colorScheme })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    const screenshotName =
      surface === 'store-detail' && state.name === 'wide-light'
        ? 'issue-581-store-detail-desktop.png'
        : surface === 'store-updates' && state.name === 'narrow-dark'
          ? 'issue-581-store-updates-narrow-dark.png'
          : null
    if (screenshotName)
      await page.screenshot({ path: path.join(input.output, screenshotName), fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ colorScheme: 'light' })
}

async function focusByTab(page: Page, target: Locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('Keyboard focus target was not reachable')
}

test('configured Owner edits text through selected-store context and shoppers see newest live updates', async ({
  page,
  browser,
}) => {
  await loginOwner(page)
  await expect(page.getByRole('heading', { name: 'Your store workspace' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Issue 581 Store A' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Issue 581 Store B' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open Issue 581 Store A' }).click()
  await expect(page).toHaveURL(/\/store-portal$/)
  await page.getByRole('link', { name: 'Store Updates', exact: true }).click()
  await expect(page).toHaveURL(/\/store-portal\/updates$/)
  await expect(page.getByRole('heading', { name: 'Store Updates' })).toBeVisible()

  const created: { headline: string; id: string; publishedAt: string }[] = []
  for (let index = 1; index <= 5; index += 1) {
    const headline = `Issue 581 update ${index}`
    const responsePromise = page.waitForResponse((response) =>
      rpcRequest(response.request(), 'portal_create_update'),
    )
    await page.getByLabel('Headline', { exact: true }).fill(headline)
    await page.getByLabel('Details', { exact: true }).fill(`Public text body ${index}`)
    await page.getByRole('button', { name: 'Publish text update', exact: true }).click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const headers = await response.request().allHeaders()
    expect(headers['x-owner-store-id']).toBe(input.storeId)
    const body = response.request().postDataJSON() as { p_update?: Record<string, unknown> }
    expect(body.p_update).toMatchObject({ type: 'new_finds', headline })
    expect(body.p_update?.imageRequested).not.toBe(true)
    const saved = (await response.json()) as { id: string; version: number; publishedAt: string }
    expect(saved.version).toBe(1)
    created.push({ headline, id: saved.id, publishedAt: saved.publishedAt })
    await expect(
      page.getByRole('status').filter({ hasText: 'Text update published.' }),
    ).toBeVisible()
  }
  const newestFirst = (items: typeof created) =>
    [...items].sort(
      (left, right) =>
        right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id),
    )

  let editRequests = 0
  page.on('request', (request) => {
    if (rpcRequest(request, 'portal_edit_update')) editRequests += 1
  })
  const editButton = page.getByRole('button', { name: 'Edit Issue 581 update 3', exact: true })
  await focusByTab(page, editButton)
  await expect(editButton).toBeFocused()
  expect(await editButton.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  await page.keyboard.press('Enter')
  const editType = page.getByLabel('Edit type', { exact: true })
  await expect(editType).toBeVisible()
  await page.getByLabel('Edit headline', { exact: true }).fill('Unsent Issue 581 edit')
  await page.getByLabel('Edit details', { exact: true }).fill('This edit is cancelled.')
  await captureResponsiveMatrix(page, 'owner-editor')
  const cancelEdit = page.getByRole('button', { name: 'Cancel edit', exact: true })
  for (const next of [
    page.getByLabel('Edit vendor or booth label (optional)', { exact: true }),
    page.getByLabel('Edit official source link (optional)', { exact: true }),
    page.getByRole('button', { name: 'Save update', exact: true }),
    cancelEdit,
  ]) {
    await page.keyboard.press('Tab')
    await expect(next).toBeFocused()
  }
  expect(await cancelEdit.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  await page.keyboard.press('Space')
  expect(editRequests).toBe(0)
  await expect(page.getByText('Issue 581 update 3', { exact: true })).toBeVisible()

  const editResponsePromise = page.waitForResponse((response) =>
    rpcRequest(response.request(), 'portal_edit_update'),
  )
  await focusByTab(page, editButton)
  await page.keyboard.press('Enter')
  await page.getByLabel('Edit headline', { exact: true }).fill('Edited Issue 581 update 3')
  await page.getByLabel('Edit details', { exact: true }).fill('Edited public text body.')
  const saveEdit = page.getByRole('button', { name: 'Save update', exact: true })
  for (const next of [
    page.getByLabel('Edit vendor or booth label (optional)', { exact: true }),
    page.getByLabel('Edit official source link (optional)', { exact: true }),
    saveEdit,
  ]) {
    await page.keyboard.press('Tab')
    await expect(next).toBeFocused()
  }
  expect(await saveEdit.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  await page.keyboard.press('Enter')
  const editResponse = await editResponsePromise
  expect(editResponse.status()).toBe(200)
  const editHeaders = await editResponse.request().allHeaders()
  expect(editHeaders['x-owner-store-id']).toBe(input.storeId)
  const editInput = editResponse.request().postDataJSON() as {
    p_update_id: string
    p_update: Record<string, unknown>
    p_expected_version: number
    p_idempotency_key: string
  }
  expect(editInput.p_update_id).toBe(created[2]?.id)
  expect(editInput.p_update).toMatchObject({
    type: 'new_finds',
    headline: 'Edited Issue 581 update 3',
    details: 'Edited public text body.',
  })
  expect(editInput.p_expected_version).toBe(1)
  expect(editInput.p_idempotency_key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
  const savedEdit = (await editResponse.json()) as {
    state: string
    update: { id: string; version: number; headline: string; publishedAt: string }
  }
  expect(savedEdit).toMatchObject({
    state: 'saved',
    update: { id: created[2]?.id, version: 2, headline: 'Edited Issue 581 update 3' },
  })
  expect(savedEdit.update.publishedAt).toBe(created[2]?.publishedAt)
  await expect(page.getByText('Edited Issue 581 update 3', { exact: true })).toBeVisible()
  const editedUpdates = created.map((item, index) =>
    index === 2 ? { ...item, headline: 'Edited Issue 581 update 3' } : item,
  )
  const orderedUpdates = newestFirst(editedUpdates)
  await captureResponsiveMatrix(page, 'owner-updates')

  const shopperContext = await browser.newContext({ baseURL: input.origin })
  const shopperPage = await shopperContext.newPage()
  try {
    await loginShopper(shopperPage)
    const detailResponsePromise = shopperPage.waitForResponse((response) => {
      const request = response.request()
      if (
        request.method() !== 'POST' ||
        !new URL(response.url()).pathname.endsWith('/functions/v1/public-catalog')
      )
        return false
      return (request.postDataJSON() as { operation?: string }).operation === 'details'
    })
    await shopperPage.goto(`/stores/${encodeURIComponent(input.storeSlug)}`)
    const detailResponse = await detailResponsePromise
    const detailPayload = (await detailResponse.json()) as {
      data?: unknown
      error?: { code?: unknown }
    }
    if (!detailResponse.ok()) {
      const allowedCodes = [
        'GATEWAY_UNAVAILABLE',
        'CATALOG_UNAVAILABLE',
        'ALPHA_AUTH_REQUIRED',
        'RATE_LIMITED',
      ]
      const code =
        typeof detailPayload.error?.code === 'string' &&
        allowedCodes.includes(detailPayload.error.code)
          ? detailPayload.error.code
          : 'unknown'
      throw new Error(`Public catalog detail failed (${detailResponse.status()}; ${code})`)
    }
    const rowCount = Array.isArray(detailPayload.data)
      ? detailPayload.data.length
      : detailPayload.data !== null && typeof detailPayload.data === 'object'
        ? 1
        : 0
    if (rowCount !== 1) throw new Error(`Public catalog detail returned ${rowCount} rows`)
    await expect(shopperPage.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    const latest = shopperPage.locator('.store-updates h3')
    await expect(latest).toHaveText(orderedUpdates.slice(0, 3).map((update) => update.headline))
    await expect(shopperPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await expect(shopperPage.getByRole('link', { name: 'See all store updates' })).toBeVisible()
    await captureResponsiveMatrix(shopperPage, 'store-detail')

    const seeAll = shopperPage.getByRole('link', { name: 'See all store updates' })
    await focusByTab(shopperPage, seeAll)
    await expect(seeAll).toBeFocused()
    expect(await seeAll.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
    await shopperPage.keyboard.press('Enter')
    await expect(shopperPage).toHaveURL(new RegExp(`/stores/${input.storeSlug}/updates$`))
    await expect(shopperPage.locator('.store-updates h3')).toHaveText(
      orderedUpdates.map((update) => update.headline),
    )
    await expect(shopperPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await expect(shopperPage.locator('.store-updates h3').first()).toBeVisible()
    await captureResponsiveMatrix(shopperPage, 'store-updates')

    const archiveResponsePromise = page.waitForResponse((response) =>
      rpcRequest(response.request(), 'portal_archive_update'),
    )
    const oldest = orderedUpdates.at(-1)
    if (!oldest) throw new Error('No Owner update available to archive')
    const oldestOwnerRow = page.getByRole('listitem').filter({ hasText: oldest.headline })
    await oldestOwnerRow.getByRole('button', { name: 'Archive', exact: true }).click()
    const archiveResponse = await archiveResponsePromise
    expect(archiveResponse.status()).toBe(200)
    expect((await archiveResponse.json()).state).toBe('archived')
    expect((await archiveResponse.request().allHeaders())['x-owner-store-id']).toBe(input.storeId)
    const remainingUpdates = orderedUpdates.filter((update) => update.id !== oldest.id)

    await shopperPage.goto(`/stores/${encodeURIComponent(input.storeSlug)}`)
    await expect(shopperPage.locator('.store-updates h3')).toHaveText(
      remainingUpdates.slice(0, 3).map((update) => update.headline),
    )
    await expect(shopperPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await shopperPage.getByRole('link', { name: 'See all store updates' }).click()
    await expect(shopperPage.locator('.store-updates h3')).toHaveText(
      remainingUpdates.map((update) => update.headline),
    )

    await shopperPage.goto(`/stores/${encodeURIComponent(input.siblingSlug)}`)
    await expect(shopperPage.getByText('This store has not published any updates.')).toBeVisible()
    await expect(shopperPage.getByText(/Issue 581 update|Edited Issue 581 update/)).toHaveCount(0)
  } finally {
    await shopperContext.close()
  }
})
