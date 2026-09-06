import process from 'node:process'
import console from 'node:console'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
const exec = promisify(execFile)
const container = process.argv[2]
if (!container || !/^supabase_db_(issue180-activation|antique-trail)$/.test(container))
  throw new Error('Requires a disposable local Supabase test container')
// Explicit CI-only role/password; this runner cannot target a hosted provider.
const args = [
  'exec',
  '-e',
  'PGPASSWORD=local-pgtap-only',
  container,
  'psql',
  '-h',
  '127.0.0.1',
  '-U',
  'antique_trail_test_runner',
  '-d',
  'postgres',
  '-At',
  '-v',
  'ON_ERROR_STOP=1',
]
const sql = async (query) =>
  (await exec('docker', [...args, '-c', query], { maxBuffer: 4_000_000 })).stdout.trim()
await exec('docker', ['cp', 'supabase/tests/.', `${container}:/tmp/paid-activation-concurrency`])
await exec('docker', [
  ...args,
  '-f',
  '/tmp/paid-activation-concurrency/fixtures/paid_activation_concurrency.inc',
])
const activation = await sql(
  'select receipt_id from partner_private.photo_tier_activation_receipts',
)
async function authorize(action, version, finality = null) {
  return sql(
    `select issue180_concurrency.authorize('${action}',${version},'${activation}',${finality ? `'${finality}'` : 'null'})`,
  )
}
const resume = (id, version = 2) =>
  `select app_public.resume_photo_tier_sales('${id}','${activation}',${version},'${id}')`
const close = (id, version = 2) =>
  `select app_public.close_photo_tier_servicing('${id}',${version},'${id}')`
async function until(query) {
  for (let n = 0; n < 70; n++) {
    if ((await sql(query)) === 't') return
    await delay(50)
  }
  throw new Error('Expected database lock state did not appear')
}
async function compete(first, second, rollback = false) {
  const a = sql(
    `begin; set application_name='issue180_race_a'; ${first}; select pg_sleep(5); ${rollback ? 'rollback' : 'commit'};`,
  )
  await until(
    "select exists(select 1 from pg_stat_activity where application_name='issue180_race_a' and wait_event='PgSleep')",
  )
  const b = sql(`set application_name='issue180_race_b'; ${second}`).then(
    (value) => ({ value }),
    (error) => ({ error }),
  )
  await until(
    "select exists(select 1 from pg_stat_activity where application_name='issue180_race_b' and cardinality(pg_blocking_pids(pid))>0)",
  )
  await a
  return b
}
async function servicing() {
  await sql(
    "update partner_private.photo_tier_sales_control set state='servicing_only',commercial_config_version=178,version=2,sales_generation=2",
  )
}
await servicing()
let r = await authorize('resume', 2)
let f = await sql('select issue180_concurrency.finality(2)')
let c = await authorize('close', 2, f)
let result = await compete(resume(r), close(c))
assert.match(result.error?.stderr ?? '', /billing_sales_version_stale/)
assert.equal(await sql('select state from partner_private.photo_tier_sales_control'), 'sales_open')
console.log('PASS resume wins; concurrent close waits then fails CAS')
await servicing()
r = await authorize('resume', 2)
f = await sql('select issue180_concurrency.finality(2)')
c = await authorize('close', 2, f)
result = await compete(close(c), resume(r))
assert.match(result.error?.stderr ?? '', /billing_sales_version_stale/)
assert.equal(
  await sql('select state from partner_private.photo_tier_sales_control'),
  'off_prelaunch',
)
console.log('PASS close wins; concurrent resume cannot reopen sales')
await servicing()
r = await authorize('resume', 2)
f = await sql('select issue180_concurrency.finality(2)')
c = await authorize('close', 2, f)
result = await compete(resume(r), close(c), true)
assert.equal(result.error, undefined)
assert.equal(
  await sql('select state from partner_private.photo_tier_sales_control'),
  'off_prelaunch',
)
assert.equal(
  await sql(
    `select count(*) from partner_private.photo_tier_sales_transition_receipts where receipt_id='${r}'`,
  ),
  '0',
)
console.log('PASS aborted resume leaves no partial receipt and permits waiting close')
await servicing()
r = await authorize('resume', 2)
result = await compete(
  `insert into partner_private.photo_tier_activation_evidence select gen_random_uuid(),kind,revision+1,'revoked',source_id,config_version,commercial_digest,artifact_digest,schema_digest,deployment_config_digest,payload_digest,signed_by_roles,gen_random_uuid()::text,signed_at,verified_at,expires_at from partner_private.photo_tier_activation_evidence where kind='provider'`,
  resume(r),
)
assert.match(result.error?.stderr ?? '', /billing_composite_evidence_invalid/)
assert.equal(
  await sql('select state from partner_private.photo_tier_sales_control'),
  'servicing_only',
)
console.log('PASS concurrent prerequisite revocation serializes before resume and denies it')
console.log(
  'All four activation concurrency scenarios passed; discard/reset this disposable database before reuse.',
)
