import { expect, test, type Page } from '@playwright/test'
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

function rpcRequest(request: import('@playwright/test').Request, name: string) {
  return request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/rpc/${name}`)
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
  await page.getByRole('button', { name: 'Edit Issue 581 update 3', exact: true }).click()
  await page.getByLabel('Edit headline', { exact: true }).fill('Unsent Issue 581 edit')
  await page.getByLabel('Edit details', { exact: true }).fill('This edit is cancelled.')
  await page.getByRole('button', { name: 'Cancel edit', exact: true }).click()
  expect(editRequests).toBe(0)
  await expect(page.getByText('Issue 581 update 3', { exact: true })).toBeVisible()

  const editResponsePromise = page.waitForResponse((response) =>
    rpcRequest(response.request(), 'portal_edit_update'),
  )
  await page.getByRole('button', { name: 'Edit Issue 581 update 3', exact: true }).click()
  await page.getByLabel('Edit headline', { exact: true }).fill('Edited Issue 581 update 3')
  await page.getByLabel('Edit details', { exact: true }).fill('Edited public text body.')
  await page.getByRole('button', { name: 'Save update', exact: true }).click()
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

  const anonymousContext = await browser.newContext({ baseURL: input.origin })
  const anonymousPage = await anonymousContext.newPage()
  try {
    await anonymousPage.goto(`/stores/${encodeURIComponent(input.storeSlug)}`)
    await expect(anonymousPage.getByRole('heading', { name: 'Latest updates' })).toBeVisible()
    const latest = anonymousPage.locator('.store-updates h3')
    await expect(latest).toHaveText(orderedUpdates.slice(0, 3).map((update) => update.headline))
    await expect(anonymousPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await expect(anonymousPage.getByRole('link', { name: 'See all store updates' })).toBeVisible()
    await anonymousPage.screenshot({
      path: path.join(input.output, 'issue-581-store-detail-desktop.png'),
      fullPage: true,
    })

    await anonymousPage.getByRole('link', { name: 'See all store updates' }).click()
    await expect(anonymousPage).toHaveURL(new RegExp(`/stores/${input.storeSlug}/updates$`))
    await expect(anonymousPage.locator('.store-updates h3')).toHaveText(
      orderedUpdates.map((update) => update.headline),
    )
    await expect(anonymousPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await anonymousPage.setViewportSize({ width: 390, height: 844 })
    await anonymousPage.emulateMedia({ colorScheme: 'dark' })
    expect(
      await anonymousPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await anonymousPage.screenshot({
      path: path.join(input.output, 'issue-581-store-updates-narrow-dark.png'),
      fullPage: true,
    })

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

    await anonymousPage.goto(`/stores/${encodeURIComponent(input.storeSlug)}`)
    await expect(anonymousPage.locator('.store-updates h3')).toHaveText(
      remainingUpdates.slice(0, 3).map((update) => update.headline),
    )
    await expect(anonymousPage.getByText('Expired sale fixture', { exact: true })).toHaveCount(0)
    await anonymousPage.getByRole('link', { name: 'See all store updates' }).click()
    await expect(anonymousPage.locator('.store-updates h3')).toHaveText(
      remainingUpdates.map((update) => update.headline),
    )

    await anonymousPage.goto(`/stores/${encodeURIComponent(input.siblingSlug)}`)
    await expect(anonymousPage.getByText('This store has not published any updates.')).toBeVisible()
    await expect(anonymousPage.getByText(/Issue 581 update|Edited Issue 581 update/)).toHaveCount(0)
  } finally {
    await anonymousContext.close()
  }
})
