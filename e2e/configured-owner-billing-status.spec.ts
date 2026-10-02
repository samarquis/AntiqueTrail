import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'

type Input = {
  endpoint: string
  anonKey: string
  origin: string
  storeId: string
  siblingStoreId: string
  cancellation?: boolean
  cancellationVerified?: boolean
  owner: { email: string; password: string; totpSecret: string }
}

const inputPath = process.env.CONFIGURED_OWNER_BILLING_INPUT
if (!inputPath) throw new Error('CONFIGURED_OWNER_BILLING_INPUT is required')
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

async function directStatus(token: string, storeId: string) {
  const url = new URL('/rest/v1/rpc/billing_get_owner_status', input.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Owner billing integration may call only literal loopback')
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: {
      apikey: input.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'app_public',
      'Accept-Profile': 'app_public',
      'x-owner-store-id': storeId,
    },
    body: '{}',
  })
  return { status: response.status, body: await response.json() }
}

test('configured Owner browser reads exact billing RPC and direct wrong scopes deny', async ({
  page,
}) => {
  await loginOwner(page)
  await expect(page.getByRole('heading', { name: 'Your store workspace' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Clockwork Cabinet' }).click()
  await expect(page.getByRole('link', { name: 'Billing status' })).toBeVisible()

  const statusRequest = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/rest/v1/rpc/billing_get_owner_status'),
  )
  await page.getByRole('link', { name: 'Billing status' }).click()
  const statusResponse = await statusRequest
  expect(statusResponse.status()).toBe(200)
  const requestHeaders = await statusResponse.request().allHeaders()
  expect(requestHeaders['x-owner-store-id']).toBe(input.storeId)
  const status = await statusResponse.json()
  expect(status).toEqual(
    input.cancellation
      ? {
          tier: 'gallery',
          subscriptionState: 'active',
          paidThrough: expect.any(String),
          salesOpen: false,
          availableActions: [],
        }
      : {
          tier: 'free',
          subscriptionState: 'none',
          paidThrough: null,
          salesOpen: false,
          availableActions: [],
        },
  )
  if (input.cancellationVerified) {
    await expect(page.getByRole('status')).toContainText('Renewal cancellation is confirmed.')
    await expect(page.getByText('Gallery', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel renewal' })).toHaveCount(0)
  } else if (input.cancellation) {
    await expect(page.getByText('Gallery', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel renewal' }).click()
    await expect(
      page.getByRole('heading', { name: 'Confirm cancellation for Clockwork Cabinet' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
    await page.getByRole('checkbox').check()
    const intentResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/rpc/billing_request_owner_cancellation'),
    )
    await page.getByRole('button', { name: 'Confirm cancellation' }).click()
    expect((await intentResponse).status()).toBe(200)
    await expect(page.getByRole('status')).toContainText('Confirmation is pending.')
    await page.getByRole('button', { name: 'Refresh billing' }).click()
    await expect(page.getByRole('status')).toContainText('Confirmation is pending.')
    await expect(page.getByRole('button', { name: 'Cancel renewal' })).toHaveCount(0)
  } else {
    await expect(page.getByText('Free')).toBeVisible()
    await expect(
      page.getByText('No billing actions are available in this workspace.'),
    ).toBeVisible()
  }

  const ownerToken = requestHeaders.authorization?.replace(/^Bearer\s+/i, '')
  if (!ownerToken) throw new Error('Configured Owner browser RPC lacked a bearer session')
  const siblingDenied = await directStatus(ownerToken, input.siblingStoreId)
  expect(siblingDenied.status).toBe(403)
  expect(siblingDenied.body).toMatchObject({
    code: '42501',
    message: 'billing_status_unavailable',
  })
})
