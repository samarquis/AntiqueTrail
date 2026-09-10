import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createLocalService, loopbackRequest } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(fs.readFileSync(process.env.CONFIGURED_TRIP_PARTNER_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
const STORE_A = '00000000-0000-4000-8000-000000001001'
const uuid = (value: string) => {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Invalid fixture UUID')
  return value
}
const rpc = (actor: number, name: string, body: object) =>
  loopbackRequest(input.endpoint, `/rest/v1/rpc/${name}`, {
    key: input.anonKey,
    token: input.users[actor].token,
    schema: 'app_public',
    body,
  })

async function login(page: Page, actor: number, target: string) {
  await page.goto(`/auth/sign-in?returnTo=${encodeURIComponent(target)}`)
  await page.getByLabel('Email', { exact: true }).fill(input.users[actor].email)
  await page.getByLabel('Password', { exact: true }).fill(input.users[actor].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL(/\/auth\/sign-in/)
}

async function createTrip() {
  const tripId = crypto.randomUUID(),
    creator = uuid(input.users[0].id)
  await service.sql(
    `insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date) values ('${tripId}','${creator}','00000000-0000-4000-8000-000000000001','Configured partner trip','2026-10-10'); insert into trip_private.trip_participants(trip_id,user_id,participant_role) values ('${tripId}','${creator}','creator');`,
  )
  return tripId
}

async function issueReceipt(tripId: string) {
  const token = crypto.randomBytes(32).toString('base64url')
  const email = input.users[1].email.replace(/'/g, "''")
  await service.sql(
    `begin; set local role trip_invitation_signer; select trip_private.produce_invitation_receipt('${uuid(tripId)}','${email}',extensions.digest(convert_to('${token}','utf8'),'sha256'),'configured-local-${crypto.randomUUID()}',statement_timestamp()+interval '1 day','shared_alpha'); commit;`,
  )
  return token
}

async function membership(tripId: string) {
  return Number(
    (
      await service.sql(
        `select count(*) from trip_private.trip_participants where trip_id='${uuid(tripId)}' and user_id='${uuid(input.users[1].id)}' and state='active';`,
      )
    ).trim(),
  )
}

test('creator invitation, matching recipient acceptance, one-trip isolation, and revocation diagnostic', async ({
  page,
  browser,
}) => {
  const tripId = await createTrip()
  const token = await issueReceipt(tripId)
  await service.sql(
    `insert into shopper_private.private_store_memories(user_id,store_id,note,version) values ('${uuid(input.users[0].id)}','${STORE_A}','Creator-only configured diagnostic memory',1);`,
  )
  await login(page, 0, `/trips/${tripId}/invite`)
  await page.getByLabel('Partner verified email').fill(input.users[1].email)
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
  await expect(page.getByText(/One invitation is pending until/)).toBeVisible()

  const wrong = await browser.newContext({ baseURL: input.origin })
  try {
    const wrongPage = await wrong.newPage()
    await login(wrongPage, 0, '/trips')
    await wrongPage.goto(`/trip-invitations#token=${token}`)
    await expect(wrongPage.getByRole('alert')).toContainText(
      "We couldn't update this trip. Please try again.",
    )
    await expect(wrongPage.getByText('You joined this one trip as Trip Partner.')).toHaveCount(0)
    await expect.poll(() => membership(tripId)).toBe(0)
  } finally {
    await wrong.close()
  }

  const partner = await browser.newContext({ baseURL: input.origin })
  try {
    const partnerPage = await partner.newPage()
    await login(partnerPage, 1, '/trips')
    await partnerPage.goto(`/trip-invitations#token=${token}`)
    await expect(
      partnerPage.getByRole('heading', { name: 'Trip invitation accepted' }),
    ).toBeVisible()
    await partnerPage.getByRole('link', { name: 'Open shared trip' }).click()
    await expect(partnerPage).toHaveURL(new RegExp(`/trips/${tripId}/plan$`))
    await expect
      .poll(() => membership(tripId))
      .toBe(process.env.CONFIGURED_TRIP_PARTNER_WRONG_READBACK === '1' ? 2 : 1)
    await expect(rpc(1, 'get_trip', { trip_id: tripId })).resolves.toMatchObject({ id: tripId })
    await expect(rpc(1, 'shopper_get_memory', { p_store_id: STORE_A })).resolves.toBeNull()

    const unrelated = await createTrip()
    await partnerPage.goto(`/trips/${unrelated}/plan`)
    await expect(partnerPage.getByRole('heading', { name: 'Trip unavailable' })).toBeVisible()

    // The creator's only revoke control is pending-only. Prove ordinary protected access
    // before reporting the missing removal action as a product failure.
    await expect(
      rpc(1, 'rename_trip', {
        trip_id: tripId,
        new_name: 'Partner pre-revocation write',
        expected_version: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    ).resolves.toBeDefined()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Remove partner', exact: true })).toBeVisible()
  } finally {
    await partner.close()
  }
})
