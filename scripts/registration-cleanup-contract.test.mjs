import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { URL } from 'node:url'

const [workflow, ci, worker, migration] = await Promise.all([
  readFile(new URL('../.github/workflows/registration-cleanup.yml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  readFile(
    new URL('../supabase/functions/account-registration-cleanup/index.ts', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL(
      '../supabase/migrations/20260806084500_authoritative_account_registration.sql',
      import.meta.url,
    ),
    'utf8',
  ),
])

test('database pipelines preserve reset and pgTAP failure status', () => {
  assert.equal((ci.match(/set -o pipefail/gu) ?? []).length, 2)
  assert.match(ci, /db reset --local 2>&1 \| tee/u)
  assert.match(ci, /docker exec -i -e PGPASSWORD=postgres supabase_db_antique-trail/u)
  assert.match(ci, /psql -U supabase_admin/u)
  assert.match(ci, /create role antique_trail_test_runner login superuser/u)
  assert.match(ci, /grant usage on schema extensions to public/u)
  assert.match(ci, /pg_dump -U supabase_admin -d postgres --schema-only --no-owner/u)
  assert.match(ci, /PGUSER=antique_trail_test_runner/u)
  assert.match(ci, /pg_prove --host 127\.0\.0\.1 --port 5432 --username antique_trail_test_runner/u)
  assert.match(ci, /--ext \.pg --ext \.sql --recurse \/tmp\/tests/u)
  assert.match(ci, /2>&1 \| tee artifacts\/supabase-pgtap\.log/u)
  assert.match(ci, /path: artifacts\//u)
})

test('scheduled cleanup requires both invocation and independent scheduler credentials', () => {
  assert.match(workflow, /schedule:/u)
  assert.match(workflow, /REGISTRATION_CLEANUP_INVOKE_JWT/u)
  assert.match(workflow, /REGISTRATION_CLEANUP_SCHEDULER_SECRET/u)
  assert.match(worker, /x-antique-trail-scheduler/u)
  assert.match(worker, /schedulerSecret\.length < 32/u)
  assert.match(worker, /state === 'escalated' \? 409 : 200/u)
  assert.doesNotMatch(worker, /p_provider_state|exactStatus/u)
})

test('cleanup queue is provider-ticket based and bounded', () => {
  assert.match(migration, /create table if not exists app_private\.registration_cleanup_tickets/u)
  assert.match(migration, /provider_user_id uuid not null unique/u)
  assert.match(migration, /attempt_count between 0 and 6/u)
  assert.match(migration, /state='escalated'/u)
  assert.match(migration, /resolve_registration_cleanup_operator_case/u)
  assert.doesNotMatch(migration, /operator_confirmed_absent|p_resolution='confirmed_absent'/u)
  assert.match(migration, /if p_resolution<>'retry'/u)
  assert.match(
    migration,
    /reconcile_account_registration_cleanup\(p_cleanup_ticket_id uuid,p_provider_user_id uuid\)/u,
  )
})
