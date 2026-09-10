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

const output = createRunDirectory(path.join(ROOT, 'artifacts'))
const controller = new AbortController()
const report = {
  scope: 'representative-hours-publication-and-revocation',
  status: 'unavailable',
  cleanup: 'not-started',
  errors: [],
  evidenceClass: 'real-local-browser',
}
let service, server
const uuid = () => crypto.randomUUID()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
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
  if (!response.ok) throw new Error(`Local Auth ${route} failed with ${response.status}`)
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
    insert into partner_private.partner_invitations(invitation_id,token_hash,recipient_email_hmac,created_by,state,consumed_at)
      values('${invitation}',decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'${representative.id}','consumed',statement_timestamp());
    insert into partner_private.pending_partner_identities(pending_identity_id,invitation_id,email_hmac,auth_user_id,state,verified_email_at,mfa_verified_at,bound_at)
      values('${pending}','${invitation}',decode(repeat('02',32),'hex'),'${representative.id}','bound',statement_timestamp(),statement_timestamp(),statement_timestamp());
    insert into partner_private.provisional_partner_consents(provisional_consent_id,pending_identity_id,policy_version,typed_name,business_title,store_name,owner_email_hmac,authority_ack,voluntary_ack,permitted_data_ack,no_payment_endorsement_ack,withdrawal_ack,idempotency_key)
      values('${provisional}','${pending}','synthetic-v3','Representative','Owner','Clockwork Cabinet',decode(repeat('03',32),'hex'),true,true,true,true,true,'issue322-${representative.id}');
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
try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('External endpoint selection is forbidden')
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  report.temporaryProject = service.run.directory
  const local = await service.start()
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
    const results = representativeHoursReport(fs.readFileSync(resultPath, 'utf8'))
    report.stats = results.stats
    report.checks = results.checks
    if (results.status !== 'passed') report.status = 'failed'
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
    } catch (error) {
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
    try {
      report.cleanup = await service.cleanup()
    } catch (error) {
      report.cleanup = 'failed'
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
  }
  fs.writeFileSync(
    path.join(output.directory, 'report.json'),
    JSON.stringify(redact(report), null, 2),
  )
}
console.log(`${report.status}: ${output.directory}`)
process.exitCode = report.status === 'passed' ? 0 : 1
