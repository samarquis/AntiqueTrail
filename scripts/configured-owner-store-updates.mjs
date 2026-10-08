#!/usr/bin/env node
/* global process, fetch, URL, AbortController, AbortSignal, Buffer, setTimeout */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  command,
  createLocalService,
  freePort,
  ROOT,
  stopChild,
} from './configured-shopper-local.mjs'
import { createRunDirectory, redact } from './configured-shopper-probe.mjs'

const controller = new AbortController()
const output = createRunDirectory(path.join(ROOT, 'artifacts'))
const report = {
  scope: 'issue-581-owner-store-updates',
  evidenceClass: 'real-local-database-and-browser',
  status: 'unavailable',
  sourceSha: null,
  expectedSourceSha: null,
  sourceDirty: null,
  cliVersion: null,
  cleanup: 'not-started',
  database: { status: 'not-started', plan: null, assertions: 0, skipped: 0, failed: 0, cases: [] },
  browser: { status: 'not-started' },
  errors: [],
}
const uuid = () => crypto.randomUUID()
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
let service, server, secretFile

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => controller.abort(new Error(signal)))

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function chicagoYesterday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  )
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1))
    .toISOString()
    .slice(0, 10)
    .slice(0, 10)
}

function expandSql(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^\\ir\s+(.+)$/gm, (_, child) =>
      expandSql(path.resolve(path.dirname(file), child.trim())),
    )
}

async function localAuth(local, token, route, body) {
  const response = await fetch(`${local.endpoint}${route}`, {
    method: 'POST',
    headers: {
      apikey: local.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
  })
  const data = await response.json()
  if (!response.ok) {
    const code = String(data?.code ?? data?.error_code ?? 'unavailable')
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 80)
    throw new Error(`Local Auth ${route} failed with ${response.status} ${code}`)
  }
  return data
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function provisionOwner(local) {
  const owner = local.users[0]
  if (!owner || typeof owner.id !== 'string' || typeof owner.email !== 'string')
    throw new Error('Local Owner identity is unavailable')

  const areaId = uuid()
  const storeId = uuid()
  const siblingStoreId = uuid()
  const storeSlug = `issue-581-${uuid().replaceAll('-', '').slice(0, 12)}`
  const siblingSlug = `${storeSlug}-sibling`
  const claimId = uuid()
  const invitationId = uuid()
  const pendingIdentityId = uuid()
  const provisionalConsentId = uuid()
  const pilotConsentReceiptId = uuid()
  const adminId = '58100000-0000-4000-8000-000000000002'
  const adminSessionId = '58100000-0000-4000-8000-000000000003'
  const authorityEventA = uuid()
  const authorityEventB = uuid()

  const enrolled = await localAuth(local, owner.token, '/auth/v1/factors', {
    factor_type: 'totp',
    friendly_name: 'issue-581-local',
  })
  if (typeof enrolled.id !== 'string' || typeof enrolled.totp?.secret !== 'string')
    throw new Error('Local MFA enrollment response malformed')
  const challenge = await localAuth(
    local,
    owner.token,
    `/auth/v1/factors/${enrolled.id}/challenge`,
    {},
  )
  if (typeof challenge.id !== 'string') throw new Error('Local MFA challenge malformed')
  await localAuth(local, owner.token, `/auth/v1/factors/${enrolled.id}/verify`, {
    challenge_id: challenge.id,
    code: totp(enrolled.totp.secret),
  })

  await service.sql(`
    begin;
    update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
    update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
    insert into app_public.catalog_areas(id,slug,label,state_code,sort_order)
      values('${areaId}','${storeSlug}-area','Issue 581 local area','KS',0);
    insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,timezone_name,synthetic,audience,publication_state)
      values
        ('${storeId}','${storeSlug}','Issue 581 Store A','Topeka','KS','1 Synthetic Way','${areaId}',
          'Local Owner update fixture','Synthetic Owner A store','America/Chicago',true,'synthetic','active'),
        ('${siblingStoreId}','${siblingSlug}','Issue 581 Store B','Topeka','KS','2 Synthetic Way','${areaId}',
          'Local Owner update fixture','Unowned sibling store','America/Chicago',true,'synthetic','active');
    insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label)
      select stores.store_id,groups.verification_group,statement_timestamp(),'Issue 581 local synthetic catalog fixture'
      from (values ('${storeId}'::uuid),('${siblingStoreId}'::uuid)) stores(store_id)
      cross join unnest(array['identity_location','contact','hours','categories_attributes']::app_public.verification_group[]) groups(verification_group);
    update app_private.profiles set verified_email_snapshot=${sqlText(owner.email)} where user_id='${owner.id}';
    insert into auth.users(id,email,email_confirmed_at)
      values('${adminId}','admin581@example.test',statement_timestamp());
    update app_private.profiles set verified_email_snapshot='admin581@example.test'
      where user_id='${adminId}';
    insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
      values('58100000-0000-4000-8000-000000000009','${adminId}','totp','verified',statement_timestamp(),statement_timestamp());
    insert into app_private.role_grants(subject_user_id,role) values('${adminId}','administrator');
    set local role identity_service;
    insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
      values('${adminSessionId}','${adminId}',statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes');
    reset role;
    insert into partner_private.partner_invitations(
      invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at
    ) values (
      '${invitationId}',decode(repeat('58',32),'hex'),decode(repeat('59',32),'hex'),
      '${adminId}','consumed',statement_timestamp()
    );
    insert into partner_private.pending_partner_identities(
      pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at
    ) values (
      '${pendingIdentityId}','${invitationId}',decode(repeat('59',32),'hex'),'${owner.id}',
      'bound',statement_timestamp(),statement_timestamp(),statement_timestamp()
    );
    insert into partner_private.provisional_partner_consents(
      provisional_consent_id,invitation_id,pending_identity_id,policy_version,typed_name,business_title,store_name,
      owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key
    ) values (
      '${provisionalConsentId}','${invitationId}','${pendingIdentityId}','synthetic-v3','Owner 581','Owner',
      'Issue 581 Store A',decode(repeat('59',32),'hex'),true,true,true,true,true,'issue581-pilot-${claimId}'
    );
    insert into partner_private.pilot_consent_receipts(
      consent_receipt_id,provisional_consent_id,pending_identity_id,invitation_id,auth_user_id,verified_email_hmac,
      policy_version,receipt_checksum
    ) values (
      '${pilotConsentReceiptId}','${provisionalConsentId}','${pendingIdentityId}','${invitationId}',
      '${owner.id}',decode(repeat('59',32),'hex'),'synthetic-v3',decode(repeat('5a',32),'hex')
    );
    update partner_private.partner_invitations set synthetic=true,
      issuance_idempotency_key='issue581-owner-${claimId}',raw_returned_at=created_at,
      expires_at=created_at+interval '30 minutes'
    where invitation_id='${invitationId}';
    insert into partner_private.public_claim_consent_receipts(
      auth_user_id,policy_version,reviewed_ack,voluntary_ack,idempotency_key,receipt_checksum
    )
    select '${owner.id}',policy_version,true,true,'issue581-public-${claimId}',decode(repeat('58',32),'hex')
    from partner_private.partner_material_terms where is_current;
    insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
      values('${claimId}','${owner.id}','${storeId}','store owner','Synthetic Owner authority for local proof.');
    insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id)
      values
        ('${claimId}','published_business_contact','domain_response','verified','${adminId}',statement_timestamp(),decode(repeat('61',32),'hex'),decode(repeat('62',32),'hex'),'${authorityEventA}'),
        ('${claimId}','callback','callback','verified','${adminId}',statement_timestamp(),decode(repeat('63',32),'hex'),decode(repeat('64',32),'hex'),'${authorityEventB}');
    update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id='${claimId}';
    update partner_private.listing_claims set state='verification_pending' where claim_id='${claimId}';
    insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id)
      values('${owner.id}','claim','${claimId}');
    select set_config('request.jwt.claims',jsonb_build_object(
      'sub','${adminId}','session_id','${adminSessionId}','role','authenticated','aal','aal2','amr',jsonb_build_array(
        jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
        jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);
    set local role authenticated;
    select app_public.owner_admin_approve_claim('${claimId}','${storeId}',
      (select version from partner_private.listing_claims where claim_id='${claimId}'),'issue581-local-${claimId}');
    reset role;
    commit;
  `)

  const ownerFixture = await service.sql(`
    select case when
      exists(
        select 1 from partner_private.pending_partner_identities p
        join partner_private.partner_invitations i using (invitation_id)
        where p.auth_user_id='${owner.id}' and p.state='bound' and i.synthetic
      )
      and exists(
        select 1 from partner_private.pilot_consent_receipts r
        where r.auth_user_id='${owner.id}' and r.policy_version='synthetic-v3'
      )
      and exists(
        select 1 from partner_private.public_claim_consent_receipts r
        join partner_private.partner_material_terms t using (policy_version)
        where r.auth_user_id='${owner.id}' and t.is_current
      )
      and exists(
        select 1 from auth.mfa_factors
        where user_id='${owner.id}' and factor_type='totp' and status='verified'
      )
      and (select count(*) from app_private.role_grants
        where subject_user_id='${owner.id}' and store_id='${storeId}' and role='store_owner' and state='active')=1
      and not exists(select 1 from app_private.role_grants
        where subject_user_id='${owner.id}' and store_id='${siblingStoreId}' and role='store_owner' and state='active')
      and (select count(*) from partner_private.store_partner_grants
        where auth_user_id='${owner.id}' and store_id='${storeId}' and role='store_owner' and state='active')=1
      and not exists(select 1 from partner_private.store_partner_grants
        where auth_user_id='${owner.id}' and store_id='${siblingStoreId}' and role='store_owner' and state='active')
      then 'complete' else 'incomplete' end;
  `)
  if (ownerFixture.trim() !== 'complete')
    throw new Error('Synthetic current-consent Owner/MFA/store-scope fixture incomplete')

  const expiredSaleEndDate = chicagoYesterday()
  const expiredSaleId = uuid()
  const expiredSale = {
    type: 'sale',
    headline: 'Expired sale fixture',
    details: 'This expired sale must stay out of public results.',
    endDate: expiredSaleEndDate,
    imageRequested: false,
  }
  await service.sql(`
    insert into portal_private.store_updates(
      update_id,store_id,author_user_id,update_type,headline,details,end_date,content_digest
    ) values (
      '${expiredSaleId}','${storeId}','${owner.id}','sale',
      'Expired sale fixture','This expired sale must stay out of public results.',
      '${expiredSaleEndDate}'::date,
      extensions.digest(convert_to(jsonb_strip_nulls(${sqlText(JSON.stringify(expiredSale))}::jsonb)::text,'utf8'),'sha256')
    );
  `)

  return {
    endpoint: local.endpoint,
    anonKey: local.anonKey,
    origin: `http://127.0.0.1:${await freePort()}`,
    storeId,
    siblingStoreId,
    storeSlug,
    siblingSlug,
    storeName: 'Issue 581 Store A',
    owner: { email: owner.email, password: owner.password, totpSecret: enrolled.totp.secret },
  }
}

try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'], { cwd: ROOT })).trim()
  const expectedSourceSha = process.env.ISSUE_581_EXPECTED_SOURCE_SHA
  if (process.env.GITHUB_ACTIONS === 'true' && !/^[0-9a-f]{40}$/.test(expectedSourceSha ?? ''))
    throw new Error('Expected candidate SHA is required in hosted verification')
  if (expectedSourceSha && !/^[0-9a-f]{40}$/.test(expectedSourceSha))
    throw new Error('Expected candidate SHA is malformed')
  report.expectedSourceSha = expectedSourceSha ?? null
  if (expectedSourceSha && report.sourceSha !== expectedSourceSha)
    throw new Error('Checked-out source does not match expected candidate SHA')
  if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('External endpoint selection is forbidden')

  service = createLocalService({ signal: controller.signal, disableStorage: true })
  report.temporaryProject = service.run.directory
  const local = await service.start()
  report.sourceDirty = Boolean(local.sourceDirty)
  report.cliVersion = local.cliVersion
  if (local.sourceSha !== report.sourceSha || local.sourceDirty)
    throw new Error('Source changed during hosted fixture preparation')
  report.projectId = local.projectId
  report.database.source = 'supabase/tests/0141_issue_581_store_updates.sql'
  const dbResult = await service.sql(
    expandSql(path.join(ROOT, 'supabase/tests/0141_issue_581_store_updates.sql')),
  )
  const databaseCases = dbResult
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:ok|not ok) \d+(?:\s|$)/.test(line))
    .map((line) => {
      const match = line.match(/^(ok|not ok) (\d+)(?: - (.*?))?(?: # (SKIP.*))?$/)
      if (!match)
        return {
          number: Number(line.match(/\d+/)?.[0] ?? 0),
          status: 'unparsed',
          name: 'Unparsed pgTAP result',
          skip: null,
        }
      return {
        number: Number(match[2]),
        status: match[1] === 'ok' ? 'passed' : 'failed',
        name: redact(match[3] ?? 'Unlabeled pgTAP result')
          .replace(/[\r\n]/g, ' ')
          .trim(),
        skip: match[4] ? redact(match[4]) : null,
      }
    })
  const plan = dbResult.match(/^1\.\.(\d+)$/m)
  report.database.plan = plan ? Number(plan[1]) : null
  report.database.assertions = databaseCases.length
  report.database.skipped = databaseCases.filter((test) => test.skip !== null).length
  report.database.failed = databaseCases.filter((test) => test.status !== 'passed').length
  report.database.cases = databaseCases
  if (!plan || Number(plan[1]) !== databaseCases.length || databaseCases.length === 0)
    throw new Error('Issue 581 Owner update pgTAP result count did not match its plan')
  if (databaseCases.some((test) => test.status !== 'passed'))
    throw new Error('Issue 581 Owner update pgTAP failed or returned an unparsed case')
  report.database.status = 'passed'

  const fixture = await provisionOwner(local)
  report.schemaIdentity = local.schemaIdentity
  report.functionIdentity = local.functionIdentity
  report.fixtureIdentity = crypto
    .createHash('sha256')
    .update(`${fixture.storeId}|${fixture.siblingStoreId}|${fixture.storeSlug}`)
    .digest('hex')
  report.browser.origin = fixture.origin

  const secretPath = path.join(local.directory, 'issue-581-browser-input.json')
  secretFile = secretPath
  fs.writeFileSync(secretPath, JSON.stringify({ ...local, ...fixture, output: output.directory }), {
    flag: 'wx',
    mode: 0o600,
  })
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    VITE_STORE_OWNER_INTERNAL_ENABLED: 'true',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
    GITHUB_PAGES: 'false',
    CONFIGURED_OWNER_STORE_UPDATES_INPUT: secretPath,
  }
  const port = Number(new URL(fixture.origin).port)
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: ROOT, env, stdio: 'ignore', windowsHide: true },
  )
  let ready = false
  for (let attempt = 0; attempt < 60 && !controller.signal.aborted; attempt += 1) {
    try {
      const response = await fetch(fixture.origin, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      /* bounded readiness */
    }
    await sleep(500)
  }
  if (!ready) throw new Error('Configured Owner Store Updates preview unavailable')

  report.status = 'running'
  const browserResult = await command(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'e2e/configured-owner-store-updates-playwright.config.ts',
    ],
    { cwd: ROOT, env, timeout: 900_000, signal: controller.signal },
  )
  report.browser.status = 'passed'
  const reportFile = path.join(output.directory, 'playwright.json')
  if (!fs.existsSync(reportFile))
    throw new Error('Missing configured Owner updates Playwright report')
  const playwrightReport = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
  report.browser.stats = playwrightReport.stats ?? null
  report.browser.testFile = 'e2e/configured-owner-store-updates.spec.ts'
  report.browser.testName =
    'configured Owner edits text through selected-store context and shoppers see newest live updates'
  report.browser.commandExit = browserResult.exitCode ?? 0
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.errors.push(redact(String(error?.message ?? 'unknown_error')))
} finally {
  let cleanupFailed = false
  try {
    if (server) await stopChild(server)
  } catch (error) {
    cleanupFailed = true
    report.errors.push(
      redact(`local_preview_cleanup_failed: ${String(error?.message ?? 'unknown_error')}`),
    )
  }
  try {
    if (service) report.cleanup = await service.cleanup()
  } catch (error) {
    cleanupFailed = true
    report.cleanup = 'failed'
    report.errors.push(
      redact(`local_service_cleanup_failed: ${String(error?.message ?? 'unknown_error')}`),
    )
  }
  try {
    if (secretFile && fs.existsSync(secretFile)) fs.rmSync(secretFile, { force: true })
  } catch (error) {
    cleanupFailed = true
    report.errors.push(
      redact(`temporary_input_cleanup_failed: ${String(error?.message ?? 'unknown_error')}`),
    )
  }
  if (cleanupFailed) report.status = 'failed'
  fs.writeFileSync(path.join(output.directory, 'issue-581.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

if (report.status !== 'passed') process.exitCode = 1
