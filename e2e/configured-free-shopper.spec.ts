import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createLocalService, loopbackRequest } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(fs.readFileSync(process.env.CONFIGURED_SHOPPER_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
const A = '00000000-0000-4000-8000-000000001001'
const B = '00000000-0000-4000-8000-000000001002'
const uuid = (value: string) => {
  if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error('Invalid fixture UUID')
  return value
}
const owner = uuid(input.users[0].id)
const rpc = (token: string, name: string, body: object) =>
  loopbackRequest(input.endpoint, `/rest/v1/rpc/${name}`, {
    key: input.anonKey,
    token,
    schema: 'app_public',
    body,
  })
const saved = () =>
  service
    .sql(
      `select count(*) from shopper_private.saved_stores where user_id='${owner}' and store_id='${A}';`,
    )
    .then((s: string) => Number(s.trim()))
const read = (id: string) =>
  service
    .sql(
      `select json_build_object('name',t.name,'date',t.local_date,'stops',coalesce((select json_agg(json_build_object('store',s.store_id,'priority',s.priority,'dwell',s.planned_dwell_minutes) order by s.position) from trip_private.trip_stops s where s.trip_id=t.trip_id),'[]'::json)) from trip_private.trips t where t.trip_id='${uuid(id)}';`,
    )
    .then((s: string) => JSON.parse(s.trim()))
async function login(page: Page, actor = 0, target = '/stores') {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(target)}`)
  return submitLogin(page, actor)
}
async function submitLogin(page: Page, actor = 0) {
  await page.getByLabel('Email', { exact: true }).fill(input.users[actor].email)
  await page.getByLabel('Password', { exact: true }).fill(input.users[actor].password)
  const response = page.waitForResponse((r) =>
    r.url().includes('/auth/v1/token?grant_type=password'),
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const token = (await (await response).json()).access_token
  expect(typeof token).toBe('string')
  await expect(page).not.toHaveURL(/\/auth\/sign-in/)
  return token as string
}
async function fixture() {
  const id = crypto.randomUUID()
  await service.sql(
    `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${id}','${owner}','00000000-0000-4000-8000-000000000001','Independent browser trip','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${id}','${owner}','creator'); insert into trip_private.trip_stops(trip_id,kind,store_id,position,priority,planned_dwell_minutes) values ('${id}','store','${A}',0,'prefer',60),('${id}','store','${B}',1,'prefer',60);`,
  )
  return id
}
test.beforeEach(async () => {
  await service.sql(
    `delete from shopper_private.saved_stores where user_id in ('${owner}','${uuid(input.users[1].id)}');`,
  )
})

test('anonymous discovery, permitted photo and JIT save context return', async ({ page }) => {
  await page.goto('/stores')
  await page.getByRole('link', { name: 'Clockwork Cabinet', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clockwork Cabinet' })).toBeVisible()
  const photo = page
    .getByRole('img', { name: /Illustrated synthetic cover for Clockwork Cabinet/ })
    .first()
  await expect(photo).toBeVisible()
  expect(
    await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
  await page.getByRole('link', { name: 'Sign in to save store', exact: true }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  expect(await saved()).toBe(0)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await submitLogin(page)
  await expect.poll(saved).toBe(1)
  await expect(page).toHaveURL(/\/stores\/clockwork-cabinet$/)
})

test('JIT trip entry, authenticated catalog, photo, save and two-store creation', async ({
  page,
}) => {
  await page.goto(`/trips/new?addStoreId=${A}`)
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your email and password')
  await submitLogin(page)
  await expect(page).toHaveURL(new RegExp(`/trips/new\\?addStoreId=${A}`))
  await expect(page.getByRole('heading', { name: 'Add to Trip', exact: true })).toBeVisible()
  await page.goto('/stores')
  await page.getByRole('link', { name: 'Clockwork Cabinet', exact: true }).first().click()
  const photo = page
    .getByRole('img', { name: /Illustrated synthetic cover for Clockwork Cabinet/ })
    .first()
  await expect(photo).toBeVisible()
  expect(
    await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
  await page.getByRole('button', { name: 'Save store', exact: true }).click()
  const choices = page.getByRole('group', { name: 'Choose a store photo' }).getByRole('button')
  await expect(choices).toHaveCount(2)
  await choices.nth(1).click()
  const gallery = page
    .getByRole('img', {
      name: 'Synthetic antique cabinet scene for Clockwork Cabinet',
      exact: true,
    })
    .first()
  await expect(gallery).toBeVisible()
  expect(
    await gallery.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
  const enlarge = page.getByRole('button', { name: /Enlarge image:/ })
  await enlarge.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(enlarge).toBeFocused()
  await expect.poll(saved).toBe(process.env.CONFIGURED_SHOPPER_WRONG_READBACK === '1' ? 2 : 1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Remove saved store', exact: true })).toBeVisible()
  await page.goto('/saved')
  await expect(page.getByRole('link', { name: 'Clockwork Cabinet', exact: true })).toBeVisible()
  await page.goto('/stores/clockwork-cabinet')
  await page.getByRole('link', { name: 'Add to Trip', exact: true }).click()
  const name = `Browser journey ${crypto.randomUUID().slice(0, 8)}`
  await page.getByLabel('Trip name', { exact: true }).fill(name)
  await page.getByLabel('Date', { exact: true }).fill('2026-10-10')
  await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
  await page.getByRole('link', { name: 'View Trip', exact: true }).click()
  const id = uuid(page.url().split('/trips/')[1].split('/')[0])
  expect((await read(id)).stops.map((s: { store: string }) => s.store)).toEqual([A])
  await page.goto('/stores/prairie-patina')
  await page.getByRole('link', { name: 'Add to Trip', exact: true }).click()
  await page.getByRole('button', { name: `Add to ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'View Trip', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('Ordered trip stops').locator('li')).toHaveCount(2)
  expect((await read(id)).stops.map((s: { store: string }) => s.store)).toEqual([A, B])
})

for (const edit of ['date', 'order', 'priority', 'dwell', 'removal']) {
  test(`independent persisted ${edit} edit with keyboard and reload`, async ({ page }) => {
    const id = await fixture()
    await login(page, 0, `/trips/${id}/plan`)
    await expect(page.getByLabel('Ordered trip stops').locator('li')).toHaveCount(2)
    if (edit === 'date') {
      await page.getByLabel('Trip date', { exact: true }).fill('2026-10-11')
      await page.getByRole('button', { name: 'Update schedule' }).focus()
      await expect(page.getByRole('button', { name: 'Update schedule' })).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await read(id)).date).toBe('2026-10-11')
    } else if (edit === 'order') {
      const button = page.getByRole('button', { name: 'Move Prairie Patina up' })
      await button.focus()
      await expect(button).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(async () => (await read(id)).stops[0].store).toBe(B)
    } else if (edit === 'priority') {
      await page.getByLabel('Priority for Clockwork Cabinet').selectOption('must')
      await expect.poll(async () => (await read(id)).stops[0].priority).toBe('must')
    } else if (edit === 'dwell') {
      await page.getByLabel('Dwell minutes for Clockwork Cabinet').fill('90')
      await page.getByLabel('Dwell minutes for Clockwork Cabinet').press('Tab')
      await expect.poll(async () => (await read(id)).stops[0].dwell).toBe(90)
    } else {
      const remove = page.getByRole('button', { name: 'Remove Clockwork Cabinet', exact: true })
      await remove.click()
      await page.getByRole('button', { name: 'Keep Clockwork Cabinet', exact: true }).click()
      await expect(remove).toBeFocused()
      expect((await read(id)).stops).toHaveLength(2)
      await remove.press('Enter')
      await page.getByRole('button', { name: 'Yes, remove Clockwork Cabinet', exact: true }).click()
      await expect
        .poll(async () => (await read(id)).stops.map((s: { store: string }) => s.store))
        .toEqual([B])
    }
    await page.reload()
    await expect(page.getByLabel('Ordered trip stops').locator('li')).toHaveCount(
      edit === 'removal' ? 1 : 2,
    )
    if (edit === 'date')
      await expect(page.getByLabel('Trip date', { exact: true })).toHaveValue('2026-10-11')
    if (edit === 'order' || edit === 'removal')
      await expect(page.getByLabel('Ordered trip stops').locator('li').first()).toContainText(
        'Prairie Patina',
      )
    if (edit === 'priority')
      await expect(page.getByLabel('Priority for Clockwork Cabinet')).toHaveValue('must')
    if (edit === 'dwell')
      await expect(page.getByLabel('Dwell minutes for Clockwork Cabinet')).toHaveValue('90')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('sibling context, sign-out, and account switch deny private trip reads and writes', async ({
  page,
  browser,
}) => {
  const id = await fixture()
  const before = await read(id)
  await service.sql(
    `insert into shopper_private.saved_stores(user_id,store_id) values ('${owner}','${A}');`,
  )
  await login(page, 0, `/trips/${id}/plan`)
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue(before.name)
  const sibling = await browser.newContext({ baseURL: input.origin })
  try {
    const other = await sibling.newPage()
    const token = await login(other, 1, '/saved')
    await expect(other.getByText('You have no saved stores yet.', { exact: true })).toBeVisible()
    await expect(other.getByRole('link', { name: 'Clockwork Cabinet', exact: true })).toHaveCount(0)
    await other.goto(`/trips/${id}/plan`)
    await expect(
      other.getByRole('heading', { name: 'Trip unavailable', exact: true }),
    ).toBeVisible()
    await expect(rpc(token, 'get_trip', { trip_id: id })).rejects.toThrow(
      /401|403|authorization_lost|not_allowed/,
    )
    await expect(other.getByLabel('Trip name', { exact: true })).toHaveCount(0)
    await expect(
      rpc(token, 'rename_trip', {
        trip_id: id,
        new_name: 'Unauthorized',
        expected_version: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/401|403|authorization_lost|not_allowed/)
    await rpc(token, 'shopper_set_save', { p_store_id: A, p_saved: false })
    expect(await saved()).toBe(1)
    expect(await read(id)).toEqual(before)
  } finally {
    await sibling.close()
  }
  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await page.goto(`/trips/${id}/plan`)
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await login(page, 1, '/saved')
  await expect(page.getByText('You have no saved stores yet.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Clockwork Cabinet', exact: true })).toHaveCount(0)
  await page.goto(`/trips/${id}/plan`)
  await expect(page.getByRole('heading', { name: 'Trip unavailable', exact: true })).toBeVisible()
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveCount(0)
  expect(await read(id)).toEqual(before)
})

test('revoked session denies next UI mutation with feedback and unchanged backend', async ({
  page,
}) => {
  const id = await fixture()
  await login(page, 0, `/trips/${id}/plan`)
  await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue(
    'Independent browser trip',
  )
  const before = await read(id)
  await service.sql(
    `update app_private.active_sessions set state='revoked',revoked_at=now(),revocation_reason='Local browser test' where user_id='${owner}' and state='active';`,
  )
  await page.getByLabel('Trip name', { exact: true }).fill('Revoked attempt')
  const denied = page.waitForResponse((r) => r.url().endsWith('/rest/v1/rpc/rename_trip'))
  await page.getByRole('button', { name: 'Rename trip', exact: true }).click()
  const result = await denied
  expect([400, 401, 403]).toContain(result.status())
  expect(await result.text()).toMatch(/authorization_lost|not_allowed|session.*(revoked|inactive)/)
  await expect(page.getByRole('alert').first()).toBeVisible()
  expect(await read(id)).toEqual(before)
})
