import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { confirmationUrl, readMailbox } from '../scripts/local-signup-contract.mjs'
import { createLocalService } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(fs.readFileSync(process.env.LOCAL_SIGNUP_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
const storeId = '00000000-0000-4000-8000-000000001001'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const evidence = {
  stage: 'starting',
  provider: 'pending',
  callback: 'pending',
  admission: 'pending',
  save: 'pending',
  registrationRequestSeen: false,
  registrationStatus: null as number | null,
}
const evidencePath = path.join(input.output, 'journey.json')
function saveEvidence() {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
}
async function counts(userId: string, email: string) {
  if (!uuid.test(userId)) throw new Error('Provider returned malformed user identity')
  const result = await service.sql(
    `select json_build_object('users',(select count(*) from auth.users where id='${userId}' and email='${email}'),'emailUsers',(select count(*) from auth.users where email='${email}'),'grants',(select count(*) from app_private.role_grants where subject_user_id='${userId}' and role='shopper' and state='active'),'saves',(select count(*) from shopper_private.saved_stores where user_id='${userId}' and store_id='${storeId}'))::text;`,
  )
  return JSON.parse(result.trim()) as { users: number; grants: number; saves: number }
}

test('local signup verifies email, admits one Shopper, and saves privately once', async ({
  page,
}) => {
  saveEvidence()
  const runToken = crypto.randomUUID().replaceAll('-', '')
  const mailbox = `signup-${runToken}`
  const email = `${mailbox}@probe.invalid`
  const password = crypto.randomUUID().slice(0, 8)
  let signupPayload: Record<string, unknown> | null = null
  page.on('request', (request) => {
    if (request.url().endsWith('/functions/v1/account-registration')) {
      evidence.registrationRequestSeen = true
      saveEvidence()
      signupPayload = request.postDataJSON() as Record<string, unknown>
    }
  })
  page.on('response', (response) => {
    if (response.url().endsWith('/functions/v1/account-registration')) {
      evidence.registrationStatus = response.status()
      saveEvidence()
    }
  })

  evidence.stage = 'browser registration'
  saveEvidence()
  await page.goto('/auth/register')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('I confirm that I am 18 or older.').check()
  const signup = page.waitForResponse(
    (response) => response.url().endsWith('/functions/v1/account-registration'),
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  const signupResponse = await signup
  if (signupResponse.status() !== 202) {
    evidence.provider = 'failed'
    saveEvidence()
    const body = await Promise.race([
      signupResponse.json().catch(() => ({})),
      new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve({}), 3_000)),
    ])
    throw new Error(
      `Registration HTTP ${signupResponse.status()} state=${String(body.state ?? 'unknown')}`,
    )
  }
  const signupResult = await signupResponse.json()
  evidence.provider = signupResult.state === 'pending_verification' ? 'pending' : 'failed'
  saveEvidence()
  expect(signupResult.state).toBe('pending_verification')
  await expect(page).toHaveURL(/\/auth\/verify/)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  if (!signupPayload || typeof signupPayload.requestId !== 'string')
    throw new Error('Signup request identifier unavailable')

  evidence.stage = 'local provider email'
  saveEvidence()
  let messages: Awaited<ReturnType<typeof readMailbox>> = []
  for (let attempt = 0; attempt < 30; attempt++) {
    messages = await readMailbox({ endpoint: input.mailEndpoint, mailbox })
    if (messages.length) break
    await page.waitForTimeout(500)
  }
  expect(messages).toHaveLength(1)
  const confirmation = confirmationUrl(messages, input.endpoint, input.origin)
  const retry = await page.request.post(`${input.endpoint}/functions/v1/account-registration`, {
    headers: { apikey: input.anonKey, origin: input.origin },
    data: signupPayload,
  })
  expect(retry.status()).toBe(202)
  expect((await retry.json()).state).toBe('pending_verification')
  expect(await readMailbox({ endpoint: input.mailEndpoint, mailbox })).toHaveLength(1)
  evidence.provider = 'passed'
  saveEvidence()

  evidence.stage = 'verified callback'
  saveEvidence()
  const callback = page.waitForResponse(
    (response) => response.url() === `${input.endpoint}/functions/v1/account-registration-callback`,
  )
  await page.goto(confirmation)
  const callbackBody = await (await callback).json()
  const userId = callbackBody?.session?.user?.id
  expect(typeof userId).toBe('string')
  if (!uuid.test(userId)) throw new Error('Callback returned malformed user identity')
  expect(callbackBody.state).toBe('authenticated')
  await expect(page).toHaveURL(/\/stores$/)
  expect(await counts(userId, email)).toEqual({ users: 1, emailUsers: 1, grants: 1, saves: 0 })
  evidence.callback = 'passed'
  evidence.admission = 'passed'
  saveEvidence()

  evidence.stage = 'callback replay'
  await page.goto(confirmation)
  await expect(page.getByRole('heading', { name: 'Verification unavailable' })).toBeVisible()
  expect(await counts(userId, email)).toEqual({ users: 1, emailUsers: 1, grants: 1, saves: 0 })

  evidence.stage = 'private save'
  saveEvidence()
  await page.goto('/stores/clockwork-cabinet')
  await page.getByRole('button', { name: 'Save store Clockwork Cabinet', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Store saved.' })).toBeVisible()
  const session = callbackBody.session as { access_token: string }
  const repeatedSave = await page.request.post(`${input.endpoint}/rest/v1/rpc/shopper_set_save`, {
    headers: {
      apikey: input.anonKey,
      authorization: `Bearer ${session.access_token}`,
      'content-profile': 'app_public',
    },
    data: { p_store_id: storeId, p_saved: true },
  })
  expect(repeatedSave.ok()).toBeTruthy()
  expect(await counts(userId, email)).toEqual({ users: 1, emailUsers: 1, grants: 1, saves: 1 })
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Remove saved store Clockwork Cabinet', exact: true }),
  ).toBeVisible()
  evidence.save = 'passed'
  evidence.stage = 'complete'
  saveEvidence()
})
