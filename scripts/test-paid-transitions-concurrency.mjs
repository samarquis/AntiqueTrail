import process from 'node:process'
import { setTimeout } from 'node:timers'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'

const container = process.env.BILLING_TEST_CONTAINER
if (!container || !/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) {
  throw new Error('Set BILLING_TEST_CONTAINER to the isolated local Supabase test container.')
}
const database = `issue179_concurrency_${process.pid}`
const args = (db, label = 'issue179_setup') => [
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
  const first = session(`begin; ${auth} ${request} select 'CLAIMED';\n`, 'issue179_first', true)
  await until(() => first.output().includes('CLAIMED'))
  const second = session(`${auth} ${request}\n`, 'issue179_second')
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name='issue179_second' and wait_event_type='Lock';",
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

  const helpers = readFileSync('supabase/tests/0088_issue_179_sales_transitions.sql', 'utf8')
    .split('create function pg_temp.authorize')[1]
    .split('create temp table ids')[0]
  sql(
    `create schema issue179_test; create function issue179_test.authorize${helpers.replaceAll('pg_temp.', 'issue179_test.')}`,
  )
  const stopReceipt = sql("select issue179_test.authorize('pause',1);")
  const changeId = sql('select change_id from partner_private.photo_tier_subscription_changes;')
  const pause = session(
    `begin; set role billing_transition_service; select app_public.pause_photo_tier_sales(${literal(stopReceipt)},1,'17900000-0000-4000-8000-000000000080'); select 'PAUSED';\n`,
    'issue179_pause',
    true,
  )
  await until(() => pause.output().includes('PAUSED'))
  const dispatch = session(
    `set role billing_mirror_service; select app_public.billing_prepare_subscription_change(${literal(changeId)})->>'state';\n`,
    'issue179_dispatch',
  )
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name='issue179_dispatch' and wait_event_type='Lock';",
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
  assert.equal(
    sql(
      "select jsonb_array_length(inventory->'pending_change_ids') from partner_private.photo_tier_sales_transition_receipts;",
    ),
    '1',
  )
  // Synthetic cancellation/finality: no live provider. The real competing
  // sessions prove capture waits for closure and cannot apply before reopen.
  sql("update partner_private.store_subscriptions set state='canceled';")
  const closeReceipt = sql("select issue179_test.authorize('close',2,issue179_test.finality(2));")
  const closing = session(
    `begin; set role billing_transition_service; select app_public.close_photo_tier_servicing(${literal(closeReceipt)},2,'17900000-0000-4000-8000-000000000081'); select 'CLOSED';\n`,
    'issue179_close',
    true,
  )
  await until(() => closing.output().includes('CLOSED'))
  const capture = session(
    "set role billing_mirror_service; select app_public.billing_capture_verified_event('evt_concurrent179','charge.dispute.created',repeat('8',64));\n",
    'issue179_capture',
  )
  await until(
    () =>
      sql(
        "select count(*) from pg_stat_activity where application_name='issue179_capture' and wait_event_type='Lock';",
      ) === '1',
  )
  closing.child.stdin.end('commit;\n')
  const [, captured] = await Promise.all([closing.done, capture.done])
  assert.equal(captured.trim(), 'quarantined')
  assert.equal(sql('select state from partner_private.photo_tier_sales_control;'), 'off_prelaunch')
  const reopenReceipt = sql(
    `select issue179_test.authorize('reopen_obligation',3,null,'evt_concurrent179',${literal(closeReceipt)});`,
  )
  const reopening = session(
    `begin; set role billing_transition_service; select app_public.reopen_photo_tier_servicing_for_obligation(${literal(reopenReceipt)},3,'17900000-0000-4000-8000-000000000082'); select 'REOPENED';\n`,
    'issue179_reopen',
    true,
  )
  await until(() => reopening.output().includes('REOPENED'))
  const resolve = session(
    "set role billing_mirror_service; select app_public.billing_resolve_verified_event('evt_concurrent179',repeat('8',64),repeat('9',64));\n",
    'issue179_resolve',
  )
  // A reader whose snapshot still sees off can deny immediately rather than
  // wait; either outcome must prevent any event effect before the commit.
  await assert.rejects(resolve.done, /billing_stage_disabled/)
  assert.equal(
    sql(
      'select count(*) from partner_private.photo_tier_webhook_journal where resolved_at is null;',
    ),
    '1',
  )
  reopening.child.stdin.end('commit;\n')
  await reopening.done
  assert.equal(
    sql(
      "set role billing_mirror_service; select app_public.billing_resolve_verified_event('evt_concurrent179',repeat('8',64),repeat('9',64));",
    ),
    'resolved',
  )
  process.stdout.write(
    'PASS: same-key allocation, signed pause versus dispatch, closure versus capture, and committed reopen versus event resolution.\n',
  )
} finally {
  for (const child of active) child.kill()
  sql(`drop database if exists "${database}" with (force);`, 'postgres')
}
