#!/usr/bin/env node
/* global AbortController, AbortSignal, Buffer, URL, console, fetch, process, setTimeout */
/* #580: loopback-only Owner/Admin media replacement acceptance harness. */
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

const output = createRunDirectory(path.join(ROOT, 'artifacts'))
const controller = new AbortController()
const report = {
  scope: 'issue-580-owner-media-replacement',
  evidenceClass: 'real-local-database-and-browser-with-synthetic-media-worker',
  status: 'unavailable',
  cleanup: 'not-started',
  errors: [],
  database: null,
  browser: null,
}
let service, preview, inputFile, interruptSignal
const uuid = () => crypto.randomUUID()
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    interruptSignal = signal
    controller.abort(new Error(signal))
  })

function decodeJwt(token) {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Local Auth returned a malformed token')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits += index.toString(2).padStart(5, '0')
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((chunk) => Number.parseInt(chunk, 2)) ?? [])
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function auth(local, route, { token = local.anonKey, body }) {
  const url = new URL(route, local.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Configured Owner media Auth is limited to literal loopback')
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
    headers: {
      apikey: local.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Local Auth ${route} returned ${response.status}`)
  return result
}

async function createActor(local, role) {
  const email = `${role}-${service.run.id}@probe.invalid`
  const password = crypto.randomBytes(24).toString('base64url')
  const created = await auth(local, '/auth/v1/signup', {
    body: { email, password },
  })
  const id = created?.user?.id ?? created?.id
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error(`Local ${role} fixture creation failed`)
  await service.sql(`
    update auth.users set email_confirmed_at=coalesce(email_confirmed_at,statement_timestamp()) where id=${sqlText(id)};
    update app_private.profiles set verified_email_snapshot=${sqlText(email)} where user_id=${sqlText(id)};
  `)
  const passwordSession = await auth(local, '/auth/v1/token?grant_type=password', {
    body: { email, password },
  })
  const factor = await auth(local, '/auth/v1/factors', {
    token: passwordSession.access_token,
    body: { factor_type: 'totp', friendly_name: `issue-580-${role}` },
  })
  const factorId = factor?.id
  const secret = factor?.totp?.secret
  if (typeof factorId !== 'string' || typeof secret !== 'string')
    throw new Error(`Local ${role} MFA enrollment failed`)
  const challenge = await auth(local, `/auth/v1/factors/${factorId}/challenge`, {
    token: passwordSession.access_token,
    body: {},
  })
  const verified = await auth(local, `/auth/v1/factors/${factorId}/verify`, {
    token: passwordSession.access_token,
    body: { challenge_id: challenge.id, code: totp(secret) },
  })
  const claims = decodeJwt(verified.access_token ?? passwordSession.access_token)
  if (typeof claims.session_id !== 'string')
    throw new Error(`Local ${role} session id is unavailable`)
  return { id, email, password, totpSecret: secret, sessionId: claims.session_id }
}

function expandSql(file) {
  const source = fs.readFileSync(file, 'utf8')
  return source.replace(/^\\ir\s+(.+)$/gm, (_, child) =>
    expandSql(path.resolve(path.dirname(file), child.trim())),
  )
}

async function runDatabaseAcceptance() {
  const source = expandSql(path.join(ROOT, 'supabase/tests/0140_issue_580_media_replacement.sql'))
  const output = await service.sql(source)
  const assertions = (output.match(/^ok \d+/gm) ?? []).length
  const failures = (output.match(/^not ok \d+/gm) ?? []).length
  if (!assertions || failures || /^not ok/m.test(output))
    throw new Error('Issue #580 local database acceptance failed')
  report.database = { assertions, failures, status: 'passed' }
}

async function provisionBrowserFixtures(local) {
  const owner = await createActor(local, 'owner')
  const admin = await createActor(local, 'admin')
  const storeId = uuid()
  const claimId = uuid()
  const areaId = '00000000-0000-4000-8000-000000000001'
  const categoryId = uuid()
  const slug = `issue-580-${uuid().replaceAll('-', '').slice(0, 16)}`
  const eventA = uuid(),
    eventB = uuid()
  const releaseId = uuid(),
    gateId = uuid()
  const mediaIds = {
    cover: uuid(),
    gallery: Array.from({ length: 5 }, () => uuid()),
  }
  const uploads = [
    {
      mediaId: mediaIds.cover,
      uploadId: uuid(),
      kind: 'cover',
      alt: 'Approved cover before replacement',
      order: 0,
    },
    ...mediaIds.gallery.map((mediaId, index) => ({
      mediaId,
      uploadId: uuid(),
      kind: 'gallery',
      alt: `Approved gallery image ${['one', 'two', 'three', 'four', 'five'][index]}`,
      order: index + 1,
    })),
  ]
  const mediaRows = uploads
    .map(
      ({ mediaId, kind, alt, order }) =>
        `(${sqlText(mediaId)},${sqlText(storeId)},${sqlText(`/assets/issue580-current-${kind}-${order}.webp`)},${sqlText(kind)},${sqlText(alt)},${order})`,
    )
    .join(',\n')
  const uploadRows = uploads
    .map(({ mediaId, uploadId, kind, alt, order }, index) => {
      const hash = (index + 1).toString(16).padStart(2, '0')
      return `(${sqlText(uploadId)},${sqlText(owner.id)},${sqlText(storeId)},${sqlText(kind)},${sqlText(alt)},statement_timestamp(),gen_random_uuid(),'image/png',1000,640,480,${sqlText(`quarantine/${uploadId}/original`)},${sqlText(`quarantine/${uploadId}/derivative.webp`)},${sqlText(`official/${uploadId}/v1/${hash.repeat(16)}.webp`)},decode(repeat('${hash}',32),'hex'),100000,640,480,'clean',true,true,'published',${sqlText(admin.id)},statement_timestamp(),'administrator_approved',${order},${sqlText(mediaId)},statement_timestamp())`
    })
    .join(',\n')
  const verifications = ['identity_location', 'contact', 'hours', 'categories_attributes']
    .map(
      (group) =>
        `(${sqlText(storeId)},${sqlText(group)}::app_public.verification_group,statement_timestamp(),'Synthetic #580 browser fixture')`,
    )
    .join(',\n')
  const signals = `
    (${sqlText(claimId)},'published_business_contact','domain_response','verified',${sqlText(admin.id)},statement_timestamp(),decode(repeat('41',32),'hex'),decode(repeat('42',32),'hex'),${sqlText(eventA)}),
    (${sqlText(claimId)},'callback','callback','verified',${sqlText(admin.id)},statement_timestamp(),decode(repeat('43',32),'hex'),decode(repeat('44',32),'hex'),${sqlText(eventB)})`
  const ownerSession = owner.sessionId
  const adminSession = admin.sessionId
  const adminClaims = {
    sub: admin.id,
    session_id: adminSession,
    role: 'authenticated',
    aal: 'aal2',
    amr: [
      { method: 'password', timestamp: Math.floor(Date.now() / 1000) },
      { method: 'totp', timestamp: Math.floor(Date.now() / 1000) },
    ],
  }
  const adminClaimsSql = sqlText(JSON.stringify(adminClaims))
  await service.sql(`
    begin;
    update app_private.environment_stage set stage='synthetic_alpha',
      capabilities=coalesce(capabilities,'{}'::jsonb)||jsonb_build_object(
        'private_auth',true,'shopper_private',true,'representative_portal',true,
        'administrator',true,'official_media_upload',true),version=version+1 where id=1;
    update app_private.audit_anchor_capability set deployment_environment='local',state='disabled' where id=1;
    update app_private.profiles set verified_email_snapshot=${sqlText(admin.email)} where user_id=${sqlText(admin.id)};
    update auth.users set email_confirmed_at=coalesce(email_confirmed_at,statement_timestamp()) where id in (${sqlText(owner.id)},${sqlText(admin.id)});
    insert into app_private.active_sessions(session_id,user_id,provider_created_at,session_epoch,last_authenticated_at,mfa_verified_at,access_token_expires_at)
      values
        (${sqlText(ownerSession)},${sqlText(owner.id)},statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes'),
        (${sqlText(adminSession)},${sqlText(admin.id)},statement_timestamp(),1,statement_timestamp(),statement_timestamp(),statement_timestamp()+interval '30 minutes')
      on conflict(session_id) do update set last_authenticated_at=excluded.last_authenticated_at,mfa_verified_at=excluded.mfa_verified_at,access_token_expires_at=excluded.access_token_expires_at;
    insert into app_private.role_grants(subject_user_id,role) values(${sqlText(admin.id)},'administrator');
    insert into app_public.catalog_areas(id,slug,label,state_code,sort_order)
      values(${sqlText(areaId)},'issue-580-test-area','Issue 580 Test Area','KS',0) on conflict(id) do nothing;
    insert into app_public.store_categories(id,slug,label,sort_order)
      values(${sqlText(categoryId)},${sqlText(`${slug}-antiques`)},${sqlText(`Issue 580 Antiques ${slug.slice(-6)}`)},0);
    insert into app_public.stores(id,slug,name,town,state_code,address,area_id,summary,description,synthetic,audience)
      values(${sqlText(storeId)},${sqlText(slug)},'Clockwork Cabinet','Topeka','KS','1 Synthetic Way',${sqlText(areaId)},'Synthetic media replacement fixture','No real store data.',true,'synthetic');
    insert into app_public.store_category_assignments(store_id,category_id) values(${sqlText(storeId)},${sqlText(categoryId)});
    insert into app_public.store_fact_verifications(store_id,verification_group,verified_at,provenance_label) values ${verifications};
    update app_public.stores set publication_state='active' where id=${sqlText(storeId)};
    insert into partner_private.store_photo_tier_state(store_id,tier,source) values(${sqlText(storeId)},'free','default');
    insert into partner_private.listing_claims(claim_id,claimant_id,store_id,relationship,authority_statement)
      values(${sqlText(claimId)},${sqlText(owner.id)},${sqlText(storeId)},'store owner','Synthetic authority documented by separate local signals.');
    insert into partner_private.claim_authority_signals(claim_id,channel_class,signal_type,status,verified_by,verified_at,evidence_ref_hmac,authority_object_hmac,verification_event_id) values ${signals};
    update partner_private.listing_claims set state='submitted',submitted_at=statement_timestamp() where claim_id=${sqlText(claimId)};
    update partner_private.listing_claims set state='verification_pending' where claim_id=${sqlText(claimId)};
    insert into partner_private.store_owner_intake_roots(applicant_id,active_kind,active_id) values(${sqlText(owner.id)},'claim',${sqlText(claimId)});
    create temporary table issue580_browser_claim(version bigint);
    grant select on issue580_browser_claim to authenticated;
    insert into issue580_browser_claim select version from partner_private.listing_claims where claim_id=${sqlText(claimId)};
    select set_config('request.jwt.claims',${adminClaimsSql},true);
    set local role authenticated;
    select app_public.owner_admin_approve_claim(${sqlText(claimId)},${sqlText(storeId)},(select version from issue580_browser_claim),'issue580-browser-owner-grant');
    reset role;
    update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;

    insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
      values(${sqlText(releaseId)},'topeka-ks','sha256:'||repeat('a',64),'sha256:'||repeat('b',64),'sha256:'||repeat('c',64),'active');
    insert into release_private.release_gate_receipts(gate_receipt_id,release_id,gate_kind,receipt_digest,artifact_digest,migration_set_digest,config_digest,frozen_store_set_digest,external_verified,accepted_at)
      values(${sqlText(gateId)},${sqlText(releaseId)},'provider_m',decode(repeat('d',64),'hex'),'sha256:'||repeat('e',64),'sha256:'||repeat('f',64),'sha256:'||repeat('a',64),decode(repeat('b',64),'hex'),true,statement_timestamp());
    insert into media_private.media_provider_config(id,state,gate_receipt_id,provider_key,contract_version,processing_region,provider_retention_days,hard_storage_bytes,provider_daily_operation_limit,provider_concurrent_limit,config_digest,accepted_at)
      values(1,'accepted',${sqlText(gateId)},'axiom','m01-v1','us-central1',30,10737418240,100000,100,decode(repeat('c',64),'hex'),statement_timestamp())
      on conflict(id) do update set state='accepted',gate_receipt_id=excluded.gate_receipt_id,provider_key=excluded.provider_key,contract_version=excluded.contract_version,processing_region=excluded.processing_region,provider_retention_days=excluded.provider_retention_days,hard_storage_bytes=excluded.hard_storage_bytes,provider_daily_operation_limit=excluded.provider_daily_operation_limit,provider_concurrent_limit=excluded.provider_concurrent_limit,config_digest=excluded.config_digest,accepted_at=excluded.accepted_at;
    insert into app_public.store_media(id,store_id,asset_path,kind,alt_text,display_order) values ${mediaRows};
    insert into media_private.media_uploads(upload_id,actor_user_id,store_id,kind,alt_text,rights_confirmed_at,idempotency_key,source_mime,source_bytes,source_width,source_height,original_object_key,private_derivative_object_key,public_derivative_object_key,derivative_digest,derivative_bytes,derivative_width,derivative_height,scan_state,metadata_stripped,reencoded,state,approved_by,approved_at,approval_reason,display_order,catalog_media_id,published_at)
      values ${uploadRows};
    commit;
  `)
  return {
    endpoint: local.endpoint,
    anonKey: local.anonKey,
    projectId: service.run.projectId,
    storeId,
    storeName: 'Clockwork Cabinet',
    storeSlug: slug,
    target: { mediaId: mediaIds.gallery[0], version: 1, altText: 'Approved gallery image one' },
    owner: { email: owner.email, password: owner.password, totpSecret: owner.totpSecret },
    admin: { email: admin.email, password: admin.password, totpSecret: admin.totpSecret },
  }
}

try {
  if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('External endpoint selection is forbidden')
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  report.temporaryProject = service.run.directory
  const local = await service.start()
  const endpoint = new URL(local.endpoint)
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1')
    throw new Error('Configured Owner media service did not bind to literal loopback')
  report.projectId = service.run.projectId
  report.database = { status: 'running' }
  await runDatabaseAcceptance()

  const fixture = await provisionBrowserFixtures(local)
  const runInput = {
    ...fixture,
    origin,
    output: output.directory,
  }
  inputFile = path.join(local.directory, 'issue-580-owner-media-input.json')
  fs.writeFileSync(inputFile, JSON.stringify(runInput), { mode: 0o600, flag: 'wx' })
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    VITE_STORE_OWNER_INTERNAL_ENABLED: 'true',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'true',
    GITHUB_PAGES: 'false',
    CONFIGURED_OWNER_MEDIA_INPUT: inputFile,
  }
  const build = path.join(local.directory, 'issue-580-dist')
  report.phase = 'building local configured app'
  await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], {
    env,
    signal: controller.signal,
  })
  const port = new URL(origin).port
  preview = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      build,
      '--host',
      '127.0.0.1',
      '--port',
      port,
      '--strictPort',
    ],
    { cwd: ROOT, env, stdio: 'ignore', windowsHide: true },
  )
  let ready = false
  let previewStartupError = 'no HTTP response before the deadline'
  for (let attempt = 0; attempt < 60; attempt++) {
    if (controller.signal.aborted) throw controller.signal.reason
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        ready = true
        break
      }
    } catch (error) {
      previewStartupError = error instanceof Error ? error.message : String(error)
    }
    await pause(500)
  }
  if (!ready)
    throw new Error('Configured Owner media preview did not start: ' + previewStartupError)
  report.phase = 'running exact-store Owner/Admin/public media browser flow'
  await command(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config',
      'e2e/issue-580-owner-media-replacement-playwright.config.ts',
    ],
    { env, timeout: 900_000, signal: controller.signal },
  )
  report.status = 'passed'
  report.browser = JSON.parse(
    fs.readFileSync(path.join(output.directory, 'playwright.json'), 'utf8'),
  ).stats
} catch (error) {
  report.status = interruptSignal ? 'interrupted' : 'failed'
  report.errors.push(redact(error instanceof Error ? error.message : String(error)))
} finally {
  report.cleanup = 'running'
  const cleanupErrors = []
  try {
    await stopChild(preview)
  } catch (error) {
    cleanupErrors.push(redact(error instanceof Error ? error.message : String(error)))
  }
  if (inputFile) {
    try {
      fs.rmSync(inputFile, { force: true })
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT')
        cleanupErrors.push(redact(error instanceof Error ? error.message : String(error)))
    }
  }
  try {
    await service?.cleanup()
  } catch (error) {
    cleanupErrors.push(redact(error instanceof Error ? error.message : String(error)))
  }
  report.cleanup = cleanupErrors.length ? 'failed' : 'completed'
  report.errors.push(...cleanupErrors)
  const reportPath = path.join(output.directory, 'issue-580-report.json')
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    `Issue #580 status: ${report.status}; cleanup: ${report.cleanup}; report: ${reportPath}`,
  )
}

if (report.status !== 'passed' || report.cleanup !== 'completed') process.exitCode = 1
