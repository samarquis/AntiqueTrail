#!/usr/bin/env node
/* global process, console, fetch, URL, AbortController, AbortSignal, Buffer, setTimeout */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  createLocalService,
  command,
  freePort,
  ROOT,
  stopChild,
} from './configured-shopper-local.mjs'
import { createRunDirectory, redact } from './configured-shopper-probe.mjs'
import { representativeHoursReport } from './configured-representative-hours-report.mjs'
import { runLocalOwnerCancellation } from './owner-cancellation-local.mjs'

const modeArgs = process.argv.slice(2)
const ownerListingMode = modeArgs.length === 1 && modeArgs[0] === '--owner-listing'
if (modeArgs.length && !ownerListingMode)
  throw new Error('Supported invocation is no arguments or --owner-listing')
const output = createRunDirectory(
  path.join(ROOT, ownerListingMode ? '.codex/issue-579/runs' : 'artifacts'),
)
const controller = new AbortController()
const report = {
  scope: ownerListingMode
    ? 'configured-owner-listing-isolated-local-proof'
    : 'representative-hours-and-owner-exact-store-billing-status',
  ...(ownerListingMode
    ? {
        stepResults: [],
        executionEnvironment:
          process.env.GITHUB_ACTIONS === 'true'
            ? 'hosted-ci-ephemeral-loopback-service'
            : 'local-ephemeral-loopback-service',
      }
    : {}),
  runId: output.runId,
  status: 'unavailable',
  cleanup: 'not-started',
  errors: [],
  evidenceClass: 'real-local-browser',
}
let service, server, ownerSecretFile, interruptSignal
const uuid = () => crypto.randomUUID()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    interruptSignal = signal
    controller.abort(new Error(signal))
  })

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed TOTP enrollment secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
async function auth(endpoint, key, token, route, body) {
  const response = await fetch(`${endpoint}${route}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
  })
  const data = await response.json()
  if (!response.ok) {
    const code = String(data?.code ?? '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 80)
    const message = String(data?.message ?? data?.error ?? data?.msg ?? '')
      .replace(/[^A-Za-z0-9_ .-]/g, '')
      .slice(0, 160)
    throw new Error(`Local Auth ${route} failed with ${response.status} ${code} ${message}`)
  }
  return data
}
async function provisionRepresentative(local) {
  const representative = local.users[0]
  const own = '00000000-0000-4000-8000-000000001001'
  const sibling = '00000000-0000-4000-8000-000000001002'
  const invitation = uuid(),
    pending = uuid(),
    provisional = uuid(),
    receipt = uuid(),
    partnership = uuid(),
    grant = uuid()
  const sql = fs
    .readFileSync(path.join(ROOT, 'scripts/configured-representative-hours-fixtures.sql'), 'utf8')
    .replaceAll('--REPRESENTATIVE--', representative.id)
    .replaceAll('--STORE--', own)
  await service.sql(`
    update app_private.profiles set verified_email_snapshot='${representative.email}' where user_id='${representative.id}';
    insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at,synthetic,issuance_idempotency_key,raw_returned_at)
      values('${invitation}',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'${representative.id}','consumed',statement_timestamp(),true,'issue322-${representative.id}',statement_timestamp());
    insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
      values('${pending}','${invitation}',decode(repeat('02',32),'hex'),'${representative.id}','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
    insert into partner_private.provisional_partner_consents(provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
      values('${provisional}','${invitation}','${pending}','synthetic-v3','Representative','Owner','Clockwork Cabinet',decode(repeat('03',32),'hex'),true,true,true,true,true,'issue322-${representative.id}');
    insert into partner_private.pilot_consent_receipts(consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,policy_version,receipt_checksum)
      values('${receipt}','${provisional}','${pending}','${invitation}','${representative.id}',decode(repeat('02',32),'hex'),'synthetic-v3',decode(repeat('04',32),'hex'));
    insert into partner_private.store_partnerships(partnership_id,pending_identity_id,auth_user_id,store_id,consent_receipt_id,state,started_at)
      values('${partnership}','${pending}','${representative.id}','${own}','${receipt}','active',statement_timestamp());
    insert into partner_private.store_partner_grants(grant_id,partnership_id,auth_user_id,store_id)
      values('${grant}','${partnership}','${representative.id}','${own}');
    ${sql}
  `)
  // Enroll and verify using the Representative's ordinary Auth bearer, never a setup key.
  const enrolled = await auth(
    local.endpoint,
    local.anonKey,
    representative.token,
    '/auth/v1/factors',
    { factor_type: 'totp', friendly_name: 'issue-322-local' },
  )
  const factorId = enrolled.id
  const secret = enrolled.totp?.secret
  if (typeof factorId !== 'string' || typeof secret !== 'string')
    throw new Error('Local Auth MFA enrollment malformed')
  const challenge = await auth(
    local.endpoint,
    local.anonKey,
    representative.token,
    `/auth/v1/factors/${factorId}/challenge`,
    {},
  )
  if (typeof challenge.id !== 'string') throw new Error('Local Auth MFA challenge malformed')
  await auth(
    local.endpoint,
    local.anonKey,
    representative.token,
    `/auth/v1/factors/${factorId}/verify`,
    { challenge_id: challenge.id, code: totp(secret) },
  )
  return {
    representative: {
      email: representative.email,
      password: representative.password,
      totpSecret: secret,
    },
    stores: { own, sibling },
    grantId: grant,
  }
}
async function provisionOwner(local, fixture) {
  const ownerId = local.users[0].id
  const storeId = uuid()
  const claimId = uuid()
  const storeSlug = `issue425-owner-${uuid().replaceAll('-', '').slice(0, 12)}`
  const adminId = '42200000-0000-4000-8000-000000000001'
  const adminSessionId = '42200000-0000-4000-8000-000000000003'
  const authorityEventA = uuid()
  const authorityEventB = uuid()
  const idempotencyKey = `issue425-owner-${uuid().replaceAll('-', '')}`
  await service.sql(`
    begin;
    update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
    update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
    insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience)
      values('${storeId}','${storeSlug}','Clockwork Cabinet','Topeka','KS','1 Synthetic Way',
        '00000000-0000-4000-8000-000000000001','Issue 425 local proof','Synthetic Owner billing fixture',true,'synthetic');
    insert into auth.users(id,email,email_confirmed_at)
      values('${adminId}','admin422@example.test',statement_timestamp());
    insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
      ('42200000-0000-4000-8000-000000000002','${adminId}','totp','verified',statement_timestamp(),statement_timestamp());
    insert into app_private.role_grants(subject_user_id,role) values('${adminId}','administrator');
    insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,access_token_expires_at) values
      ('${adminSessionId}','${adminId}',statement_timestamp(),1,statement_timestamp(),statement_timestamp()+interval '30 minutes');
    insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
      values('${claimId}','${ownerId}','${storeId}','store owner','Synthetic authority documented by independent channels.');
    insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values
      ('${claimId}','published_business_contact','domain_response','verified','${adminId}',statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),'${authorityEventA}'),
      ('${claimId}','callback','callback','verified','${adminId}',statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),'${authorityEventB}');
    update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id='${claimId}';
    update partner_private.listing_claims set state='verification_pending' where claim_id='${claimId}';
    insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
      values('${ownerId}','claim','${claimId}');
    create temporary table owner_billing_claim_version(version bigint);
    grant select on owner_billing_claim_version to authenticated;
    insert into owner_billing_claim_version select version from partner_private.listing_claims where claim_id='${claimId}';
    select set_config('request.jwt.claims',jsonb_build_object('sub','${adminId}','session_id','${adminSessionId}',
      'role','authenticated','aal','aal2','amr',jsonb_build_array(
        jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
        jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
    set local role authenticated;
    select app_public.owner_admin_approve_claim('${claimId}','${storeId}',
      (select version from owner_billing_claim_version),'${idempotencyKey}');
    reset role;
    commit;
  `)
  return {
    endpoint: local.endpoint,
    anonKey: local.anonKey,
    storeId,
    siblingStoreId: fixture.stores.sibling,
    owner: fixture.representative,
  }
}

async function createOwnerListingIdentity(local, request, alias) {
  const email = `${alias}-${uuid()}@probe.invalid`
  const password = crypto.randomBytes(32).toString('base64url')
  const created = await request('/auth/v1/admin/users', {
    key: local.anonKey,
    token: local.serviceRoleKey,
    body: { email, password, email_confirm: true },
  })
  if (!/^[a-f0-9-]{36}$/.test(created.id ?? ''))
    throw new Error('Local Owner listing identity creation failed')
  return { id: created.id, email, password }
}

async function enrollOwnerListingTotp(local, request, user, friendlyName) {
  const session = await request('/auth/v1/token?grant_type=password', {
    key: local.anonKey,
    body: { email: user.email, password: user.password },
  })
  if (!session.access_token) throw new Error('Local Owner listing Auth session unavailable')
  const enrolled = await auth(
    local.endpoint,
    local.anonKey,
    session.access_token,
    '/auth/v1/factors',
    { factor_type: 'totp', friendly_name: friendlyName },
  )
  const factorId = enrolled.id
  const secret = enrolled.totp?.secret
  if (typeof factorId !== 'string' || typeof secret !== 'string')
    throw new Error('Local Owner listing MFA enrollment malformed')
  const challenge = await auth(
    local.endpoint,
    local.anonKey,
    session.access_token,
    `/auth/v1/factors/${factorId}/challenge`,
    {},
  )
  if (typeof challenge.id !== 'string')
    throw new Error('Local Owner listing MFA challenge malformed')
  await auth(
    local.endpoint,
    local.anonKey,
    session.access_token,
    `/auth/v1/factors/${factorId}/verify`,
    { challenge_id: challenge.id, code: totp(secret) },
  )
  return secret
}

function replaceFixtureValues(source, values) {
  let result = source
  for (const [marker, value] of Object.entries(values))
    result = result.replaceAll(`--${marker}--`, value)
  if (/--[A-Z0-9_]+--/.test(result)) throw new Error('Owner listing fixture has unresolved values')
  return result
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function screenshotArtifacts(directory) {
  const artifacts = []
  const visit = (current) => {
    if (!fs.existsSync(current)) return
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && entry.name.endsWith('.png'))
        artifacts.push({
          path: path.relative(directory, file).replaceAll('\\', '/'),
          sha256: sha256(fs.readFileSync(file)),
        })
    }
  }
  visit(directory)
  return artifacts.sort((a, b) => a.path.localeCompare(b.path))
}

async function runOwnerListing() {
  let restorePartnerEnvironment = () => {}
  try {
    report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
    report.sourceDirty = Boolean(
      (await command('git', ['status', '--porcelain', '--untracked-files=all'])).trim(),
    )
    if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
      throw new Error('External endpoint selection is forbidden')

    const origin = `http://127.0.0.1:${await freePort()}`
    const emailHmacSecret = crypto.randomBytes(32).toString('base64url')
    const evidenceHmacSecret = crypto.randomBytes(32).toString('base64url')
    const localPartnerEnvironment = {
      PARTNER_SYNTHETIC_ENABLED: 'true',
      PARTNER_EMAIL_HMAC_SECRET: emailHmacSecret,
      PARTNER_EMAIL_HMAC_KEY_VERSION: '1',
      PARTNER_EVIDENCE_HMAC_SECRET: evidenceHmacSecret,
      APP_ORIGIN: origin,
      PUBLIC_APP_ORIGIN: origin,
    }
    const priorEnvironment = new Map(
      Object.keys(localPartnerEnvironment).map((key) => [key, process.env[key]]),
    )
    restorePartnerEnvironment = () => {
      for (const [key, value] of priorEnvironment)
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
    Object.assign(process.env, localPartnerEnvironment)

    service = createLocalService({
      signal: controller.signal,
      browserOrigin: origin,
      includeServiceRoleKey: true,
    })
    report.temporaryProject = service.run.directory
    const local = await service.start()
    restorePartnerEnvironment()
    report.status = 'running'

    const ownerA = await createOwnerListingIdentity(local, service.request, 'issue579-owner-a')
    const ownerApplicant = await createOwnerListingIdentity(
      local,
      service.request,
      'issue579-owner-applicant',
    )
    const ownerCancel = await createOwnerListingIdentity(
      local,
      service.request,
      'issue579-owner-cancel',
    )
    const admin = await createOwnerListingIdentity(local, service.request, 'issue579-site-admin')
    const shopper = local.users[0]
    const [ownerATotp, ownerApplicantTotp, ownerCancelTotp, adminTotp] = await Promise.all([
      enrollOwnerListingTotp(local, service.request, ownerA, 'issue-579-owner-a'),
      enrollOwnerListingTotp(local, service.request, ownerApplicant, 'issue-579-owner-applicant'),
      enrollOwnerListingTotp(local, service.request, ownerCancel, 'issue-579-owner-cancel'),
      enrollOwnerListingTotp(local, service.request, admin, 'issue-579-site-admin'),
    ])

    const storeA = { id: uuid(), slug: 'issue-579-clockwork-cabinet' }
    const storeB = { id: uuid(), slug: 'issue-579-sibling-market' }
    const claimId = uuid()
    const invitationAId = uuid()
    const invitationCancelId = uuid()
    const maintenanceInvitationId = uuid()
    const maintenancePendingId = uuid()
    const maintenanceConsentId = uuid()
    const maintenanceReceiptId = uuid()
    const invitationA = crypto.randomBytes(32).toString('hex')
    const invitationCancel = crypto.randomBytes(32).toString('hex')
    const maintenanceInvitationHash = sha256(crypto.randomBytes(32))
    const authorityEventA = uuid()
    const authorityEventB = uuid()
    const emailHmac = (email) =>
      crypto
        .createHmac('sha256', emailHmacSecret)
        .update(email.normalize('NFKC').trim().toLowerCase())
        .digest('hex')
    const fixturePath = path.join(ROOT, 'scripts/configured-owner-listing-fixtures.sql')
    const fixtureSource = fs.readFileSync(fixturePath, 'utf8')
    const fixtureSql = replaceFixtureValues(fixtureSource, {
      STORE_A: storeA.id,
      STORE_B: storeB.id,
      OWNER_A: ownerA.id,
      OWNER_A_EMAIL: ownerA.email,
      OWNER_APPLICANT: ownerApplicant.id,
      OWNER_APPLICANT_EMAIL: ownerApplicant.email,
      OWNER_CANCEL: ownerCancel.id,
      OWNER_CANCEL_EMAIL: ownerCancel.email,
      ADMIN: admin.id,
      ADMIN_EMAIL: admin.email,
      OWNER_A_EMAIL_HMAC: emailHmac(ownerA.email),
      OWNER_APPLICANT_EMAIL_HMAC: emailHmac(ownerApplicant.email),
      OWNER_CANCEL_EMAIL_HMAC: emailHmac(ownerCancel.email),
      INVITE_A_ID: invitationAId,
      INVITE_A_HASH: sha256(Buffer.from(invitationA, 'hex')),
      INVITE_CANCEL_ID: invitationCancelId,
      INVITE_CANCEL_HASH: sha256(Buffer.from(invitationCancel, 'hex')),
      MAINT_INVITE_ID: maintenanceInvitationId,
      MAINT_INVITE_HASH: maintenanceInvitationHash,
      MAINT_PENDING_ID: maintenancePendingId,
      MAINT_CONSENT_ID: maintenanceConsentId,
      MAINT_RECEIPT_ID: maintenanceReceiptId,
      CLAIM_ID: claimId,
      SIGNAL_EVENT_A: authorityEventA,
      SIGNAL_EVENT_B: authorityEventB,
    })
    await service.sql(fixtureSql)
    const fixtureIdentity = sha256(`${local.fixtureIdentity}\n${fixtureSource}\n${fixtureSql}`)
    report.fixtureIdentity = fixtureIdentity
    report.fixtureSourceIdentity = sha256(fixtureSource)
    report.ownerMaintenanceSetup =
      'Synthetic established Owner fixture: separate exact Store A claim, followed by Site Admin approval.'
    report.localClaimIntake = {
      status: 'missing-owned-work',
      reason:
        'The invited draft does not create a listing claim, and local synthetic-alpha does not expose the guided claim-intake path. The separate established Owner fixture proves maintenance only; it does not prove invitation-to-claim acceptance. This is missing issue work, not an external service blocker.',
    }
    report.localInvitationSetup =
      'synthetic applicant and cancellation tokens; no email provider used'
    report.ownerIdentityIds = {
      ownerA: ownerA.id,
      ownerApplicant: ownerApplicant.id,
      ownerCancel: ownerCancel.id,
      admin: admin.id,
    }

    const input = {
      endpoint: local.endpoint,
      anonKey: local.anonKey,
      origin,
      output: output.directory,
      storeA,
      storeB,
      claimId,
      invitationA,
      invitationCancel,
      ownerA: { email: ownerA.email, password: ownerA.password, totpSecret: ownerATotp },
      ownerApplicant: {
        email: ownerApplicant.email,
        password: ownerApplicant.password,
        totpSecret: ownerApplicantTotp,
      },
      ownerCancel: {
        email: ownerCancel.email,
        password: ownerCancel.password,
        totpSecret: ownerCancelTotp,
      },
      shopper: { email: shopper.email, password: shopper.password },
      admin: { email: admin.email, password: admin.password, totpSecret: adminTotp },
    }
    ownerSecretFile = path.join(local.directory, 'owner-listing-browser-input.json')
    fs.writeFileSync(ownerSecretFile, JSON.stringify(input), { mode: 0o600, flag: 'wx' })

    const env = {
      ...process.env,
      VITE_SUPABASE_URL: local.endpoint,
      VITE_SUPABASE_ANON_KEY: local.anonKey,
      VITE_REVIEW_HARNESS: 'false',
      VITE_STORE_OWNER_INTERNAL_ENABLED: 'true',
      VITE_PARTNER_SYNTHETIC_ENABLED: 'true',
      GITHUB_PAGES: 'false',
      VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
      VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
      CONFIGURED_OWNER_LISTING_INPUT: ownerSecretFile,
    }
    const build = path.join(local.directory, 'owner-listing-dist')
    await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], {
      env,
      signal: controller.signal,
    })
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--outDir',
        build,
        '--host',
        '127.0.0.1',
        '--port',
        new URL(origin).port,
        '--strictPort',
      ],
      { cwd: ROOT, env, windowsHide: true, stdio: 'ignore' },
    )
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(origin)).ok) {
          ready = true
          break
        }
      } catch {
        /* bounded readiness */
      }
      await sleep(500)
    }
    if (!ready) throw new Error('Configured Owner listing preview unavailable')

    try {
      await command(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'e2e/configured-owner-listing-playwright.config.ts',
        ],
        { env, timeout: 900_000, signal: controller.signal },
      )
      report.status = 'passed'
    } catch (error) {
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
    const stepPath = path.join(output.directory, 'steps.json')
    if (fs.existsSync(stepPath)) {
      const steps = JSON.parse(fs.readFileSync(stepPath, 'utf8'))
      report.stepResults = Array.isArray(steps)
        ? steps.map((step) => ({
            name: typeof step?.name === 'string' ? step.name : 'unavailable',
            status:
              step?.status === 'running'
                ? 'incomplete'
                : ['pending', 'passed', 'failed'].includes(step?.status)
                  ? step.status
                  : 'unavailable',
            durationMs:
              Number.isFinite(step?.durationMs) && step.durationMs >= 0
                ? Math.round(step.durationMs)
                : step?.status === 'running' && Number.isFinite(step?.startedAtMs)
                  ? Math.max(0, Date.now() - step.startedAtMs)
                  : 0,
          }))
        : []
    }
    const resultPath = path.join(output.directory, 'playwright.json')
    if (!fs.existsSync(resultPath)) {
      report.status = 'unavailable'
      report.errors.push('Missing configured Owner listing Playwright report')
    } else {
      const results = representativeHoursReport(fs.readFileSync(resultPath, 'utf8'), 1)
      report.stats = results.stats
      report.checks = results.checks
      if (results.status !== 'passed' || report.status !== 'passed') report.status = 'failed'
      else if (report.localClaimIntake.status === 'missing-owned-work') report.status = 'blocked'
    }
    report.screenshots = screenshotArtifacts(path.join(output.directory, 'browser'))
    report.browserOrigin = origin
    for (const key of [
      'sourceSha',
      'schemaIdentity',
      'functionIdentity',
      'configIdentity',
      'endpoint',
      'projectId',
    ])
      report[key] = local[key]
    report.sourceDirty = Boolean(
      (await command('git', ['status', '--porcelain', '--untracked-files=all'])).trim(),
    )
  } catch (error) {
    if (report.status !== 'blocked') report.status = 'failed'
    report.errors.push(redact(error.message))
  } finally {
    restorePartnerEnvironment()
    await stopChild(server)
    if (service) {
      try {
        if (ownerSecretFile) fs.rmSync(ownerSecretFile, { force: true })
      } catch (error) {
        report.status = 'failed'
        report.errors.push(redact(error.message))
      }
      try {
        report.cleanup = await service.cleanup()
      } catch (error) {
        report.cleanup = controller.signal.aborted
          ? 'preserved-for-owner-checked-cleanup'
          : 'failed'
        report.status = 'failed'
        if (controller.signal.aborted) {
          report.ownerMarker = path.join(service.run.directory, '.owner.json')
          report.errors.push(
            'Interrupted run preserves its isolated Supabase project and owner marker.',
          )
        }
        report.errors.push(redact(error.message))
      }
    }
    fs.writeFileSync(
      path.join(output.directory, 'report.json'),
      JSON.stringify(redact(report), null, 2),
    )
  }
}

async function runDefault() {
  try {
    report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
    if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
      throw new Error('External endpoint selection is forbidden')
    const origin = `http://127.0.0.1:${await freePort()}`
    service = createLocalService({ signal: controller.signal, browserOrigin: origin })
    report.temporaryProject = service.run.directory
    const local = await service.start()
    function expandSql(file) {
      return fs
        .readFileSync(file, 'utf8')
        .replace(/^\\ir\s+(.+)$/gm, (_, child) =>
          expandSql(path.resolve(path.dirname(file), child.trim())),
        )
    }
    report.ownerCancellationDatabase = []
    for (const file of ['0132_store_owner_access.sql', '0133_issue_424_store_team_access.sql']) {
      const result = await service.sql(expandSql(path.join(ROOT, 'supabase/tests', file)))
      if (/^not ok/m.test(result)) throw new Error(`Owner cancellation pgTAP failed: ${file}`)
      report.ownerCancellationDatabase.push({
        file,
        assertions: (result.match(/^ok \d+/gm) ?? []).length,
        status: 'passed',
      })
    }
    report.status = 'running'
    const fixture = await provisionRepresentative(local)
    local.fixtureIdentity = crypto
      .createHash('sha256')
      .update(local.fixtureIdentity)
      .update(
        fs.readFileSync(path.join(ROOT, 'scripts/configured-representative-hours-fixtures.sql')),
      )
      .digest('hex')
    for (const key of [
      'sourceSha',
      'sourceDirty',
      'schemaIdentity',
      'functionIdentity',
      'fixtureIdentity',
      'configIdentity',
      'endpoint',
      'projectId',
    ])
      report[key] = local[key]
    report.browserOrigin = origin
    const input = {
      ...local,
      ...fixture,
      directory: service.run.directory,
      origin,
      output: output.directory,
    }
    const secretFile = path.join(local.directory, 'representative-hours-browser-input.json')
    fs.writeFileSync(secretFile, JSON.stringify(input), { mode: 0o600, flag: 'wx' })
    const env = {
      ...process.env,
      VITE_SUPABASE_URL: local.endpoint,
      VITE_SUPABASE_ANON_KEY: local.anonKey,
      VITE_REVIEW_HARNESS: 'false',
      VITE_STORE_OWNER_INTERNAL_ENABLED: 'true',
      GITHUB_PAGES: 'false',
      VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
      VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
      CONFIGURED_REPRESENTATIVE_HOURS_INPUT: secretFile,
    }
    const build = path.join(local.directory, 'representative-hours-dist')
    await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], {
      env,
      signal: controller.signal,
    })
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--outDir',
        build,
        '--host',
        '127.0.0.1',
        '--port',
        new URL(origin).port,
        '--strictPort',
      ],
      { cwd: ROOT, env, windowsHide: true, stdio: 'ignore' },
    )
    let ready = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(origin)).ok) {
          ready = true
          break
        }
      } catch {
        /* bounded readiness */
      }
      await sleep(500)
    }
    if (!ready) throw new Error('Configured Representative preview unavailable')
    try {
      await command(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'e2e/configured-representative-hours-playwright.config.ts',
        ],
        { env, timeout: 900_000, signal: controller.signal },
      )
      report.status = 'passed'
    } catch (error) {
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
    const resultPath = path.join(output.directory, 'playwright.json')
    if (!fs.existsSync(resultPath)) {
      report.status = 'unavailable'
      report.errors.push('Missing Playwright report')
    } else {
      const results = representativeHoursReport(fs.readFileSync(resultPath, 'utf8'), 6)
      report.stats = results.stats
      report.checks = results.checks
      if (results.status !== 'passed') report.status = 'failed'
    }
    if (report.status === 'passed') {
      const ownerFixture = await provisionOwner(local, fixture)
      const ownerOutput = path.join(output.directory, 'owner-billing')
      fs.mkdirSync(ownerOutput, { recursive: true })
      const ownerInput = { ...ownerFixture, origin, output: ownerOutput }
      ownerSecretFile = path.join(local.directory, 'owner-billing-browser-input.json')
      fs.writeFileSync(ownerSecretFile, JSON.stringify(ownerInput), { mode: 0o600, flag: 'wx' })
      await command(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'e2e/configured-owner-billing-status-playwright.config.ts',
        ],
        {
          env: { ...env, CONFIGURED_OWNER_BILLING_INPUT: ownerSecretFile },
          timeout: 900_000,
          signal: controller.signal,
        },
      )
      const ownerResultPath = path.join(ownerOutput, 'playwright.json')
      if (!fs.existsSync(ownerResultPath))
        throw new Error('Missing configured Owner Playwright report')
      const ownerResults = JSON.parse(fs.readFileSync(ownerResultPath, 'utf8'))
      report.ownerStats = ownerResults.stats
      if (
        ownerResults.stats?.expected !== 1 ||
        ownerResults.stats?.unexpected ||
        ownerResults.stats?.skipped
      )
        throw new Error('Configured Owner browser proof did not pass exactly one test')
      // Separate local fake-provider scenario; deployed/default billing stays read-only.
      await service.sql(`
      begin;
      insert into partner_private.photo_tier_commercial_configs(version,state) values(426,'draft');
      update partner_private.photo_tier_sales_control set state='servicing_only',commercial_config_version=426 where singleton;
      update partner_private.store_photo_tier_state set tier='gallery',source='subscription',version=version+1 where store_id='${ownerFixture.storeId}';
      insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
        values('${ownerFixture.storeId}','cus_fake426000001','sub_fake426000001','active',statement_timestamp()+interval '30 days');
      insert into partner_private.owner_cancellation_fake_provider(store_id,subscription_id) values('${ownerFixture.storeId}','sub_fake426000001');
      update partner_private.owner_cancellation_test_control set enabled=true;
      commit;
    `)
      const cancellationOutput = path.join(output.directory, 'owner-cancellation')
      fs.mkdirSync(cancellationOutput, { recursive: true })
      fs.writeFileSync(
        ownerSecretFile,
        JSON.stringify({ ...ownerInput, output: cancellationOutput, cancellation: true }),
        { mode: 0o600 },
      )
      await command(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'e2e/configured-owner-billing-status-playwright.config.ts',
        ],
        {
          env: { ...env, CONFIGURED_OWNER_BILLING_INPUT: ownerSecretFile },
          timeout: 900_000,
          signal: controller.signal,
        },
      )
      const cancellationResults = JSON.parse(
        fs.readFileSync(path.join(cancellationOutput, 'playwright.json'), 'utf8'),
      )
      report.ownerCancellationStats = cancellationResults.stats
      if (
        cancellationResults.stats?.expected !== 1 ||
        cancellationResults.stats?.unexpected ||
        cancellationResults.stats?.skipped
      )
        throw new Error('Configured Owner cancellation proof did not pass exactly one test')
      const workerResult = await runLocalOwnerCancellation(service)
      if (!workerResult || workerResult.pending !== 0)
        throw new Error('Local cancellation worker did not reconcile its durable obligation')
      report.ownerCancellationWorker = workerResult
      const verifiedOutput = path.join(output.directory, 'owner-cancellation-verified')
      fs.mkdirSync(verifiedOutput, { recursive: true })
      fs.writeFileSync(
        ownerSecretFile,
        JSON.stringify({
          ...ownerInput,
          output: verifiedOutput,
          cancellation: true,
          cancellationVerified: true,
        }),
        { mode: 0o600 },
      )
      await command(
        process.execPath,
        [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'e2e/configured-owner-billing-status-playwright.config.ts',
        ],
        {
          env: { ...env, CONFIGURED_OWNER_BILLING_INPUT: ownerSecretFile },
          timeout: 900_000,
          signal: controller.signal,
        },
      )
      const verifiedResults = JSON.parse(
        fs.readFileSync(path.join(verifiedOutput, 'playwright.json'), 'utf8'),
      )
      report.ownerCancellationVerifiedStats = verifiedResults.stats
      if (
        verifiedResults.stats?.expected !== 1 ||
        verifiedResults.stats?.unexpected ||
        verifiedResults.stats?.skipped
      )
        throw new Error('Configured verified cancellation did not pass exactly one test')
    }
  } catch (error) {
    if (report.status !== 'unavailable') report.status = 'failed'
    report.errors.push(redact(error.message))
  } finally {
    await stopChild(server)
    if (service) {
      try {
        fs.rmSync(path.join(service.run.directory, 'representative-hours-browser-input.json'), {
          force: true,
        })
        if (ownerSecretFile) fs.rmSync(ownerSecretFile, { force: true })
      } catch (error) {
        report.status = 'failed'
        report.errors.push(redact(error.message))
      }
      try {
        report.cleanup = await service.cleanup()
      } catch (error) {
        report.cleanup = controller.signal.aborted
          ? 'preserved-for-owner-checked-cleanup'
          : 'failed'
        report.status = 'failed'
        if (controller.signal.aborted) {
          report.ownerMarker = path.join(service.run.directory, '.owner.json')
          report.errors.push(
            'Interrupted run preserves its isolated Supabase project and owner marker.',
          )
        }
        report.errors.push(redact(error.message))
      }
    }
    fs.writeFileSync(
      path.join(output.directory, 'report.json'),
      JSON.stringify(redact(report), null, 2),
    )
  }
}

await (ownerListingMode ? runOwnerListing() : runDefault())
console.log(`${report.status}: ${output.directory}`)
process.exitCode =
  interruptSignal === 'SIGINT'
    ? 130
    : interruptSignal === 'SIGTERM'
      ? 143
      : report.status === 'passed'
        ? 0
        : 1
