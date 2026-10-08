import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createLocalService, loopbackRequest } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(fs.readFileSync(process.env.ISSUE_568_PRIVATE_STOP_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
const owner = uuid(input.users[0].id)
const areaId = '00000000-0000-4000-8000-000000000001'
const metadataPath = process.env.ISSUE_568_PRIVATE_STOP_BROWSER_META!
let externalSourceRequestCount = 0
let sourceProbeArmed = false

function uuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    throw new Error('Invalid fixture identity')
  return value
}

async function installSourceProbe(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '127.0.0.1') {
      externalSourceRequestCount += 1
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  sourceProbeArmed = true
}

async function fixture() {
  const id = crypto.randomUUID()
  await service.sql(
    `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${id}','${owner}','${areaId}','Private stop proof','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${id}','${owner}','creator');`,
  )
  return id
}

async function login(page: Page, actor = 0, target = '/trips') {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(input.users[actor].email)
  await page.getByLabel('Password', { exact: true }).fill(input.users[actor].password)
  const response = page.waitForResponse((result) =>
    result.url().includes('/auth/v1/token?grant_type=password'),
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const token = (await (await response).json()).access_token
  expect(typeof token).toBe('string')
  expect(token).toBeTruthy()
  await expect(page).not.toHaveURL(/\/auth\/sign-in/)
  return token as string
}

function rpc(token: string, name: string, body: object) {
  return loopbackRequest(input.endpoint, `/rest/v1/rpc/${name}`, {
    key: input.anonKey,
    token,
    schema: 'app_public',
    body,
  })
}

async function readTripVersion(tripId: string) {
  const value = await service.sql(
    `select version::text from trip_private.trips where trip_id='${uuid(tripId)}';`,
  )
  return Number(value.trim())
}

async function readPrivateStop(tripId: string) {
  const value = await service.sql(
    `select jsonb_build_object('id',stop_id::text,'name',private_name,'address',private_address,'sourceUrl',private_source_url,'hours',private_hours,'priority',priority,'dwell',planned_dwell_minutes,'destination',destination_status)::text from trip_private.trip_stops where trip_id='${uuid(tripId)}' and kind='private';`,
  )
  return value.trim() ? JSON.parse(value.trim()) : null
}

async function addPrivateStop(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add a private shop', exact: true }).click()
  await page.getByLabel('Private shop name', { exact: true }).fill(name)
  await page.getByLabel('Private shop address', { exact: true }).fill('123 Local Example St')
  await page.getByRole('button', { name: 'Save private shop', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: `Private shop: ${name}`, exact: true }),
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await installSourceProbe(page)
})

test.afterAll(() => {
  fs.writeFileSync(metadataPath, JSON.stringify({ sourceProbeArmed, externalSourceRequestCount }), {
    flag: 'wx',
    mode: 0o600,
  })
})

test('owner-save-reopen', async ({ page }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  await page.getByRole('button', { name: 'Add a private shop', exact: true }).click()
  await page.getByLabel('Private shop name', { exact: true }).fill('Local Cabinet Shop')
  await page.getByLabel('Private shop address', { exact: true }).fill('123 Local Example St')
  await page
    .getByLabel('Private shop source URL', { exact: true })
    .fill('https://private-shop.example.invalid/info')
  await page.getByRole('button', { name: 'Add shopper hours', exact: true }).click()
  await page.getByLabel('Hours time zone', { exact: true }).fill('America/Chicago')
  for (const day of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday'])
    await page.getByLabel(`Closed on ${day}`, { exact: true }).check()
  await page.getByRole('button', { name: 'Add interval for Thursday', exact: true }).click()
  await page.getByLabel('Thursday opens', { exact: true }).fill('09:00')
  await page.getByLabel('Thursday closes', { exact: true }).fill('17:00')
  await page.getByRole('button', { name: 'Add holiday hours', exact: true }).click()
  await page.getByLabel('Holiday date', { exact: true }).fill('2099-12-25')
  await page.getByLabel('Holiday name', { exact: true }).fill('Winter Market Holiday')
  await page.getByLabel('Closed for this holiday', { exact: true }).check()
  await page.getByRole('button', { name: 'Add temporary closure', exact: true }).click()
  await page.getByLabel('Closure start date', { exact: true }).fill('2099-12-31')
  await page.getByLabel('Closure end date', { exact: true }).fill('2100-01-02')
  await page.getByLabel('Closure note', { exact: true }).fill('Annual inventory')
  await page.getByLabel('Private shop priority', { exact: true }).selectOption('must')
  await page.getByLabel('Private shop dwell minutes', { exact: true }).fill('75')
  await page.getByRole('button', { name: 'Save private shop', exact: true }).click()

  await expect(
    page.getByRole('heading', { name: 'Private shop: Local Cabinet Shop' }),
  ).toBeVisible()
  const saved = await readPrivateStop(tripId)
  expect(saved).toMatchObject({
    name: 'Local Cabinet Shop',
    address: '123 Local Example St',
    sourceUrl: 'https://private-shop.example.invalid/info',
    priority: 'must',
    dwell: 75,
    destination: 'draft',
  })
  expect(saved.hours.timeZone).toBe('America/Chicago')
  expect(saved.hours.weekly).toHaveLength(7)
  expect(saved.hours.weekly.find((day: { weekday: number }) => day.weekday === 4)).toMatchObject({
    isClosed: false,
    intervals: [{ opensAt: '09:00', closesAt: '17:00' }],
  })
  expect(
    saved.hours.weekly
      .filter((day: { weekday: number }) => day.weekday !== 4)
      .every(
        (day: { isClosed: boolean; intervals: unknown[] }) =>
          day.isClosed && day.intervals.length === 0,
      ),
  ).toBe(true)
  expect(saved.hours.holidays).toEqual([
    {
      localDate: '2099-12-25',
      label: 'Winter Market Holiday',
      isClosed: true,
      intervals: [],
    },
  ])
  expect(saved.hours.temporaryClosure).toEqual({
    startDate: '2099-12-31',
    endDate: '2100-01-02',
    reason: 'Annual inventory',
  })
  const stopId = saved.id

  await page.getByRole('button', { name: 'Confirm exact address for Local Cabinet Shop' }).click()
  await expect(page.getByText('Address confirmed by you.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Address confirmed by you.', { exact: true })).toBeVisible()
  expect((await readPrivateStop(tripId)).id).toBe(stopId)

  await page.getByRole('button', { name: 'Edit private shop: Local Cabinet Shop' }).click()
  await page
    .getByLabel('Private shop address for Local Cabinet Shop', { exact: true })
    .fill('456 Local Example St')
  await page.getByRole('button', { name: 'Save changes to Local Cabinet Shop' }).click()
  await expect(
    page.getByText('Address is a draft until you confirm the exact text.', { exact: true }),
  ).toBeVisible()
  const edited = await readPrivateStop(tripId)
  expect(edited.id).toBe(stopId)
  expect(edited.address).toBe('456 Local Example St')
  expect(edited.destination).toBe('draft')
  expect(edited.hours).toEqual(saved.hours)
})

test('unknown-hours', async ({ page }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  await page.getByRole('button', { name: 'Add a private shop', exact: true }).click()
  await page.getByLabel('Private shop name', { exact: true }).fill('Unknown Hours Shop')
  await page.getByRole('button', { name: 'Save private shop', exact: true }).click()
  await expect(page.getByText('Shopper hours: Not provided', { exact: true })).toBeVisible()
  expect(await readPrivateStop(tripId)).toMatchObject({ hours: null })
})

test('cancel-no-rpc', async ({ page }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  const mutations: string[] = []
  const observeMutation = (request: import('@playwright/test').Request) => {
    const match = request
      .url()
      .match(
        /\/rest\/v1\/rpc\/(add_private_trip_stop|update_private_trip_stop|confirm_trip_stop_destination|remove_trip_stop)$/,
      )
    if (request.method() === 'POST' && match) mutations.push(match[1])
  }
  page.on('request', observeMutation)
  const beforeVersion = await readTripVersion(tripId)
  await page.getByRole('button', { name: 'Add a private shop', exact: true }).click()
  await page.getByLabel('Private shop name', { exact: true }).fill('Canceled Shop')
  await page.getByLabel('Private shop address', { exact: true }).fill('123 Canceled Example St')
  await page.getByRole('button', { name: 'Cancel adding private shop', exact: true }).click()
  await expect(page.getByLabel('Private shop name', { exact: true })).toHaveCount(0)
  page.off('request', observeMutation)
  expect(mutations).toEqual([])
  expect(await readTripVersion(tripId)).toBe(beforeVersion)
  expect(await readPrivateStop(tripId)).toBeNull()
})

test('committed-response-lost-retry', async ({ page }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  const keys: string[] = []
  let loseFirstResponse = true
  await page.route('**/rest/v1/rpc/add_private_trip_stop', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    keys.push(route.request().postDataJSON().idempotency_key)
    if (!loseFirstResponse) {
      await route.continue()
      return
    }
    loseFirstResponse = false
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Add a private shop', exact: true }).click()
  await page.getByLabel('Private shop name', { exact: true }).fill('Retry Shop')
  await page.getByLabel('Private shop address', { exact: true }).fill('123 Retry Example St')
  await page.getByRole('button', { name: 'Save private shop', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Private shop name', { exact: true })).toHaveValue('Retry Shop')
  await expect(page.getByLabel('Private shop address', { exact: true })).toHaveValue(
    '123 Retry Example St',
  )
  await page.getByRole('button', { name: /^retry$/i }).click()
  await expect(page.getByRole('heading', { name: 'Private shop: Retry Shop' })).toBeVisible()
  expect(keys).toHaveLength(2)
  expect(keys[1]).toBe(keys[0])
  expect(keys[0]).toMatch(/^add_private_trip_stop:/)
  expect(await readPrivateStop(tripId)).toMatchObject({ name: 'Retry Shop' })
  expect(await readTripVersion(tripId)).toBe(2)
})

test('stale-version', async ({ page }) => {
  const tripId = await fixture()
  const ownerToken = await login(page, 0, `/trips/${tripId}/plan`)
  await addPrivateStop(page, 'Stale Guard Shop')
  const before = await readPrivateStop(tripId)
  const version = await readTripVersion(tripId)
  const winningTrip = await rpc(ownerToken, 'set_trip_stop_priority', {
    trip_id: tripId,
    stop_id: before.id,
    priority: 'flexible',
    expected_version: version,
  })
  expect(winningTrip.version).toBe(version + 1)
  await page.getByRole('button', { name: 'Edit private shop: Stale Guard Shop' }).click()
  const address = page.getByLabel('Private shop address for Stale Guard Shop', { exact: true })
  await address.fill('456 Draft Example St')
  const staleResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rest/v1/rpc/update_private_trip_stop'),
  )
  await page.getByRole('button', { name: 'Save changes to Stale Guard Shop' }).click()
  expect([400, 409]).toContain((await staleResponse).status())
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(address).toHaveValue('456 Draft Example St')
  const afterConflict = await readPrivateStop(tripId)
  expect(afterConflict.id).toBe(before.id)
  expect(afterConflict.address).toBe(before.address)
  expect(afterConflict.priority).toBe('flexible')
  expect(await readTripVersion(tripId)).toBe(version + 1)
  await page.reload()
  await expect(page.getByLabel('Priority for Stale Guard Shop', { exact: true })).toHaveValue(
    'flexible',
  )
})

test('user-b-denied-list-read-edit', async ({ page, browser }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  await addPrivateStop(page, 'Owner Only Shop')
  const stop = await readPrivateStop(tripId)
  const version = await readTripVersion(tripId)
  const before = stop
  const context = await browser.newContext({ baseURL: input.origin })
  try {
    const otherPage = await context.newPage()
    await installSourceProbe(otherPage)
    const otherToken = await login(otherPage, 1, '/trips')
    await expect(otherPage.getByText('No trips yet.', { exact: true })).toBeVisible()
    await expect(otherPage.getByText('Owner Only Shop', { exact: true })).toHaveCount(0)
    await expect(rpc(otherToken, 'get_trip', { trip_id: tripId })).rejects.toThrow(
      /401|403|authorization_lost|not_allowed/,
    )
    await expect(
      rpc(otherToken, 'update_private_trip_stop', {
        trip_id: tripId,
        stop_id: stop.id,
        name: stop.name,
        address: stop.address,
        source_url: stop.sourceUrl,
        hours: stop.hours,
        priority: 'flexible',
        planned_dwell_minutes: stop.dwell,
        expected_version: version,
        idempotency_key: `update_private_trip_stop:denied-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow(/401|403|authorization_lost|not_allowed/)
    await otherPage.goto(`/trips/${tripId}/plan`)
    await expect(
      otherPage.getByRole('heading', { name: 'Trip unavailable', exact: true }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
  expect(await readPrivateStop(tripId)).toEqual(before)
  expect(await readTripVersion(tripId)).toBe(version)
})

test('owner-remove', async ({ page }) => {
  const tripId = await fixture()
  await login(page, 0, `/trips/${tripId}/plan`)
  await addPrivateStop(page, 'Removal Shop')
  const stop = await readPrivateStop(tripId)
  const request = page.waitForRequest((result) =>
    result.url().endsWith('/rest/v1/rpc/remove_trip_stop'),
  )
  const response = page.waitForResponse((result) =>
    result.url().endsWith('/rest/v1/rpc/remove_trip_stop'),
  )
  await page.getByRole('button', { name: 'Remove Removal Shop', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, remove Removal Shop', exact: true }).click()
  expect((await request).postDataJSON()).toMatchObject({
    trip_id: tripId,
    stop_id: stop.id,
    expected_version: 2,
  })
  expect((await response).ok()).toBe(true)
  await expect(
    page.getByRole('heading', { name: 'Removal Shop — prefer, 60 minutes, planned' }),
  ).toHaveCount(0)
  expect(await readPrivateStop(tripId)).toBeNull()
  expect(await readTripVersion(tripId)).toBe(3)
})
