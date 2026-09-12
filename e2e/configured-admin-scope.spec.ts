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
function scopeFor(projectName: string) {
  if (projectName === 'phone')
    return {
      target: sibling,
      sibling: target,
      targetSubjectId: input.actors.sibling.id,
      siblingSubjectId: input.actors.subject.id,
      targetStoreName: 'Prairie Patina',
      targetSubjectName: 'Prairie Scope Subject',
      siblingSubjectName: 'Clockwork Scope Subject',
    }
  return {
    target,
    sibling,
    targetSubjectId: input.actors.subject.id,
    siblingSubjectId: input.actors.sibling.id,
    targetStoreName: 'Clockwork Cabinet',
    targetSubjectName: 'Clockwork Scope Subject',
    siblingSubjectName: 'Prairie Scope Subject',
  }
}
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
const totp = (secret: string, stepOffset = 0) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepOffset))
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
const read = (store: string, subjectId: string) =>
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
  const mfaDiagnostics: Array<Record<string, unknown>> = []
  page.on('response', async (response) => {
    const url = new URL(response.url())
    if (!url.pathname.match(/\/auth\/v1\/factors\/[^/]+\/(challenge|verify)$/)) return
    const record: Record<string, unknown> = {
      path: url.pathname.replace(/[0-9a-f-]{36}/, ':factor'),
      status: response.status(),
      at: new Date().toISOString(),
    }
    try {
      const body = await response.json()
      if (body && typeof body === 'object') {
        if ('error_code' in body) record.error_code = body.error_code
        if ('msg' in body) record.msg = body.msg
      }
    } catch {
      record.body_unavailable = true
    }
    mfaDiagnostics.push(record)
  })
  await page.goto('/auth/sign-in?returnTo=%2Fadmin%2Faccess')
  await page.getByLabel('Email', { exact: true }).fill(administrator.email)
  await page.getByLabel('Password', { exact: true }).fill(administrator.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const challenge = page.getByRole('heading', { name: 'Verify your sign-in' })
  const access = page.getByRole('heading', { name: 'Access & Safety' })
  await expect(challenge).toBeVisible()
  const code = page.getByLabel('Authentication code', { exact: true })
  const verify = page.getByRole('button', { name: 'Verify code', exact: true })
  for (const attempt of [0, 1]) {
    if (attempt === 1) {
      const remaining = 30_000 - (Date.now() % 30_000)
      await page.waitForTimeout(remaining + 250)
    }
    await code.fill(totp(administrator.secret))
    await verify.click()
    try {
      await expect(access).toBeVisible({ timeout: 3000 })
      await fs.promises.writeFile(
        `${input.output}/mfa-${projectName}.json`,
        JSON.stringify(mfaDiagnostics, null, 2),
      )
      return
    } catch (error) {
      if (attempt === 1 || !(await challenge.isVisible())) {
        await fs.promises.writeFile(
          `${input.output}/mfa-${projectName}.json`,
          JSON.stringify(mfaDiagnostics, null, 2),
        )
        throw error
      }
    }
  }
}
async function shopperSavedCount() {
  return command(
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
      input: `select count(*) from shopper_private.saved_stores where user_id='${input.actors.shopper.id}';`,
    },
  ).then((text: string) => Number.parseInt(text.trim(), 10))
}
function targetRow(page: Page, scope: ReturnType<typeof scopeFor>) {
  return page
    .getByLabel('Store Representative scopes')
    .getByRole('listitem')
    .filter({ hasText: scope.targetSubjectName })
}
function siblingRow(page: Page, scope: ReturnType<typeof scopeFor>) {
  return page
    .getByLabel('Store Representative scopes')
    .getByRole('listitem')
    .filter({ hasText: scope.siblingSubjectName })
}

test('actual Auth MFA Administrator identity cannot read populated shopper-private data', async ({
  page,
}, testInfo) => {
  const scope = scopeFor(testInfo.project.name)
  await page.goto('/admin/access')
  await expect(page).not.toHaveURL(/\/admin\/access/)
  await login(page, testInfo.project.name)
  const adminListRequest = page.waitForRequest((request) =>
    request.url().includes('/rest/v1/rpc/admin_list_store_scopes'),
  )
  await page.reload()
  const authorization = (await adminListRequest).headers().authorization
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Administrator scope read did not use an actual bearer session')
  await expect(shopperSavedCount()).resolves.toBe(1)
  const shopperContext = await page.context().browser()!.newContext({ baseURL: input.origin })
  const shopperPage = await shopperContext.newPage()
  await shopperPage.goto('/auth/sign-in?returnTo=%2Fsaved')
  await shopperPage.getByLabel('Email', { exact: true }).fill(input.actors.shopper.email)
  await shopperPage.getByLabel('Password', { exact: true }).fill(input.actors.shopper.password)
  await shopperPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(shopperPage).toHaveURL(/\/saved$/)
  await expect(shopperPage.getByText('Clockwork Cabinet', { exact: false })).toBeVisible()
  await shopperContext.close()
  await expect(
    loopbackRequest(input.endpoint, '/rest/v1/rpc/shopper_list_saved', {
      key: input.anonKey,
      token,
      schema: 'app_public',
      body: {},
    }),
  ).rejects.toThrow(/401|403|shopper_private_access_denied/)
  await expect(targetRow(page, scope)).toContainText('MFA verified')
  await expect(page.getByText(input.actors.shopper.email, { exact: false })).toHaveCount(0)
})

test('preview cancel then exact revoke and regrant retain sibling scope with audited independent readback', async ({
  page,
}, testInfo) => {
  const scope = scopeFor(testInfo.project.name)
  await login(page, testInfo.project.name)
  const row = targetRow(page, scope)
  const baseline = await read(scope.target, scope.targetSubjectId)
  expect(baseline).toMatchObject({ partnerState: 'active', roleState: 'active' })
  await row.getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` }).click()
  await expect(row.getByText(`Confirm exact scope: ${scope.targetStoreName}`)).toBeVisible()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: 'Cancel scope change', exact: true }).click()
  expect(await read(scope.target, scope.targetSubjectId)).toMatchObject(baseline)
  expect(await read(scope.sibling, scope.siblingSubjectId)).toMatchObject({
    partnerState: 'active',
    roleState: 'active',
  })
  await row.getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` }).click()
  await row.getByLabel('Administrative reason').fill('scope_review')
  await row.getByRole('button', { name: `Confirm revoke ${scope.targetStoreName} scope` }).click()
  await expect
    .poll(() => read(scope.target, scope.targetSubjectId))
    .toMatchObject({
      partnerState: 'revoked',
      roleState: 'revoked',
      actions: baseline.actions + 1,
      audit: baseline.audit + 1,
    })
  await page.reload()
  const revoked = targetRow(page, scope)
  await expect(revoked).toContainText('revoked')
  await expect(siblingRow(page, scope)).toContainText('active')
  await revoked
    .getByRole('button', { name: `Preview regrant ${scope.targetStoreName} scope` })
    .click()
  await revoked.getByLabel('Administrative reason').fill('scope_reapproved')
  await revoked
    .getByRole('button', { name: `Confirm regrant ${scope.targetStoreName} scope` })
    .click()
  await expect
    .poll(() => read(scope.target, scope.targetSubjectId))
    .toMatchObject({
      partnerState: 'active',
      roleState: 'active',
      actions: input.wrongReadback ? 99 : baseline.actions + 2,
      audit: baseline.audit + 2,
    })
  await expect(siblingRow(page, scope)).toContainText('active')
  const regranted = targetRow(page, scope)
  await expect(
    regranted.getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` }),
  ).toBeVisible()
  await regranted
    .getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` })
    .click()
  await expect(regranted.getByText(`Confirm exact scope: ${scope.targetStoreName}`)).toBeVisible()
  await regranted.getByRole('button', { name: 'Cancel scope change', exact: true }).click()
})

test('stale replay and missing assurance fail closed while focus and scoped record survive desktop and phone use', async ({
  page,
}, testInfo) => {
  const scope = scopeFor(testInfo.project.name)
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
        p_subject_user_id: scope.targetSubjectId,
        p_store_id: scope.target,
        p_expected_version: 1,
      },
    }),
  ).rejects.toThrow(/401|403|admin_unavailable/)
  await login(page, testInfo.project.name)
  const row = targetRow(page, scope)
  const baseline = await read(scope.target, scope.targetSubjectId)
  expect(baseline).toMatchObject({ partnerState: 'active', roleState: 'active' })
  await row.getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` }).focus()
  await expect(
    row.getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` }),
  ).toBeFocused()
  await row
    .getByRole('button', { name: `Preview revoke ${scope.targetStoreName} scope` })
    .press('Enter')
  await row.getByLabel('Administrative reason').fill('stale_control')
  const request = page.waitForRequest((candidate) =>
    candidate.url().includes('/rest/v1/rpc/admin_change_store_scope'),
  )
  await row.getByRole('button', { name: `Confirm revoke ${scope.targetStoreName} scope` }).click()
  const browserRequest = await request
  const token = browserRequest.headers().authorization?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Browser mutation did not use an actual bearer session')
  const stale = browserRequest.postDataJSON()
  await expect
    .poll(() => read(scope.target, scope.targetSubjectId))
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
  await expect(siblingRow(page, scope)).toContainText('active')
  await page.reload()
  await expect(targetRow(page, scope)).toContainText(scope.targetStoreName)
  const revoked = targetRow(page, scope)
  await revoked
    .getByRole('button', { name: `Preview regrant ${scope.targetStoreName} scope` })
    .click()
  await revoked.getByLabel('Administrative reason').fill('stale_restore')
  await revoked
    .getByRole('button', { name: `Confirm regrant ${scope.targetStoreName} scope` })
    .click()
  await expect
    .poll(() => read(scope.target, scope.targetSubjectId))
    .toMatchObject({
      partnerState: 'active',
      roleState: 'active',
      actions: baseline.actions + 2,
      audit: baseline.audit + 2,
    })
})
