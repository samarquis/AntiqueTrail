import process from 'node:process'
import { setTimeout } from 'node:timers'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'

const container = process.env.BILLING_TEST_CONTAINER
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) {
  throw new Error('Set BILLING_TEST_CONTAINER to the isolated local Supabase test container.')
}
const database = `issue178_concurrency_${process.pid}`
const args = (db, label = 'issue178_setup') => [
  'exec',
  '-i',
  '-e',
  'PGPASSWORD=postgres',
  '-e',
  `PGAPPNAME=${label}`,
  '-e',
  'PGOPTIONS=-c search_path=public,extensions',
  container,
  'psql',
  '-U',
  'supabase_admin',
  '-d',
  db,
  '-v',
  'ON_ERROR_STOP=1',
  '-Atq',
]
const sql = (statement, db = database) =>
  execFileSync('docker', args(db), {
    input: statement,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 64 * 1024 * 1024,
  }).trim()
const literal = (value) => `'${value.replaceAll("'", "''")}'`
const active = new Set()
function session(statement, label, keepOpen = false) {
  const child = spawn('docker', args(database, label), { stdio: ['pipe', 'pipe', 'pipe'] })
  active.add(child)
  let output = ''
  let errors = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    errors += chunk
  })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      active.delete(child)
      if (code) reject(new Error(errors || `psql exited ${code}`))
      else resolve(output)
    })
  })
  // A peer can fail while the parent is observing a lock; keep the rejection
  // handled until the parent awaits it, so finally always removes this clone.
  void done.catch(() => {})
  child.stdin.write(statement)
  if (!keepOpen) child.stdin.end()
  return { child, done, output: () => output }
}
async function until(predicate) {
  const deadline = Date.now() + 10000
  while (!(await predicate())) {
    if (Date.now() > deadline)
      throw new Error('Concurrent transaction did not reach its expected lock boundary')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

try {
  // The clone is disposable; the selected local database is never reset or mutated.
  sql(`create database "${database}";`, 'postgres')
  let snapshot = execFileSync(
    'docker',
    [
      'exec',
      '-e',
      'PGPASSWORD=postgres',
      container,
      'pg_dump',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '--clean',
      '--if-exists',
    ],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 },
  )
  // Supabase bootstraps this extension-member wrapper outside pg_dump's CREATE
  // statements. Restore its actual source before the dump restores its ACL.
  const graphqlWrapper = sql(
    "select pg_get_functiondef('graphql_public.graphql(text,text,jsonb,jsonb)'::regprocedure);",
    'postgres',
  )
  snapshot = snapshot.replace(
    'GRANT ALL ON FUNCTION graphql_public.graphql(',
    `${graphqlWrapper};\nGRANT ALL ON FUNCTION graphql_public.graphql(`,
  )
  sql(snapshot)
  const fixture = readFileSync('supabase/tests/fixtures/paid_servicing.inc', 'utf8').replace(
    /^grant billing_automation,commercial_research_signature_service to postgres;\s*/,
    '',
  )
  const setup = sql(`begin;\n${fixture}\n
    insert into partner_private.store_photo_tier_state(store_id,tier,source) values('17800000-0000-4000-8000-000000000001','gallery','subscription');
    insert into partner_private.store_subscriptions(store_id,stripe_customer_id,stripe_subscription_id,state,current_period_end)
      values('17800000-0000-4000-8000-000000000001','cus_concurrency178','sub_concurrency178','active',now()+interval '20 days');
    commit;
    select current_setting('request.jwt.claims');`)
  const claims = setup.split('\n').at(-1)
  assert(claims && JSON.parse(claims).sub)
  const auth = `select set_config('request.jwt.claims',${literal(claims)},false); set role authenticated;`
  const receipt = JSON.parse(
    sql(`${auth}
    select app_public.billing_record_paid_change_consent('17800000-0000-4000-8000-000000000001',1,1,178,repeat('11',32),'17800000-0000-4000-8000-000000000081');`)
      .split('\n')
      .at(-1),
  )
  const request = `select app_public.billing_request_subscription_change('17800000-0000-4000-8000-000000000001','full_gallery',${literal(receipt.consentId)},1,'17800000-0000-4000-8000-000000000082');`
  const first = session(`begin; ${auth} ${request} select 'CLAIMED';\n`, 'issue178_first', true)
  await until(() => first.output().includes('CLAIMED'))
  const second = session(`${auth} ${request}\n`, 'issue178_second')
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name='issue178_second' and wait_event_type='Lock';",
      ) === '1',
  )
  first.child.stdin.end('commit;\n')
  await Promise.all([first.done, second.done])
  assert.equal(sql('select count(*) from partner_private.photo_tier_subscription_changes;'), '1')
  assert.equal(
    sql(
      "select tier from partner_private.store_photo_tier_state where store_id='17800000-0000-4000-8000-000000000001';",
    ),
    'gallery',
  )

  const changeId = sql('select change_id from partner_private.photo_tier_subscription_changes;')
  const pause = session(
    "begin; set role billing_automation; update partner_private.photo_tier_sales_control set state='servicing_only',sales_generation=sales_generation+1; select 'PAUSED';\n",
    'issue178_pause',
    true,
  )
  await until(() => pause.output().includes('PAUSED'))
  const dispatch = session(
    `set role billing_mirror_service; select app_public.billing_prepare_subscription_change(${literal(changeId)})->>'state';\n`,
    'issue178_dispatch',
  )
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name='issue178_dispatch' and wait_event_type='Lock';",
      ) === '1',
  )
  pause.child.stdin.end('commit;\n')
  const [, outcome] = await Promise.all([pause.done, dispatch.done])
  assert.equal(outcome.trim(), 'superseded')
  assert.equal(
    sql(
      "select state from partner_private.store_subscriptions where store_id='17800000-0000-4000-8000-000000000001';",
    ),
    'active',
  )
  process.stdout.write(
    'PASS: concurrent same-key requests allocate once; pause commits before blocked dispatch and preserves the existing subscription.\n',
  )
} finally {
  for (const child of active) child.kill()
  sql(`drop database if exists "${database}" with (force);`, 'postgres')
}
