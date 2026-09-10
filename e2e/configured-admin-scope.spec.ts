import { expect, test, type Page } from '@playwright/test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createLocalService, loopbackRequest } from '../scripts/configured-shopper-local.mjs'

const input = JSON.parse(fs.readFileSync(process.env.CONFIGURED_ADMIN_SCOPE_INPUT!, 'utf8'))
const service = createLocalService({ resumeDirectory: input.directory })
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
const read = (store: string) =>
  service
    .sql(
      `select json_build_object('partner',g.state,'role',(select state from app_private.role_grants r where r.subject_user_id=g.auth_user_id and r.role='representative' and r.store_id=g.store_id order by granted_at desc limit 1),'actions',(select count(*) from admin_private.admin_scope_actions a where a.store_id=g.store_id),'audit',(select count(*) from app_private.privileged_audit_events e where e.action in ('admin_scope_revoke','admin_scope_regrant'))) from partner_private.store_partner_grants g where g.auth_user_id='${input.actors.subject.id}' and g.store_id='${store}' order by g.granted_at desc limit 1;`,
    )
    .then((text: string) => JSON.parse(text.trim()))
async function login(page: Page) {
  await page.goto('/auth/sign-in?returnTo=%2Fadmin%2Faccess')
  await page.getByLabel('Email', { exact: true }).fill(input.actors.admin.email)
  await page.getByLabel('Password', { exact: true }).fill(input.actors.admin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verify your sign-in' })).toBeVisible()
  await page.getByLabel('Authentication code', { exact: true }).fill(totp(input.secret))
  await page.getByRole('button', { name: 'Verify code', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Access & Safety' })).toBeVisible()
}
function targetRow(page: Page) {
  return page
    .getByLabel('Store Representative scopes')
    .getByRole('listitem')
    .filter({ hasText: 'Clockwork Cabinet' })
}

test('actual Auth MFA Administrator identity denies the unauthenticated boundary', async ({
  page,
}) => {
  await page.goto('/admin/access')
  await expect(page).toHaveURL(/\/auth\/sign-in/)
  await login(page)
  await expect(targetRow(page)).toContainText('Scope Subject')
  await expect(targetRow(page)).toContainText('MFA verified')
  await expect(page.getByText(input.actors.shopper.email, { exact: false })).toHaveCount(0)
})

test('preview cancel then exact revoke and regrant retain sibling scope with audited independent readback', async ({
  page,
}) => {
  await login(page)
  const row = targetRow(page)
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).click()
  await expect(row.getByText(/Confirm exact scope: Clockwork Cabinet/)).toBeVisible()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: 'Cancel scope change', exact: true }).click()
  expect(await read(target)).toMatchObject({ partner: 'active', role: 'active', actions: 0 })
  await row.getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }).click()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: /Confirm revoke Clockwork Cabinet scope/ }).click()
  await expect
    .poll(() => read(target))
    .toMatchObject({ partner: 'revoked', role: 'revoked', actions: 1 })
  expect(await read(sibling)).toMatchObject({ partner: 'active', role: 'active' })
  await page.reload()
  const revoked = targetRow(page)
  await expect(revoked).toContainText('revoked')
  await revoked.getByRole('button', { name: /Preview regrant Clockwork Cabinet scope/ }).click()
  await revoked.getByLabel('Administrative reason').fill('scope_reapproved')
  await revoked.getByRole('button', { name: /Confirm regrant Clockwork Cabinet scope/ }).click()
  await expect.poll(() => read(target)).toMatchObject({
    partner: 'active',
    role: 'active',
    actions: input.wrongReadback ? 99 : 2,
    audit: 2,
  })
  expect(await read(sibling)).toMatchObject({ partner: 'active', role: 'active' })
  await expect(
    targetRow(page).getByRole('button', { name: /Preview revoke Clockwork Cabinet scope/ }),
  ).toBeVisible()
})

test('stale replay and missing assurance fail closed while focus and scoped record survive desktop and phone use', async ({
  page,
}) => {
  const aal1 = await service.request('/auth/v1/token?grant_type=password', {
    key: input.anonKey,
    body: { email: input.actors.admin.email, password: input.actors.admin.password },
  })
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/admin_preview_store_scope_change', {
      key: input.anonKey,
      token: aal1.access_token,
      schema: 'app_public',
      body: { p_operation: 'revoke', p_subject_user_id: input.actors.subject.id, p_store_id: target, p_expected_version: 1 },
    }),
  ).rejects.toThrow(/401|403|admin_unavailable/)
  await login(page)
  const row = targetRow(page)
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
  await expect.poll(() => read(target)).toMatchObject({ partner: 'revoked', role: 'revoked' })
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
  expect(await read(sibling)).toMatchObject({ partner: 'active', role: 'active' })
  await page.reload()
  await expect(targetRow(page)).toContainText('Clockwork Cabinet')
  const revoked = targetRow(page)
  await revoked.getByRole('button', { name: /Preview regrant Clockwork Cabinet scope/ }).click()
  await revoked.getByLabel('Administrative reason').fill('stale_restore')
  await revoked.getByRole('button', { name: /Confirm regrant Clockwork Cabinet scope/ }).click()
  await expect.poll(() => read(target)).toMatchObject({ partner: 'active', role: 'active' })
})
