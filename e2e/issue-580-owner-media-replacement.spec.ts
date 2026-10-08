import { expect, test, type Page, type Route } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

type Actor = { email: string; password: string; totpSecret: string }
type Input = {
  endpoint: string
  anonKey: string
  origin: string
  output: string
  projectId: string
  storeId: string
  storeName: string
  storeSlug: string
  target: { mediaId: string; version: number; altText: string }
  owner: Actor
  admin: Actor
}

const inputPath = process.env.CONFIGURED_OWNER_MEDIA_INPUT
if (!inputPath) throw new Error('CONFIGURED_OWNER_MEDIA_INPUT is required')
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as Input
const imagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/f9sAAAAASUVORK5CYII=',
  'base64',
)

function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function login(page: Page, actor: Actor, returnTo: string) {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  await page.getByLabel('Email', { exact: true }).fill(actor.email)
  await page.getByLabel('Password', { exact: true }).fill(actor.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible()
  await page.getByLabel('Authentication code', { exact: true }).fill(totp(actor.totpSecret))
  await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
}

async function openOwnerPhotos(page: Page) {
  await login(page, input.owner, '/owner/stores')
  await expect(page.getByRole('heading', { name: 'Your store workspace' })).toBeVisible()
  await page.getByRole('button', { name: `Open ${input.storeName}` }).click()
  await page.getByRole('link', { name: 'Official photos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Official photos' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Replace.*Approved gallery image one/i })).toBeVisible()
}

function localSql(sql: string) {
  if (!/^[a-z][a-z0-9-]{1,60}$/i.test(input.projectId))
    throw new Error('Configured test project id is invalid')
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGPASSWORD=postgres',
      `supabase_db_${input.projectId}`,
      'psql',
      '-X',
      '-w',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: sql, encoding: 'utf8' },
  )
  if (result.status !== 0) throw new Error('Local synthetic media worker step failed')
  return result.stdout.trim()
}

function scalar(sql: string) {
  const output = localSql(sql)
  const value = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1)
  if (!value) throw new Error('Local synthetic media worker returned no result')
  return value
}

function processReplacement(uploadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error('Replacement receipt is invalid')
  localSql(`begin;
    set local role media_worker;
    select app_public.media_record_staged_upload('${uploadId}');
    select app_public.media_record_processing_result('${uploadId}','clean','issue580-browser-scan','issue580-browser-reencode',decode(repeat('31',32),'hex'),100000,640,480,true,true);
    commit;`)
}

function publishReplacement(uploadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error('Replacement receipt is invalid')
  const publicKey = scalar(
    `select public_derivative_object_key from media_private.media_uploads where upload_id='${uploadId}';`,
  )
  if (!/^official\/[0-9a-f-]{36}\/v[1-9][0-9]*\/[a-f0-9]{16,64}\.webp$/i.test(publicKey))
    throw new Error('Local replacement is not ready for publication')
  localSql(`begin;
    set local role media_worker;
    select app_public.media_claim_publish_job('${uploadId}');
    select app_public.media_complete_publish_job('${uploadId}','${uploadId}','${publicKey}');
    commit;`)
}

function multipartField(body: string, name: string) {
  const marker = `name="${name}"`
  const markerIndex = body.indexOf(marker)
  if (markerIndex < 0) return null
  const valueStart = body.indexOf('\r\n\r\n', markerIndex)
  if (valueStart < 0) return null
  const start = valueStart + 4
  const end = body.indexOf('\r\n', start)
  return end < 0 ? null : body.slice(start, end)
}

test('Owner replaces exact full-cap slot; separate Admin decision gates rendered publication', async ({
  browser,
  page,
}) => {
  let workerStages = 0
  let pendingUploadId: string | null = null
  const submittedVersions: number[] = []
  await page.route('**/functions/v1/media-provider-command', async (route) => {
    const request = route.request()
    const body = request.postDataBuffer()?.toString('latin1') ?? ''
    const targetMediaId = multipartField(body, 'targetMediaId')
    const expectedVersionText = multipartField(body, 'expectedVersion')
    const altText = multipartField(body, 'altText')
    const idempotencyKey = multipartField(body, 'idempotencyKey')
    const rightsConfirmed = multipartField(body, 'rightsConfirmed')
    const headers = request.headers()
    expect(targetMediaId).toBe(input.target.mediaId)
    expect(expectedVersionText).toMatch(/^\d+$/)
    submittedVersions.push(Number(expectedVersionText))
    expect(altText).toBeTruthy()
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rightsConfirmed).toBe('true')
    expect(body).not.toContain('name="storeId"')
    expect(body).not.toContain('name="kind"')
    expect(body).not.toContain('name="displayOrder"')
    expect(body).toContain(imagePng.toString('latin1'))
    expect(headers['x-owner-store-id']).toBe(input.storeId)
    const token = headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw new Error('Owner media request had no authenticated session')
    const endpoint = new URL('/rest/v1/rpc/media_reserve_replacement', input.endpoint)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1')
      throw new Error('Configured media acceptance can reach only literal loopback')
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'app_public',
        'Accept-Profile': 'app_public',
        'x-owner-store-id': input.storeId,
      },
      body: JSON.stringify({
        p_target_media_id: targetMediaId,
        p_expected_version: Number(expectedVersionText),
        p_alt_text: altText,
        p_idempotency_key: idempotencyKey,
        p_rights_confirmed: rightsConfirmed === 'true',
        p_source_mime: 'image/png',
        p_source_bytes: imagePng.length,
        p_source_width: 1,
        p_source_height: 1,
        p_source_digest: crypto.createHash('sha256').update(imagePng).digest('hex'),
      }),
    })
    let receipt: Record<string, unknown> = {}
    try {
      receipt = (await response.json()) as Record<string, unknown>
    } catch {
      receipt = {}
    }
    if (!response.ok || typeof receipt.uploadId !== 'string') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"media_unavailable"}' })
      return
    }
    processReplacement(receipt.uploadId)
    workerStages += 1
    pendingUploadId = receipt.uploadId
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ uploadId: receipt.uploadId, state: 'awaiting_review' }),
    })
  })
  const imageResponse = (route: Route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: imagePng })
  await page.route('**/assets/issue580-*.webp', imageResponse)
  await page.route('**/media/official/**', imageResponse)

  await openOwnerPhotos(page)
  await expect(page.getByRole('button', { name: 'Add gallery image' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add cover image' })).toBeDisabled()

  const requestCountBeforeCancel = workerStages
  await page.getByRole('button', { name: /Replace.*Approved gallery image one/i }).click()
  await expect(page.getByLabel('Official image file')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel replacement', exact: true }).click()
  expect(workerStages).toBe(requestCountBeforeCancel)

  // Simulate another accepted update between slot render and submit. The stale
  // request reaches the local RPC but never advances to the synthetic worker stage.
  localSql(`update app_public.store_media set version=version+1 where id='${input.target.mediaId}';`)
  await page.getByRole('button', { name: /Replace.*Approved gallery image one/i }).click()
  await page.getByLabel('Official image file').setInputFiles({
    name: 'stale-replacement.png',
    mimeType: 'image/png',
    buffer: imagePng,
  })
  await page.getByLabel('Alternative text', { exact: true }).fill('Stale replacement attempt')
  await page.getByLabel(/I confirm that I have rights to publish this image/i).check()
  await page.getByRole('button', { name: 'Submit replacement for review' }).click()
  await expect(page.getByRole('alert')).toContainText("couldn't update this store portal")
  expect(workerStages).toBe(0)
  expect(
    scalar(`select count(*) from media_private.media_uploads where store_id='${input.storeId}' and alt_text='Stale replacement attempt';`),
  ).toBe('0')

  await page.reload()
  await expect(page.getByRole('button', { name: /Replace.*Approved gallery image one/i })).toBeVisible()
  await page.getByRole('button', { name: /Replace.*Approved gallery image one/i }).click()
  await page.getByLabel('Official image file').setInputFiles({
    name: 'rejected-replacement.png',
    mimeType: 'image/png',
    buffer: imagePng,
  })
  await page.getByLabel('Alternative text', { exact: true }).fill('Rejected gallery replacement')
  await page.getByLabel(/I confirm that I have rights to publish this image/i).check()
  await page.getByRole('button', { name: 'Submit replacement for review' }).click()
  await expect(page.getByRole('status')).toContainText(/awaiting Administrator review/i)
  const firstUploadId = pendingUploadId
  if (!firstUploadId) throw new Error('First local replacement did not reserve an upload')

  const oldPublic = await browser.newPage()
  await oldPublic.goto(`/stores/${input.storeSlug}`)
  await expect(oldPublic.getByRole('img', { name: input.target.altText })).toBeVisible()

  const admin = await browser.newPage()
  await login(admin, input.admin, '/admin')
  await expect(admin.getByRole('heading', { name: 'Review queue' })).toBeVisible()
  await admin.getByRole('button', { name: /^Images/ }).click()
  await admin.getByRole('button', { name: `Review ${input.storeName}` }).click()
  await expect(admin.getByText('Rejected gallery replacement', { exact: true })).toBeVisible()
  await admin.getByLabel('Decision reason').fill('Image does not match this exact storefront slot.')
  await admin.getByRole('button', { name: 'Reject', exact: true }).click()
  await admin.getByRole('button', { name: 'Confirm reject', exact: true }).click()
  await expect(admin.getByText(/is rejected/i)).toBeVisible()
  await expect(oldPublic.getByRole('img', { name: input.target.altText })).toBeVisible()

  // A fresh Owner session retries the unchanged version after rejection.
  const retryOwner = await browser.newPage()
  await openOwnerPhotos(retryOwner)
  await retryOwner.getByRole('button', { name: /Replace.*Approved gallery image one/i }).click()
  await retryOwner.getByLabel('Official image file').setInputFiles({
    name: 'approved-replacement.png',
    mimeType: 'image/png',
    buffer: imagePng,
  })
  await retryOwner.getByLabel('Alternative text', { exact: true }).fill('Approved gallery replacement')
  await retryOwner.getByLabel(/I confirm that I have rights to publish this image/i).check()
  await retryOwner.getByRole('button', { name: 'Submit replacement for review' }).click()
  await expect(retryOwner.getByRole('status')).toContainText(/awaiting Administrator review/i)
  const approvedUploadId = pendingUploadId
  if (!approvedUploadId || approvedUploadId === firstUploadId)
    throw new Error('Retry must create a distinct replacement submission')

  await admin.goto('/admin')
  await expect(admin.getByRole('heading', { name: 'Review queue' })).toBeVisible()
  await admin.getByRole('button', { name: /^Images/ }).click()
  await admin.getByRole('button', { name: `Review ${input.storeName}` }).click()
  await expect(admin.getByText('Approved gallery replacement', { exact: true })).toBeVisible()
  await admin.getByLabel('Decision reason').fill('Replacement matches the exact storefront slot.')
  await admin.getByRole('button', { name: 'Approve', exact: true }).click()
  await admin.getByRole('button', { name: 'Confirm approve', exact: true }).click()
  await expect(admin.getByText(/is approved/i)).toBeVisible()

  await expect(oldPublic.getByRole('img', { name: input.target.altText })).toBeVisible()
  expect(
    scalar(`select asset_path from app_public.store_media where id='${input.target.mediaId}';`),
  ).toBe(`/assets/issue580-current-gallery-1.webp`)
  publishReplacement(approvedUploadId)
  expect(
    scalar(`select id::text||':'||version::text from app_public.store_media where id='${input.target.mediaId}';`),
  ).toBe(`${input.target.mediaId}:3`)
  expect(submittedVersions).toEqual([1, 2, 2])

  const published = await browser.newPage()
  await published.goto(`/stores/${input.storeSlug}`)
  await expect(published.getByRole('img', { name: 'Approved gallery replacement' })).toBeVisible()
  await expect(published.getByRole('img', { name: input.target.altText })).toHaveCount(0)
  await published.screenshot({ path: `${input.output}/issue-580-publication.png`, fullPage: true })
})
