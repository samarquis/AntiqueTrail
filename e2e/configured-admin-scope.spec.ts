import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import {
  command,
  createLocalService,
  loopbackRequest,
} from '../scripts/configured-shopper-local.mjs'

type ConfiguredInput = {
  directory: string
  endpoint: string
  anonKey: string
  wrongReadback?: boolean
  stores: { target: string; sibling: string }
  actors: {
    admin: Record<string, { id: string; email: string; password: string; secret: string }>
    subject: { id: string; email: string; password: string }
    shopper: { id: string; email: string; password: string }
  }
}
const inputPath = process.env.CONFIGURED_ADMIN_SCOPE_INPUT
const input: ConfiguredInput = inputPath
  ? JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  : {
      directory: '',
      endpoint: '',
      anonKey: '',
      stores: { target: '', sibling: '' },
      actors: {
        admin: { desktop: { id: '', email: '', password: '', secret: '' } },
        subject: { id: '', email: '', password: '' },
        shopper: { id: '', email: '', password: '' },
      },
    }
const service = inputPath ? createLocalService({ resumeDirectory: input.directory }) : null
test.skip(!inputPath, 'configured Administrator scope input is required')
const target = input.stores.target as string
const sibling = input.stores.sibling as string
const base32 = (value: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0,
    count = 0
  const bytes: number[] = []
  for (const character of value.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits = (bits << 5) | index
    count += 5
    if (count >= 8) {
      bytes.push((bits >>> (count - 8)) & 255)
      count -= 8
    }
  }
  return Buffer.from(bytes)
}
const totp = (secret: string) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', base32(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String(
    (((digest[offset] & 127) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
      1_000_000,
  ).padStart(6, '0')
}
const read = (store: string, subjectId = input.actors.subject.id) =>
  command(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGPASSWORD=postgres',
      `supabase_db_${service!.run.projectId}`,
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: `select json_build_object('partnerState',(select g.state from partner_private.store_partner_grants g where g.auth_user_id='${subjectId}' and g.store_id='${store}' and g.role='representative' order by g.granted_at desc, g.grant_id desc limit 1),'roleState',(select r.state from app_private.role_grants r where r.subject_user_id='${subjectId}' and r.store_id='${store}' and r.role='representative' order by r.granted_at desc, r.grant_id desc limit 1),'actions',(select count(*) from admin_private.admin_scope_actions a where a.subject_user_id='${subjectId}' and a.store_id='${store}' and a.role='representative'),'audit',(select count(*) from app_private.privileged_audit_events e join partner_private.store_partner_grants g on g.grant_id=e.resource_id where e.action in ('admin_scope_revoke','admin_scope_regrant') and g.auth_user_id='${subjectId}' and g.store_id='${store}'));`,
    },
  ).then((text: string) => {
    const record = text
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .find((line: string) => line.startsWith('{'))
    if (!record)
      throw new Error(`Independent scope readback returned no record: ${text.trim() || 'empty'}`)
    return JSON.parse(record)
  })
async function login(page: Page, projectName: string) {
  const administrator = input.actors.admin[projectName]
  if (!administrator) throw new Error(`No Administrator fixture for ${projectName}`)
  await page.goto('/auth/sign-in?returnTo=%2Fadmin%2Faccess')
  await page.getByLabel('Email', { exact: true }).fill(administrator.email)
  await page.getByLabel('Password', { exact: true }).fill(administrator.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const challenge = page.getByRole('heading', { name: 'Verify your sign-in' })
  const access = page.getByRole('heading', { name: 'Access & Safety' })
  await expect(challenge).toBeVisible()
  await page.getByLabel('Authentication code', { exact: true }).fill(totp(administrator.secret))
  await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  await expect(access).toBeVisible()
}
function targetRow(page: Page) {
  return page
    .getByLabel('Store Representative scopes')
    .getByRole('listitem')
    .filter({ hasText: 'Clockwork Scope Subject' })
}
function siblingRow(page: Page) {
  return page
    .getByLabel('Store Representative scopes')
    .getByRole('listitem')
    .filter({ hasText: 'Prairie Scope Subject' })
}

test('actual Auth MFA Administrator identity denies the unauthenticated boundary', async ({
  page,
}, testInfo) => {
  await page.goto('/admin/access')
  await expect(page).not.toHaveURL(/\/admin\/access/)
  const adminListRequest = page.waitForRequest((request) =>
    request.url().includes('/rest/v1/rpc/admin_list_store_scopes'),
  )
  await login(page, testInfo.project.name)
  const authorization = (await adminListRequest).headers().authorization
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Administrator scope read did not use an actual bearer session')
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/shopper_list_saved', {
      key: input.anonKey,
      token,
      schema: 'app_public',
      body: {},
    }),
  ).rejects.toThrow(/401|403|shopper_private_unavailable/)
  await expect(targetRow(page)).toContainText('Store representative')
  await expect(targetRow(page)).toContainText('MFA verified')
  await expect(page.getByText(input.actors.shopper.email, { exact: false })).toHaveCount(0)
})

test('preview cancel then exact revoke and regrant retain sibling scope with audited independent readback', async ({
  page,
}, testInfo) => {
  await login(page, testInfo.project.name)
  const row = targetRow(page)
  const baseline = await read(target)
  expect(baseline).toMatchObject({ partnerState: 'active', roleState: 'active' })
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).click()
  await expect(row.getByText(/Confirm exact scope: Clockwork Cabinet/)).toBeVisible()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: 'Cancel scope change', exact: true }).click()
  expect(await read(target)).toMatchObject(baseline)
  expect(await read(sibling, input.actors.sibling.id)).toMatchObject({
    partnerState: 'active',
    roleState: 'active',
  })
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).click()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: /Confirm revoke Clockwork Cabinet scope/ }).click()
  await expect
    .poll(() => read(target))
    .toMatchObject({
      partnerState: 'revoked',
      roleState: 'revoked',
      actions: baseline.actions + 1,
      audit: baseline.audit + 1,
    })
  await page.reload()
  const revoked = targetRow(page)
  await expect(revoked).toContainText('revoked')
  await expect(siblingRow(page)).toContainText('active')
  await revoked.getByRole('button', { name: /Preview regrant Clockwork Cabinet scope/ }).click()
  await revoked.getByLabel('Administrative reason').fill('scope_reapproved')
  await revoked.getByRole('button', { name: /Confirm regrant Clockwork Cabinet scope/ }).click()
  await expect
    .poll(() => read(target))
    .toMatchObject({
      partnerState: 'active',
      roleState: 'active',
      actions: input.wrongReadback ? 99 : baseline.actions + 2,
      audit: baseline.audit + 2,
    })
  await expect(siblingRow(page)).toContainText('active')
  const regranted = targetRow(page)
  await expect(
    regranted.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }),
  ).toBeVisible()
  await regranted.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).click()
  await expect(regranted.getByText(/Confirm exact scope: Clockwork Cabinet/)).toBeVisible()
  await regranted.getByRole('button', { name: 'Cancel scope change', exact: true }).click()
})

test('stale replay and missing assurance fail closed while focus and scoped record survive desktop and phone use', async ({
  page,
}, testInfo) => {
  const administrator = input.actors.admin[testInfo.project.name]
  if (!administrator) throw new Error(`No Administrator fixture for ${testInfo.project.name}`)
  const aal1 = await loopbackRequest(input.endpoint, '/auth/v1/token?grant_type=password', {
    key: input.anonKey,
    body: { email: administrator.email, password: administrator.password },
  })
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/admin_preview_store_scope_change', {
      key: input.anonKey,
      token: aal1.access_token,
      schema: 'app_public',
      body: {
        p_operation: 'revoke',
        p_subject_user_id: input.actors.subject.id,
        p_store_id: target,
        p_expected_version: 1,
      },
    }),
  ).rejects.toThrow(/401|403|admin_unavailable/)
  await login(page, testInfo.project.name)
  const row = targetRow(page)
  const baseline = await read(target)
  expect(baseline).toMatchObject({ partnerState: 'active', roleState: 'active' })
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).focus()
  await expect(
    row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }),
  ).toBeFocused()
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).press('Enter')
  await row.getByLabel('Administrative reason').fill('stale_control')
  const request = page.waitForRequest((candidate) =>
    candidate.url().includes('/rest/v1/rpc/admin_change_store_scope'),
  )
  await row.getByRole('button', { name: /Confirm revoke Clockwork Cabinet scope/ }).click()
  const browserRequest = await request
  const token = browserRequest.headers().authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Browser mutation did not use an actual bearer session')
  const stale = browserRequest.postDataJSON()
  await expect
    .poll(() => read(target))
    .toMatchObject({
      partnerState: 'revoked',
      roleState: 'revoked',
      actions: baseline.actions + 1,
      audit: baseline.audit + 1,
    })
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/admin_change_store_scope', {
      key: input.anonKey,
      token,
      schema: 'app_public',
      body: { ...stale, p_idempotency_key: `stale-${crypto.randomUUID()}` },
    }),
  ).rejects.toThrow(/401|403|400|admin_unavailable/)
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/admin_list_store_scopes', {
      key: input.anonKey,
      schema: 'app_public',
      body: {},
    }),
  ).rejects.toThrow(/401|403|admin_unavailable/)
  await expect(siblingRow(page)).toContainText('active')
  await page.reload()
  await expect(targetRow(page)).toContainText('Clockwork Cabinet')
  const revoked = targetRow(page)
  await revoked.getByRole('button', { name: /Preview regrant Clockwork Cabinet scope/ }).click()
  await revoked.getByLabel('Administrative reason').fill('stale_restore')
  await revoked.getByRole('button', { name: /Confirm regrant Clockwork Cabinet scope/ }).click()
  await expect
    .poll(() => read(target))
    .toMatchObject({
      partnerState: 'active',
      roleState: 'active',
      actions: baseline.actions + 2,
      audit: baseline.audit + 2,
    })
})
