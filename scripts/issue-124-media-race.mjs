// Run only against a disposable local database containing the migrated schema.
// This commits synthetic fixtures; never point it at a shared application DB.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const database = process.argv[2]
assert.match(database ?? '', /^issue124_[a-z_]+$/, 'Use an isolated issue124_* database')
const container = 'supabase_db_antique-trail'
const args = [
  'exec',
  '-i',
  '-e',
  'PGPASSWORD=postgres',
  '-e',
  'PGOPTIONS=-c search_path=public,extensions',
  container,
  'psql',
  '-X',
  '-w',
  '-U',
  'supabase_admin',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
  '-At',
]
function sql(input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
function concurrentSql(input) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args)
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(input)
  })
}
assert.equal(
  sql("select count(*) from auth.users where id='76000000-0000-4000-8000-000000000001'"),
  '0',
  'Fixture already present; use a fresh disposable DB',
)
const copy = spawnSync(
  'docker',
  ['cp', 'supabase/tests', `${container}:/tmp/issue124-race-tests`],
  { encoding: 'utf8' },
)
assert.equal(copy.status, 0, copy.stderr)
sql(`begin;
select no_plan();
\\ir /tmp/issue124-race-tests/fixtures/media_resubmission.inc
\\ir /tmp/issue124-race-tests/fixtures/media_current_tier.inc
update media_private.media_uploads set state='rejected' where upload_id in(select id from approved_fixture where n=5);
update media_private.media_uploads set state='awaiting_review' where upload_id='80000000-0000-4000-8000-000000000001';
update app_private.environment_stage set stage='synthetic_alpha',version=version+1 where id=1;
create function media_private.issue124_pause_approval() returns trigger language plpgsql as $$
begin
  if current_setting('application_name')='issue124-race-a' and new.state in('approved_pending_publish','reserved') then
    perform pg_sleep(3);
  end if;
  return new;
end $$;
create trigger issue124_pause before insert or update on media_private.media_uploads
for each row execute function media_private.issue124_pause_approval();
commit;`)
const claims = `select set_config('request.jwt.claims',jsonb_build_object(
  'sub','76000000-0000-4000-8000-000000000001','session_id','76000000-0000-4000-8000-000000000008',
  'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from statement_timestamp())::bigint),
  jsonb_build_object('method','totp','timestamp',extract(epoch from statement_timestamp())::bigint)))::text,true);`
const approve = (overload, id) =>
  overload === 2
    ? `select app_public.media_approve_upload('${id}','quality_ok');`
    : `set local role authenticated; select app_public.media_approve_upload('${id}',0,1,'quality_ok');`
for (const [first, second] of [
  [2, 4],
  [4, 2],
  [2, 2],
  [4, 4],
]) {
  sql(`update media_private.media_uploads set state='awaiting_review',version=1
    where upload_id in('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002');`)
  const a = concurrentSql(`begin; set local application_name='issue124-race-a'; ${claims}
    ${approve(first, '80000000-0000-4000-8000-000000000001')} commit;`)
  let paused = false
  for (let attempt = 0; attempt < 30; attempt++) {
    paused =
      sql(
        "select exists(select 1 from pg_stat_activity where datname=current_database() and application_name='issue124-race-a' and wait_event='PgSleep')",
      ) === 't'
    if (paused) break
    await delay(50)
  }
  assert.ok(paused, 'First approval must reach the post-cap/pre-write pause')
  const b = concurrentSql(`\\set VERBOSITY verbose
    begin; ${claims} ${approve(second, '80000000-0000-4000-8000-000000000002')} commit;`)
  const [winner, loser] = await Promise.all([a, b])
  assert.equal(winner.status, 0, winner.stderr)
  assert.notEqual(loser.status, 0, 'Second approval must lose the final Free slot')
  assert.match(loser.stderr, /23505.*media_unavailable/)
  assert.equal(
    sql(
      "select count(*) from media_private.media_uploads where store_id='00000000-0000-4000-8000-000000000001' and kind='gallery' and state in('published','approved_pending_publish')",
    ),
    '5',
  )
  console.log(
    `PASS: ${first}-argument vs ${second}-argument approval; one winner, one cap denial, five approved`,
  )
}
sql(`update media_private.media_uploads set state='rejected' where upload_id='80000000-0000-4000-8000-000000000001';
  update app_private.environment_stage set stage='private_beta',version=version+1 where id=1;`)
const reserve = `set local role authenticated;
  select app_public.media_reserve_resubmission('80000000-0000-4000-8000-000000000001','Concurrent resubmission',
  '12400000-0000-4000-8000-000000000099',true,'image/png',1000,640,480,repeat('a',64));`
const retries = await Promise.all([
  concurrentSql(
    `begin; set local application_name='issue124-race-a'; ${claims} ${reserve} commit;`,
  ),
  concurrentSql(`begin; ${claims} ${reserve} commit;`),
])
const receipts = retries.map((result) => {
  assert.equal(result.status, 0, result.stderr)
  const receipt = result.stdout.split('\n').find((line) => line.includes('"uploadId"'))
  assert.ok(receipt, result.stdout)
  return JSON.parse(receipt)
})
assert.equal(receipts[0].uploadId, receipts[1].uploadId)
assert.deepEqual(receipts.map((receipt) => receipt.replayed).sort(), [false, true])
assert.equal(
  sql(
    "select count(*) from media_private.media_uploads where idempotency_key='12400000-0000-4000-8000-000000000099'",
  ),
  '1',
)
console.log('PASS: concurrent same-key resubmission returns one reservation and one replay')
sql(
  'drop trigger issue124_pause on media_private.media_uploads; drop function media_private.issue124_pause_approval();',
)
console.log('PASS: real concurrent approval matrix; synthetic fixtures remain in disposable DB')
