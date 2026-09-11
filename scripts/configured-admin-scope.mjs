#!/usr/bin/env node
/* global process, console, AbortController, Buffer, URL, fetch, setTimeout */
/* #323 local-only, redacted Administrator scope diagnostic. */
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
const report = {
  scope: 'administrator-exact-scope',
  status: 'unavailable',
  cleanup: 'not-started',
  errors: [],
  evidenceClass: 'real-local-browser',
}
const controller = new AbortController()
let service, server
const uuid = () => crypto.randomUUID()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0,
    count = 0
  const bytes = []
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index < 0) throw new Error('Malformed local TOTP secret')
    bits = (bits << 5) | index
    count += 5
    if (count >= 8) {
      bytes.push((bits >>> (count - 8)) & 255)
      count -= 8
    }
  }
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String(
    (((digest[offset] & 127) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) %
      1_000_000,
  ).padStart(6, '0')
}
async function authRequest(endpoint, route, key, token, body) {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Only loopback Auth is allowed')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${url.origin}${route}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(`Local Auth ${response.status}`)
      return data
    } catch (error) {
      if (attempt === 2 || !(error instanceof TypeError)) throw error
      await wait(500)
    }
  }
  throw new Error('Local Auth request retry exhausted')
}
function replaceFixture(sql, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`__${key}__`, value),
    sql,
  )
}
try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('External endpoint selection is forbidden')
  const origin = `http://127.0.0.1:${await freePort()}`
  report.phase = 'starting local service'
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  report.temporaryProject = service.run.directory
  const local = await service.start()
  const password = crypto.randomBytes(24).toString('base64url')
  const actors = {
    desktopAdmin: local.users[0],
    subject: local.users[1],
  }
  report.phase = 'creating local Auth fixture identities'
  for (const alias of ['phoneAdmin', 'sibling', 'shopper']) {
    const created = await authRequest(
      local.endpoint,
      '/auth/v1/signup',
      local.anonKey,
      local.anonKey,
      { email: `${alias}-${service.run.id}@probe.invalid`, password },
    )
    const userId = created?.user?.id ?? created?.id
    if (!/^[a-f0-9-]{36}$/.test(userId ?? ''))
      throw new Error('Local Auth fixture identity creation failed')
    actors[alias] = {
      id: userId,
      email: `${alias}-${service.run.id}@probe.invalid`,
      password,
    }
  }
  await service.sql(
    `update auth.users set email_confirmed_at=coalesce(email_confirmed_at,statement_timestamp()), raw_app_meta_data=jsonb_build_object('role','Administrator') where id in ('${actors.desktopAdmin.id}','${actors.phoneAdmin.id}'); update auth.users set email_confirmed_at=coalesce(email_confirmed_at,statement_timestamp()), raw_app_meta_data=jsonb_build_object('role','Representative') where id in ('${actors.subject.id}','${actors.sibling.id}'); update auth.users set email_confirmed_at=coalesce(email_confirmed_at,statement_timestamp()), raw_app_meta_data=jsonb_build_object('role','Shopper') where id='${actors.shopper.id}';`,
  )
  report.phase = 'establishing Administrator MFA assurance'
  const enrollAdminMfa = async (actor, variant) => {
    const passwordSession = await service.request('/auth/v1/token?grant_type=password', {
      key: local.anonKey,
      body: { email: actor.email, password: actor.password },
    })
    const enrolled = await authRequest(
      local.endpoint,
      '/auth/v1/factors',
      local.anonKey,
      passwordSession.access_token,
      { factor_type: 'totp', friendly_name: `local-admin-scope-${variant}` },
    )
    const secret = enrolled?.totp?.secret
    if (typeof secret !== 'string' || !secret)
      throw new Error('Local Auth MFA enrollment did not return a TOTP secret')
    const challenge = await authRequest(
      local.endpoint,
      `/auth/v1/factors/${enrolled.id}/challenge`,
      local.anonKey,
      passwordSession.access_token,
      {},
    )
    await authRequest(
      local.endpoint,
      `/auth/v1/factors/${enrolled.id}/verify`,
      local.anonKey,
      passwordSession.access_token,
      { challenge_id: challenge.id, code: totp(secret) },
    )
    return { ...actor, secret }
  }
  const admin = {
    desktop: await enrollAdminMfa(actors.desktopAdmin, 'desktop'),
    phone: await enrollAdminMfa(actors.phoneAdmin, 'phone'),
  }
  const subjectPasswordSession = await service.request('/auth/v1/token?grant_type=password', {
    key: local.anonKey,
    body: { email: actors.subject.email, password: actors.subject.password },
  })
  const subjectFactor = await authRequest(
    local.endpoint,
    '/auth/v1/factors',
    local.anonKey,
    subjectPasswordSession.access_token,
    { factor_type: 'totp', friendly_name: 'local-scope-subject' },
  )
  const subjectSecret = subjectFactor?.totp?.secret
  if (typeof subjectSecret !== 'string' || !subjectSecret)
    throw new Error('Local Auth subject MFA enrollment did not return a TOTP secret')
  const subjectChallenge = await authRequest(
    local.endpoint,
    `/auth/v1/factors/${subjectFactor.id}/challenge`,
    local.anonKey,
    subjectPasswordSession.access_token,
    {},
  )
  await authRequest(
    local.endpoint,
    `/auth/v1/factors/${subjectFactor.id}/verify`,
    local.anonKey,
    subjectPasswordSession.access_token,
    { challenge_id: subjectChallenge.id, code: totp(subjectSecret) },
  )
  report.phase = 'installing distinct-store fixture authority'
  const ids = Object.fromEntries(
    [
      'INVITE_A',
      'INVITE_B',
      'PENDING_A',
      'PENDING_B',
      'CONSENT_A',
      'CONSENT_B',
      'RECEIPT_A',
      'RECEIPT_B',
      'PARTNERSHIP_A',
      'PARTNERSHIP_B',
      'GRANT_A',
      'GRANT_B',
      'CLAIM_A',
      'CLAIM_B',
    ].map((name) => [name, uuid()]),
  )
  const fixture = fs.readFileSync(
    path.join(ROOT, 'scripts/configured-admin-scope-fixtures.sql'),
    'utf8',
  )
  await service.sql(
    replaceFixture(fixture, {
      ADMIN: actors.desktopAdmin.id,
      SUBJECT: actors.subject.id,
      SIBLING: actors.sibling.id,
      SHOPPER: actors.shopper.id,
      ...ids,
    }),
  )
  const fixtureAuthority = await service.sql(
    `select (select count(*) from partner_private.store_partner_grants where auth_user_id='${actors.subject.id}' and store_id='00000000-0000-4000-8000-000000001001' and state='active'),(select count(*) from app_private.role_grants where subject_user_id='${actors.subject.id}' and store_id='00000000-0000-4000-8000-000000001001' and role='representative' and state='active'),(select count(*) from partner_private.store_partner_grants where auth_user_id='${actors.sibling.id}' and store_id='00000000-0000-4000-8000-000000001002' and state='active'),(select count(*) from app_private.role_grants where subject_user_id='${actors.sibling.id}' and store_id='00000000-0000-4000-8000-000000001002' and role='representative' and state='active');`,
  )
  if (fixtureAuthority.trim() !== '1|1|1|1')
    throw new Error(`Configured scope fixture authority is incomplete: ${fixtureAuthority.trim()}`)
  const fixtureIdentity = crypto
    .createHash('sha256')
    .update(local.fixtureIdentity)
    .update(fixture)
    .digest('hex')
  Object.assign(report, local, { fixtureIdentity, browserOrigin: origin, endpoint: local.endpoint })
  report.phase = 'building configured browser application'
  const secretFile = path.join(local.directory, 'admin-scope-input.json')
  fs.writeFileSync(
    secretFile,
    JSON.stringify({
      ...local,
      output: output.directory,
      origin,
      wrongReadback: process.env.CONFIGURED_ADMIN_SCOPE_WRONG_READBACK === '1',
      actors: { ...actors, admin },
      stores: {
        target: '00000000-0000-4000-8000-000000001001',
        sibling: '00000000-0000-4000-8000-000000001002',
      },
    }),
    { mode: 0o600, flag: 'wx' },
  )
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    GITHUB_PAGES: 'false',
    VITE_COMMERCIAL_RESEARCH_REVIEW: 'false',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
    VITE_BROWSE_MAP_ENABLED: 'false',
    CONFIGURED_ADMIN_SCOPE_INPUT: secretFile,
    CONFIGURED_ADMIN_SCOPE_OUTPUT: output.directory,
  }
  const build = path.join(local.directory, 'browser-dist')
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
      // Readiness only; the eventual timeout makes the unavailable state explicit.
    }
    await wait(500)
  }
  if (!ready) throw new Error('Configured Administrator preview unavailable')
  report.phase = 'running configured browser checks'
  try {
    await command(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'e2e/configured-admin-scope-playwright.config.ts',
      ],
      { env, timeout: 900_000, signal: controller.signal },
    )
    report.status = 'passed'
    report.phase = 'validating configured browser report'
  } catch (error) {
    report.status = 'failed'
    report.errors.push(redact(error.message))
  }
  const resultPath = path.join(output.directory, 'playwright.json')
  if (!fs.existsSync(resultPath)) {
    report.status = 'unavailable'
    report.errors.push('Missing Playwright report')
  } else {
    const parsed = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
    const specs = parsed.suites.flatMap((suite) => suite.specs ?? [])
    report.stats = parsed.stats
    report.checks = specs.flatMap((spec) =>
      spec.tests.map((test) => ({
        title: `${test.projectName ?? 'unknown'}: ${spec.title}`,
        status: test.results.at(-1)?.status === 'passed' ? 'passed' : 'failed',
      })),
    )
    if (report.checks.length !== 6 || report.checks.some((check) => check.status !== 'passed'))
      report.status = 'failed'
  }
} catch (error) {
  report.status = 'failed'
  report.errors.push(redact(error.message))
} finally {
  await stopChild(server)
  if (service) {
    try {
      fs.rmSync(path.join(service.run.directory, 'admin-scope-input.json'), { force: true })
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
