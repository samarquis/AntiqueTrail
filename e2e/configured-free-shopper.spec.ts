import { expect, test, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createLocalService, loopbackRequest } from '../scripts/configured-shopper-local.mjs'
import { classifyConfiguredShopperRoute } from '../scripts/configured-free-shopper-report.mjs'

const input = JSON.parse(fs.readFileSync(process.env.CONFIGURED_SHOPPER_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
const A = '00000000-0000-4000-8000-000000001001'
const B = '00000000-0000-4000-8000-000000001002'
const routeObservationType = 'configured-route-observation-v1'
const keyedTripTitle = 'keyed trip create replays after committed response loss'
const signoutTitle =
  'sibling context, sign-out, and account switch deny private trip reads and writes'
const uuid = (value: string) => {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
    throw new Error('Invalid fixture UUID')
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
async function rejectsEmptySignIn(page: Page) {
  const authRequests: string[] = []
  const record = (request: import('@playwright/test').Request) => {
    if (request.url().includes('/auth/v1/token')) authRequests.push(request.url())
  }
  page.on('request', record)
  try {
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(
      'Enter your email and password to continue.',
    )
    await expect(page.getByRole('alert')).toBeFocused()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    expect(authRequests).toEqual([])
  } finally {
    page.off('request', record)
  }
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

type RouteObservationCheckpoint =
  | 'keyed-return-heading'
  | 'signout-initial-plan'
  | 'signout-return-plan'

function captureRouteObservation(
  page: Page,
  checkpoint: RouteObservationCheckpoint,
  repetition: number | undefined,
) {
  try {
    return classifyConfiguredShopperRoute(page.url(), checkpoint, repetition)
  } catch {
    return {
      version: 1,
      checkpoint,
      ...(checkpoint === 'signout-return-plan' ? { repetition } : {}),
      capture: 'unavailable',
    }
  }
}

async function assertWithRouteObservation(
  page: Page,
  testInfo: TestInfo,
  checkpoint: RouteObservationCheckpoint,
  repetition: number | undefined,
  assertion: () => Promise<void>,
) {
  try {
    await assertion()
  } catch (originalError) {
    const correctCase =
      (checkpoint === 'keyed-return-heading' && testInfo.title === keyedTripTitle) ||
      (checkpoint !== 'keyed-return-heading' && testInfo.title === signoutTitle)
    const correctProject = ['desktop', 'phone'].includes(testInfo.project.name)
    const alreadyObserved = testInfo.annotations.some(
      (annotation) => annotation.type === routeObservationType,
    )
    if (correctCase && correctProject && !alreadyObserved) {
      const observation = captureRouteObservation(page, checkpoint, repetition)
      try {
        testInfo.annotations.push({
          type: routeObservationType,
          description: JSON.stringify(observation),
        })
      } catch {
        // Preserve the original assertion failure if annotation capture is unavailable.
      }
    }
    throw originalError
  }
}

async function fixture() {
  const id = crypto.randomUUID()
  await service.sql(
    `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${id}','${owner}','00000000-0000-4000-8000-000000000001','Independent browser trip','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${id}','${owner}','creator'); insert into trip_private.trip_stops(trip_id,kind,store_id,position,priority,planned_dwell_minutes) values ('${id}','store','${A}',0,'prefer',60),('${id}','store','${B}',1,'prefer',60);`,
  )
  return id
}

async function acceptedPartnerFixture() {
  const id = crypto.randomUUID()
  const partner = uuid(input.users[1].id)
  await service.sql(
    `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${id}','${owner}','00000000-0000-4000-8000-000000000001','Partner removal trip','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${id}','${owner}','creator'),('${id}','${partner}','partner'); insert into trip_private.trip_device_bindings(trip_id,user_id,device_hash,session_security_version) values ('${id}','${partner}',extensions.digest(convert_to('partner-device','utf8'),'sha256'),1); update trip_private.trips set navigator_user_id='${partner}',navigator_device_hash=extensions.digest(convert_to('partner-device','utf8'),'sha256') where trip_id='${id}';`,
  )
  return id
}
test.beforeEach(async () => {
  await service.sql(
    `delete from shopper_private.saved_stores where user_id in ('${owner}','${uuid(input.users[1].id)}');`,
  )
})

test('creator removes an accepted partner through configured transport', async ({
  page,
  browser,
}) => {
  const id = await acceptedPartnerFixture()
  const partnerId = uuid(input.users[1].id)
  const activeMembership = () =>
    service
      .sql(
        `select count(*) from trip_private.trip_participants where trip_id='${uuid(id)}' and user_id='${partnerId}' and state='active';`,
      )
      .then((value: string) => Number(value.trim()))

  await login(page, 0, `/trips/${id}/invite`)
  const remove = page.getByRole('button', { name: 'Remove partner', exact: true })
  await expect(remove).toBeVisible()
  await remove.focus()
  await page.keyboard.press('Enter')
  const keepPartner = page.getByRole('button', { name: 'Keep Trip partner', exact: true })
  await expect(keepPartner).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(remove).toBeFocused()
  expect(await activeMembership()).toBe(1)

  await page.keyboard.press('Enter')
  await expect(keepPartner).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('button', { name: 'Yes, remove Trip partner', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  const status = page.getByRole('status').filter({ hasText: 'Trip partner was removed' })
  await expect(status).toContainText('Trip paused — assign a Navigator.')
  await expect(status).toBeFocused()
  await expect.poll(activeMembership).toBe(0)
  await expect(page.getByText('Trip partner — partner')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])

  const partnerContext = await browser.newContext({ baseURL: input.origin })
  try {
    const partnerPage = await partnerContext.newPage()
    const partnerToken = await login(partnerPage, 1, '/trips')
    await partnerPage.goto(`/trips/${id}/plan`)
    await expect(
      partnerPage.getByRole('heading', { name: 'Trip unavailable', exact: true }),
    ).toBeVisible()
    await expect(rpc(partnerToken, 'get_trip', { trip_id: id })).rejects.toThrow(
      /401|403|authorization_lost|not_allowed/,
    )
  } finally {
    await partnerContext.close()
  }
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
  await page.getByRole('link', { name: /save clockwork cabinet.*requires sign-in/i }).click()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  expect(await saved()).toBe(0)
  await rejectsEmptySignIn(page)
  await submitLogin(page)
  await expect.poll(saved).toBe(1)
  await expect(page).toHaveURL(/\/stores\/clockwork-cabinet$/)
})

test('JIT trip entry, authenticated catalog, photo, save and two-store creation', async ({
  page,
}) => {
  await page.goto(`/trips/new?addStoreId=${A}`)
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await rejectsEmptySignIn(page)
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
  await page.getByRole('button', { name: 'Save store Clockwork Cabinet', exact: true }).click()
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
  await expect(
    page.getByRole('button', { name: 'Remove saved store Clockwork Cabinet', exact: true }),
  ).toBeVisible()
  await expect(photo).toBeVisible()
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
  await choices.nth(1).click()
  await expect(gallery).toBeVisible()
  await expect
    .poll(() => gallery.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
  await page.goto('/saved')
  await expect(page.getByRole('link', { name: 'Clockwork Cabinet', exact: true })).toBeVisible()
  await page.goto(`/trips/new?addStoreId=${A}`)
  const name = `Browser journey ${crypto.randomUUID().slice(0, 8)}`
  await page.getByLabel('Trip name', { exact: true }).fill(name)
  await page.getByLabel('Date', { exact: true }).fill('2026-10-10')
  await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
  await page.getByRole('link', { name: 'View Trip', exact: true }).click()
  const id = uuid(page.url().split('/trips/')[1].split('/')[0])
  expect((await read(id)).stops.map((s: { store: string }) => s.store)).toEqual([A])
  await page.goto(`/trips/new?addStoreId=${B}`)
  await page.getByRole('button', { name: `Add to ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'View Trip', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('Ordered trip stops').locator('li')).toHaveCount(2)
  expect((await read(id)).stops.map((s: { store: string }) => s.store)).toEqual([A, B])
})

test('keyed trip create replays after committed response loss', async ({
  page,
  browser,
}, testInfo) => {
  const name = 'Keyed response-loss trip'
  const localDate = '2030-10-12'
  const ownerTripCount = async () =>
    Number(
      (
        await service.sql(`select count(*) from trip_private.trips where owner_id='${owner}';`)
      ).trim(),
    )
  const tripBaseline = await ownerTripCount()
  let createKey = ''
  let firstTripId = ''
  let requestBody: Record<string, unknown> | undefined
  let createAttempts = 0
  let stopAttempts = 0
  let firstOutcome = 'pending'
  let firstFailureStage = ''
  let secondOutcome = 'pending'
  let secondFailureStage = ''
  let finishFirst!: () => void
  let finishSecond!: () => void
  const firstHandled = new Promise<void>((resolve) => (finishFirst = resolve))
  const secondHandled = new Promise<void>((resolve) => (finishSecond = resolve))
  const withTimeout = async (promise: Promise<void>, label: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(label)), 20_000)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  const proof = async (tripId: string) => {
    const result = await service.sql(`
      select json_build_object(
        'id', t.trip_id,
        'owner', t.owner_id,
        'name', t.name,
        'date', t.local_date,
        'receiptCount', (select count(*) from trip_private.trip_create_receipts r
          where r.actor_user_id=t.owner_id and r.idempotency_key='${createKey}' and r.trip_id=t.trip_id),
        'creatorCount', (select count(*) from trip_private.trip_participants p
          where p.trip_id=t.trip_id and p.user_id=t.owner_id
            and p.participant_role='creator' and p.state='active'),
        'stops', coalesce((select json_agg(json_build_object('store',s.store_id) order by s.position)
          from trip_private.trip_stops s where s.trip_id=t.trip_id), '[]'::json),
        'ownerTripCount', (select count(*) from trip_private.trips own where own.owner_id=t.owner_id)
      )
      from trip_private.trips t where t.trip_id='${uuid(tripId)}';
    `)
    return JSON.parse(result.trim()) as {
      id: string
      owner: string
      name: string
      date: string
      receiptCount: number
      creatorCount: number
      stops: { store: string }[]
      ownerTripCount: number
    } | null
  }
  const onRequest = (request: import('@playwright/test').Request) => {
    const url = new URL(request.url())
    if (url.origin === input.endpoint && url.pathname === '/rest/v1/rpc/add_trip_store_stop')
      stopAttempts += 1
  }
  const routeHandler = async (route: import('@playwright/test').Route) => {
    createAttempts += 1
    const attempt = createAttempts
    let stage = 'request-validation'
    try {
      const request = route.request()
      const body = request.postDataJSON() as Record<string, unknown>
      const destination = new URL('/rest/v1/rpc/create_trip', input.endpoint).href
      if (
        request.method() !== 'POST' ||
        request.url() !== destination ||
        Object.keys(body).sort().join(',') !== 'idempotency_key,local_date,name' ||
        body.name !== name ||
        body.local_date !== localDate ||
        typeof body.idempotency_key !== 'string'
      )
        throw new Error('request-invalid')
      const key = uuid(body.idempotency_key)
      if (attempt === 1) {
        createKey = key
        requestBody = { ...body }
        stage = 'receipt-baseline'
        const priorReceipts = Number(
          (
            await service.sql(
              `select count(*) from trip_private.trip_create_receipts where actor_user_id='${owner}' and idempotency_key='${createKey}';`,
            )
          ).trim(),
        )
        if (priorReceipts !== 0) throw new Error('receipt-baseline-invalid')
        stage = 'first-forward'
        const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
        if (!response.ok()) throw new Error('first-forward-failed')
        stage = 'first-response-shape'
        const value = await response.json()
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          value.name !== name ||
          value.localDate !== localDate ||
          !Array.isArray(value.stops)
        )
          throw new Error('first-response-invalid')
        firstTripId = uuid(value.id)
        stage = 'first-commit-readback'
        const committed = await proof(firstTripId)
        if (
          !committed ||
          committed.id !== firstTripId ||
          committed.owner !== owner ||
          committed.name !== name ||
          committed.date !== localDate ||
          committed.receiptCount !== 1 ||
          committed.creatorCount !== 1 ||
          committed.stops.length !== 0 ||
          committed.ownerTripCount !== tripBaseline + 1
        )
          throw new Error('first-commit-readback-invalid')
        stage = 'first-response-drop'
        await route.abort('failed')
        firstOutcome = 'committed-response-dropped'
        return
      }
      if (attempt !== 2 || !requestBody || JSON.stringify(body) !== JSON.stringify(requestBody))
        throw new Error('retry-payload-invalid')
      stage = 'retry-forward'
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 })
      if (!response.ok()) throw new Error('retry-forward-failed')
      stage = 'retry-response-shape'
      const value = await response.json()
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        uuid(value.id) !== firstTripId ||
        value.name !== name ||
        value.localDate !== localDate ||
        !Array.isArray(value.stops)
      )
        throw new Error('retry-response-invalid')
      stage = 'retry-response-fulfill'
      await route.fulfill({ response })
      secondOutcome = 'same-trip-response-fulfilled'
    } catch {
      if (attempt === 1) {
        firstOutcome = 'failed'
        firstFailureStage = stage
      } else {
        secondOutcome = 'failed'
        secondFailureStage = stage
      }
      await route.abort('failed').catch(() => undefined)
    } finally {
      if (attempt === 1) finishFirst()
      if (attempt === 2) finishSecond()
    }
  }

  await login(page, 0, `/trips/new?addStoreId=${A}&returnTo=%2Fsaved`)
  await assertWithRouteObservation(page, testInfo, 'keyed-return-heading', undefined, () =>
    expect(page.getByRole('heading', { name: 'Add to Trip', exact: true })).toBeVisible(),
  )
  await page.route('**/rest/v1/rpc/create_trip', routeHandler)
  page.on('request', onRequest)
  try {
    await page.getByLabel('Trip name', { exact: true }).fill(name)
    await page.getByLabel('Date', { exact: true }).fill(localDate)
    await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
    await withTimeout(firstHandled, 'first create handler timed out')
    expect(firstOutcome, firstFailureStage).toBe('committed-response-dropped')
    await expect(page.getByRole('alert')).toContainText(
      "We couldn't update this trip. Please try again.",
    )
    expect(createAttempts).toBe(1)
    expect(stopAttempts).toBe(0)
    await expect(page.getByLabel('Trip name', { exact: true })).toHaveValue(name)
    await expect(page.getByLabel('Trip name', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Date', { exact: true })).toHaveValue(localDate)
    await expect(page.getByLabel('Date', { exact: true })).toBeDisabled()
    const committed = await proof(firstTripId)
    expect(committed).toMatchObject({
      id: firstTripId,
      owner,
      name,
      date: localDate,
      receiptCount: 1,
      creatorCount: 1,
      stops: [],
      ownerTripCount: tripBaseline + 1,
    })

    await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
    await withTimeout(secondHandled, 'retry create handler timed out')
    expect(secondOutcome, secondFailureStage).toBe('same-trip-response-fulfilled')
    expect(createAttempts).toBe(2)
    await expect(page.getByText(`Added to ${name}`, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'View Trip', exact: true }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByText('Trip date: 2030-10-12', { exact: true })).toBeVisible()
    expect(await read(firstTripId)).toMatchObject({ name, date: localDate, stops: [{ store: A }] })
    expect(stopAttempts).toBe(1)
    const finalState = await proof(firstTripId)
    expect(finalState).toMatchObject({
      id: firstTripId,
      owner,
      name,
      date: localDate,
      receiptCount: 1,
      creatorCount: 1,
      stops: [{ store: A }],
      ownerTripCount: tripBaseline + 1,
    })

    const otherContext = await browser.newContext({ baseURL: input.origin })
    try {
      const otherPage = await otherContext.newPage()
      const otherToken = await login(otherPage, 1, '/trips')
      let denialProved = false
      try {
        await rpc(otherToken, 'get_trip', { trip_id: firstTripId })
      } catch (error) {
        denialProved = error instanceof Error && /\bauthorization_lost\b/.test(error.message)
      }
      expect(denialProved).toBe(true)
      expect(await proof(firstTripId)).toMatchObject(finalState)
      expect(await ownerTripCount()).toBe(tripBaseline + 1)
    } finally {
      await otherContext.close()
    }
  } finally {
    page.off('request', onRequest)
    await page.unroute('**/rest/v1/rpc/create_trip', routeHandler)
  }
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
}, testInfo) => {
  const id = await fixture()
  const before = await read(id)
  await service.sql(
    `insert into shopper_private.saved_stores(user_id,store_id) values ('${owner}','${A}');`,
  )
  let ownerToken = await login(page, 0, `/trips/${id}/plan`)
  await assertWithRouteObservation(page, testInfo, 'signout-initial-plan', undefined, () =>
    expect(page.getByLabel('Trip name', { exact: true })).toHaveValue(before.name),
  )
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
  test.setTimeout(240_000)
  for (let repetition = 0; repetition < 3; repetition++) {
    if (repetition) ownerToken = await login(page, 0, `/trips/${id}/plan`)
    // Leaving sign-in is not proof that the private return route has finished.
    await assertWithRouteObservation(page, testInfo, 'signout-return-plan', repetition, () =>
      expect(page.getByLabel('Trip name', { exact: true })).toHaveValue(before.name),
    )
    await page.goto('/account')
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
    // Hold the actual delete transaction after request success but before commit.
    // All storage operations and Auth/RPC results remain real.
    expect(
      await page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('antique-trail-auth-refresh-v1', 1)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const database = request.result
              const transaction = database.transaction('refresh-material', 'readonly')
              const store = transaction.objectStore('refresh-material')
              transaction.oncomplete = () => database.close()
              transaction.onabort = () => {
                database.close()
                reject(transaction.error)
              }
              const key = store.getKey('current')
              key.onerror = () => reject(key.error)
              key.onsuccess = () => resolve(key.result === 'current')
            }
          }),
      ),
    ).toBe(true)
    await page.evaluate(() => {
      const state = window as Window & {
        releaseSignoutStorage?: () => void
        signoutStorageBlocked?: boolean
      }
      let held = true
      const originalDelete = IDBObjectStore.prototype.delete
      state.releaseSignoutStorage = () => {
        held = false
        IDBObjectStore.prototype.delete = originalDelete
      }
      IDBObjectStore.prototype.delete = function (query) {
        const request = originalDelete.call(this, query)
        if (
          this.transaction.db.name === 'antique-trail-auth-refresh-v1' &&
          this.name === 'refresh-material' &&
          query === 'current'
        ) {
          const keepAlive = () => {
            const next = this.getKey('current')
            next.onsuccess = () => {
              if (held) keepAlive()
            }
          }
          request.addEventListener('success', () => {
            state.signoutStorageBlocked = true
            keepAlive()
          })
        }
        return request
      }
    })
    try {
      await page.getByRole('button', { name: 'Sign out', exact: true }).click()
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as Window & { signoutStorageBlocked?: boolean }).signoutStorageBlocked,
          ),
        )
        .toBe(true)
      await expect(page.getByRole('status')).toHaveText('Signing out...')
      await expect(page).toHaveURL(/\/account$/)
    } finally {
      await page.evaluate(() => {
        ;(window as Window & { releaseSignoutStorage?: () => void }).releaseSignoutStorage?.()
      })
    }
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    // Navigate immediately after acknowledgement, then verify durable absence.
    await page.goto(`/trips/${id}/plan`)
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    await expect(page.getByLabel('Trip name', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    expect(
      await page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open('antique-trail-auth-refresh-v1', 1)
            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
              const database = request.result
              const transaction = database.transaction('refresh-material', 'readonly')
              const key = transaction.objectStore('refresh-material').getKey('current')
              key.onerror = () => reject(key.error)
              key.onsuccess = () => resolve(key.result === undefined)
              transaction.oncomplete = () => database.close()
              transaction.onabort = () => {
                database.close()
                reject(transaction.error)
              }
            }
          }),
      ),
    ).toBe(true)
    await expect(page.getByLabel('Trip name', { exact: true })).toHaveCount(0)
    await expect(rpc(ownerToken, 'get_trip', { trip_id: id })).rejects.toThrow(
      /401|403|authorization_lost|not_allowed/,
    )
    await expect(
      rpc(ownerToken, 'rename_trip', {
        trip_id: id,
        new_name: 'Revoked signout attempt',
        expected_version: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/401|403|authorization_lost|not_allowed/)
    await expect(
      rpc(ownerToken, 'shopper_set_save', {
        p_store_id: A,
        p_saved: false,
      }),
    ).rejects.toThrow(/401|403|authorization_lost|not_allowed/)
    await page.screenshot({ path: testInfo.outputPath(`signout-after-reload-${repetition}.png`) })
    await login(page, 1, '/saved')
    await expect(page.getByText('You have no saved stores yet.', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Clockwork Cabinet', exact: true })).toHaveCount(0)
    await page.goto(`/trips/${id}/plan`)
    await expect(page.getByRole('heading', { name: 'Trip unavailable', exact: true })).toBeVisible()
    await expect(page.getByLabel('Trip name', { exact: true })).toHaveCount(0)
    expect(await read(id)).toEqual(before)
    expect(await saved()).toBe(1)
  }
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
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }).or(page.getByRole('alert').first()),
  ).toBeVisible()
  expect(await read(id)).toEqual(before)
})

test('two local accounts keep settings private across save, fresh login, and revocation', async ({
  page,
  browser,
}) => {
  const ownerId = uuid(input.users[0].id)
  const siblingId = uuid(input.users[1].id)
  const resetCounts = JSON.parse(
    (
      await service.sql(
        `with reset_profiles as (
           update app_private.profiles
           set public_display_name=null,private_location_address=case when user_id='${ownerId}' then '420 Owner Private Address' else null end
           where user_id in ('${ownerId}','${siblingId}')
           returning user_id
         ), reset_auth_metadata as (
           update auth.users
           set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'display_name' - 'full_name' - 'name'
           where id in ('${ownerId}','${siblingId}')
           returning id
         )
         select json_build_object(
           'profiles', (select count(*) from reset_profiles),
           'authMetadata', (select count(*) from reset_auth_metadata)
         )::text;`,
      )
    ).trim(),
  )
  expect(resetCounts).toEqual({ profiles: 2, authMetadata: 2 })

  const storeAccess = async () =>
    JSON.parse(
      (
        await service.sql(
          `select jsonb_build_object(
             'roleGrants', coalesce((
               select jsonb_agg(jsonb_build_object('userId',subject_user_id,'role',role,'storeId',store_id,'state',state) order by subject_user_id,role,store_id,state)
               from app_private.role_grants where subject_user_id in ('${ownerId}','${siblingId}')
             ),'[]'::jsonb),
             'partnerGrants', coalesce((
               select jsonb_agg(jsonb_build_object('userId',auth_user_id,'storeId',store_id,'state',state) order by auth_user_id,store_id,state)
               from partner_private.store_partner_grants where auth_user_id in ('${ownerId}','${siblingId}')
             ),'[]'::jsonb),
             'partnerships', coalesce((
               select jsonb_agg(jsonb_build_object('userId',auth_user_id,'storeId',store_id,'state',state) order by auth_user_id,store_id,state)
               from partner_private.store_partnerships where auth_user_id in ('${ownerId}','${siblingId}')
             ),'[]'::jsonb)
           )::text;`,
        )
      ).trim(),
    )

  const storeAccessBefore = await storeAccess()
  await page.route('**/rest/v1/rpc/account_get_settings', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"unavailable"}',
    }),
  )
  const ownerToken = await login(page, 0, '/account/settings')
  await expect(rpc(ownerToken, 'portal_get_home', {})).rejects.toThrow(
    /401|403|42501|portal_unavailable/,
  )
  await expect(page.getByRole('heading', { name: 'User settings', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled()
  await page.unroute('**/rest/v1/rpc/account_get_settings')
  await page.getByRole('button', { name: 'Retry loading settings', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('')
  await expect(
    page.getByLabel(`Signed in as ${input.users[0].email.split('@')[0]}`, { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Display name', { exact: true }).fill('Issue 420 Owner')
  await expect(page.getByRole('textbox', { name: /address/i })).toHaveCount(0)
  await expect(page.getByText('420 Owner Private Address', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await expect(page.getByLabel('Signed in as Issue 420 Owner')).toBeVisible()

  // A failed settings write must not mutate a second, provider-owned name.
  const providerWrites: string[] = []
  const recordProviderWrite = (request: import('@playwright/test').Request) => {
    if (request.method() === 'PUT' && request.url().includes('/auth/v1/user'))
      providerWrites.push(request.url())
  }
  page.on('request', recordProviderWrite)
  await page.route('**/rest/v1/rpc/account_update_settings', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"unavailable"}',
    }),
  )
  await page.getByLabel('Display name', { exact: true }).fill('Unsaved Owner Name')
  await page.getByRole('checkbox', { name: /clear saved address/i }).check()
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('420 Owner Private Address', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Signed in as Issue 420 Owner')).toBeVisible()
  expect(providerWrites).toEqual([])
  await expect(rpc(ownerToken, 'account_get_settings', {})).resolves.toMatchObject({
    displayName: 'Issue 420 Owner',
    locationAddress: '420 Owner Private Address',
  })
  await page.unroute('**/rest/v1/rpc/account_update_settings')
  await page.getByRole('checkbox', { name: /clear saved address/i }).uncheck()
  page.off('request', recordProviderWrite)

  const freshOwnerContext = await browser.newContext({ baseURL: input.origin })
  try {
    const freshOwnerPage = await freshOwnerContext.newPage()
    await login(freshOwnerPage, 0, '/account/settings')
    await expect(freshOwnerPage.getByLabel('Display name', { exact: true })).toHaveValue(
      'Issue 420 Owner',
    )
    await expect(
      freshOwnerPage.getByText('420 Owner Private Address', { exact: true }),
    ).toBeVisible()
    await expect(freshOwnerPage.getByLabel('Signed in as Issue 420 Owner')).toBeVisible()
    // Another tab advances the version without changing either value.
    await freshOwnerPage.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(freshOwnerPage.getByRole('status')).toHaveText('Settings saved.')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Your settings changed in another session.')
    await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeDisabled()
    await expect(rpc(ownerToken, 'account_get_settings', {})).resolves.toMatchObject({
      displayName: 'Issue 420 Owner',
      locationAddress: '420 Owner Private Address',
    })
    await page.getByRole('button', { name: 'Retry loading settings', exact: true }).click()
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Issue 420 Owner')
    await page.route(
      '**/rest/v1/rpc/account_update_settings',
      async (route) => {
        await route.fetch()
        await route.abort('failed')
      },
      { times: 1 },
    )
    await page.getByLabel('Display name', { exact: true }).fill('Lost Response Name')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(rpc(ownerToken, 'account_get_settings', {})).resolves.toMatchObject({
      displayName: 'Lost Response Name',
      locationAddress: '420 Owner Private Address',
    })
    await freshOwnerPage.reload()
    await expect(freshOwnerPage.getByLabel('Display name', { exact: true })).toHaveValue(
      'Lost Response Name',
    )
    await freshOwnerPage.getByLabel('Display name', { exact: true }).fill('Issue 420 Owner')
    await freshOwnerPage.getByRole('checkbox', { name: /clear saved address/i }).check()
    await freshOwnerPage.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(freshOwnerPage.getByRole('status')).toHaveText('Settings saved.')
    await page.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Settings saved.')
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Issue 420 Owner')
    await expect(page.getByRole('region', { name: 'Saved address', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Signed in as Issue 420 Owner')).toBeVisible()
    await expect(rpc(ownerToken, 'account_get_settings', {})).resolves.toMatchObject({
      displayName: 'Issue 420 Owner',
      locationAddress: null,
    })
    // Restore only the run-owned legacy fixture for the isolation assertions below.
    await service.sql(
      `update app_private.profiles set private_location_address='420 Owner Private Address', version=version+1 where user_id='${ownerId}';`,
    )
    await page.reload()
    await expect(page.getByText('420 Owner Private Address', { exact: true })).toBeVisible()
  } finally {
    await freshOwnerContext.close()
  }
  expect(await storeAccess()).toEqual(storeAccessBefore)
  await expect(rpc(ownerToken, 'portal_get_home', {})).rejects.toThrow(
    /401|403|42501|portal_unavailable/,
  )

  const siblingContext = await browser.newContext({ baseURL: input.origin })
  try {
    const siblingPage = await siblingContext.newPage()
    const siblingToken = await login(siblingPage, 1, '/account/settings')
    await expect(rpc(siblingToken, 'portal_get_home', {})).rejects.toThrow(
      /401|403|42501|portal_unavailable/,
    )
    await expect(siblingPage.getByLabel('Display name', { exact: true })).toHaveValue('')
    await expect(siblingPage.getByRole('textbox', { name: /address/i })).toHaveCount(0)
    await expect(
      siblingPage.getByRole('region', { name: 'Saved address', exact: true }),
    ).toHaveCount(0)
    await expect(rpc(siblingToken, 'account_get_settings', {})).resolves.toMatchObject({
      displayName: null,
      locationAddress: null,
    })
    await expect(
      rpc(siblingToken, 'account_update_settings', {
        p_display_name: 'Changed Owner',
        p_location_address: 'Changed Owner Address',
        p_expected_version: 1,
        p_idempotency_key: 'cross-account',
        p_user_id: ownerId,
      }),
    ).rejects.toThrow(/404|PGRST202/)
    await expect(
      loopbackRequest(input.endpoint, '/rest/v1/rpc/account_get_settings', {
        key: input.anonKey,
        schema: 'app_public',
        body: {},
      }),
    ).rejects.toThrow(/401|403|404|42501|PGRST202/)

    await service.sql(
      `update app_private.profiles set private_location_address='420 Sibling Private Address', version=version+1 where user_id='${siblingId}';`,
    )
    await siblingPage.reload()
    await expect(
      siblingPage.getByText('420 Sibling Private Address', { exact: true }),
    ).toBeVisible()
    await siblingPage.getByLabel('Display name', { exact: true }).fill('Issue 420 Sibling')
    await siblingPage.getByRole('button', { name: 'Save settings', exact: true }).click()
    await expect(siblingPage.getByRole('status')).toHaveText('Settings saved.')
    await expect(siblingPage.getByLabel('Signed in as Issue 420 Sibling')).toBeVisible()
    await siblingPage.reload()
    await expect(siblingPage.getByLabel('Display name', { exact: true })).toHaveValue(
      'Issue 420 Sibling',
    )
    await expect(
      siblingPage.getByText('420 Sibling Private Address', { exact: true }),
    ).toBeVisible()

    const freshSiblingContext = await browser.newContext({ baseURL: input.origin })
    let freshSiblingToken: string
    try {
      const freshSiblingPage = await freshSiblingContext.newPage()
      freshSiblingToken = await login(freshSiblingPage, 1, '/account/settings')
      await expect(freshSiblingPage.getByLabel('Display name', { exact: true })).toHaveValue(
        'Issue 420 Sibling',
      )
      await expect(
        freshSiblingPage.getByText('420 Sibling Private Address', { exact: true }),
      ).toBeVisible()
    } finally {
      await freshSiblingContext.close()
    }

    expect(await storeAccess()).toEqual(storeAccessBefore)
    await expect(rpc(freshSiblingToken, 'portal_get_home', {})).rejects.toThrow(
      /401|403|42501|portal_unavailable/,
    )

    const roles = await service.sql(
      `select count(*) filter (where role='shopper')::text || ':' || count(*) filter (where role<>'shopper')::text from app_private.role_grants where subject_user_id in ('${ownerId}','${siblingId}') and state='active';`,
    )
    expect(roles.trim()).toBe('2:0')
    const ownerAddress = await service.sql(
      `select private_location_address from app_private.profiles where user_id='${ownerId}';`,
    )
    expect(ownerAddress.trim()).toBe('420 Owner Private Address')

    await siblingPage.goto('/account')
    await siblingPage.getByRole('button', { name: 'Use a different account', exact: true }).click()
    await expect(siblingPage).toHaveURL(/\/auth\/sign-in/)
    await expect(siblingPage.getByLabel('Signed in as Issue 420 Sibling')).toHaveCount(0)
    await submitLogin(siblingPage, 0)
    await siblingPage.goto('/account/settings')
    await expect(siblingPage.getByLabel('Display name', { exact: true })).toHaveValue(
      'Issue 420 Owner',
    )
    await expect(siblingPage.getByText('420 Owner Private Address', { exact: true })).toBeVisible()
    await expect(siblingPage.getByLabel('Signed in as Issue 420 Owner')).toBeVisible()
    await expect(siblingPage.getByLabel('Signed in as Issue 420 Sibling')).toHaveCount(0)
    expect(await storeAccess()).toEqual(storeAccessBefore)

    await service.sql(
      `update app_private.active_sessions set state='revoked',revoked_at=statement_timestamp(),revocation_reason='issue_420_test_revocation' where user_id='${siblingId}' and state='active';`,
    )
    await expect(rpc(freshSiblingToken, 'account_get_settings', {})).rejects.toThrow(
      /401|403|42501|account_settings_access_denied/,
    )
    const unchanged = await service.sql(
      `select private_location_address from app_private.profiles where user_id='${siblingId}';`,
    )
    expect(unchanged.trim()).toBe('420 Sibling Private Address')
  } finally {
    await siblingContext.close()
  }

  // Legacy values must remain readable and clearable on the narrowest supported screen.
  const longAddress = 'A'.repeat(320)
  await service.sql(
    `update app_private.profiles set private_location_address='${longAddress}', version=version+1 where user_id='${ownerId}';`,
  )
  await page.setViewportSize({ width: 320, height: 844 })
  await page.reload()
  await expect(page.getByText(longAddress, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const clearAddress = page.getByRole('checkbox', { name: /clear saved address/i })
  const clearTarget = await clearAddress.locator('..').boundingBox()
  expect(clearTarget?.height).toBeGreaterThanOrEqual(48)
  const saveSettings = page.getByRole('button', { name: 'Save settings', exact: true })
  expect((await saveSettings.boundingBox())?.height).toBeGreaterThanOrEqual(48)
  await page.getByLabel('Display name', { exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(clearAddress).toBeFocused()
  await page.keyboard.press('Space')
  await expect(clearAddress).toBeChecked()
  await page.keyboard.press('Tab')
  await expect(saveSettings).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await expect(page.getByRole('region', { name: 'Saved address', exact: true })).toHaveCount(0)
  await expect(rpc(ownerToken, 'account_get_settings', {})).resolves.toMatchObject({
    locationAddress: null,
  })
})

test('visible Saved-row chooser cancels, retries, and reads back one dated stop', async ({
  page,
  browser,
}) => {
  const name = `Saved row ${crypto.randomUUID()}`
  const localDate = '2030-10-12'
  const ownTrips = async () =>
    Number(
      (
        await service.sql(`select count(*) from trip_private.trips where owner_id='${owner}';`)
      ).trim(),
    )
  const ownStops = async () =>
    Number(
      (
        await service.sql(
          `select count(*) from trip_private.trip_stops s join trip_private.trips t on t.trip_id=s.trip_id where t.owner_id='${owner}';`,
        )
      ).trim(),
    )
  const tripBaseline = await ownTrips()
  const stopBaseline = await ownStops()
  await service.sql(
    `insert into shopper_private.saved_stores(user_id,store_id) values ('${owner}','${A}');`,
  )
  await login(page, 0, '/saved')
  const enterFromSaved = async () => {
    const row = page
      .getByRole('list', { name: 'Saved stores', exact: true })
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: 'Clockwork Cabinet', exact: true }) })
    await expect(row).toHaveCount(1)
    const action = row.getByRole('link', { name: 'Add to Trip', exact: true })
    await expect(action).toHaveAttribute('href', `/trips/new?addStoreId=${A}&returnTo=%2Fsaved`)
    await action.click()
    await expect(page).toHaveURL(`${input.origin}/trips/new?addStoreId=${A}&returnTo=%2Fsaved`)
    await expect(page.getByRole('heading', { name: 'Add to Trip', exact: true })).toBeVisible()
  }
  await enterFromSaved()
  await page.getByRole('link', { name: 'Back to saved stores', exact: true }).click()
  await expect(page).toHaveURL(`${input.origin}/saved`)
  expect(await ownTrips()).toBe(tripBaseline)
  expect(await ownStops()).toBe(stopBaseline)
  await enterFromSaved()
  let attempts = 0
  let tripId = ''
  let firstSettled = false
  let firstFailure = ''
  const addRoute = async (route: import('@playwright/test').Route) => {
    attempts += 1
    try {
      const request = route.request()
      const body = request.postDataJSON()
      expect(request.url()).toBe(`${input.endpoint}/rest/v1/rpc/add_trip_store_stop`)
      expect(request.method()).toBe('POST')
      expect(Object.keys(body).sort()).toEqual(['store_id', 'trip_id'])
      expect(body.store_id).toBe(A)
      if (attempts === 1) {
        tripId = uuid(body.trip_id)
        expect(await read(tripId)).toMatchObject({ name, date: localDate, stops: [] })
        expect(await ownTrips()).toBe(tripBaseline + 1)
        expect(await ownStops()).toBe(stopBaseline)
        // Deliberately do not forward this first add: failure precedes its database write.
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'temporary_unavailable' }),
        })
      } else {
        expect(attempts).toBe(2)
        expect(body.trip_id).toBe(tripId)
        await route.continue()
      }
    } catch {
      firstFailure = 'add-request-or-readback-failed'
      await route.abort('failed').catch(() => undefined)
    } finally {
      firstSettled = true
    }
  }
  await page.route('**/rest/v1/rpc/add_trip_store_stop', addRoute)
  try {
    await page.getByLabel('Trip name', { exact: true }).fill(name)
    await page.getByLabel('Date', { exact: true }).fill(localDate)
    await page.getByRole('button', { name: 'Create trip and add store', exact: true }).click()
    await expect.poll(() => firstSettled).toBe(true)
    expect(firstFailure).toBe('')
    expect(attempts).toBe(1)
    await expect(page.getByRole('alert')).toContainText(
      "We couldn't update this trip. Please try again.",
    )
    expect(await read(tripId)).toMatchObject({ name, date: localDate, stops: [] })
    await page.getByRole('button', { name: 'Retry adding store', exact: true }).click()
    await expect(page.getByText(`Added to ${name}`, { exact: true })).toBeVisible()
    expect(firstFailure).toBe('')
    expect(attempts).toBe(2)
    await page.getByRole('link', { name: 'View Trip', exact: true }).click()
    await expect(page.getByText(name, { exact: true })).toBeVisible()
    await expect(page.getByText(`Trip date: ${localDate}`, { exact: true })).toBeVisible()
    const finalState = await read(tripId)
    expect(finalState).toMatchObject({ name, date: localDate, stops: [{ store: A }] })
    expect(await ownTrips()).toBe(tripBaseline + 1)
    expect(await ownStops()).toBe(stopBaseline + 1)
    const otherContext = await browser.newContext({ baseURL: input.origin })
    try {
      const otherPage = await otherContext.newPage()
      const token = await login(otherPage, 1, '/trips')
      await expect(rpc(token, 'get_trip', { trip_id: tripId })).rejects.toThrow(
        /\bauthorization_lost\b/,
      )
      expect(await read(tripId)).toEqual(finalState)
    } finally {
      await otherContext.close()
    }
  } finally {
    await page.unroute('**/rest/v1/rpc/add_trip_store_stop', addRoute)
  }
})
