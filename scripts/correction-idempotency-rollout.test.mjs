import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const edge = await readFile('supabase/functions/_shared/correction-submit.ts', 'utf8')
const migration = await readFile(
  'supabase/migrations/20260929230000_correction_gateway_idempotency.sql',
  'utf8',
)

test('retry-safe correction gateway lands before legacy Edge retirement', () => {
  assert.match(migration, /p_idempotency_key uuid/)
  assert.match(migration, /gateway_idempotency_digest=idempotency_digest/)
  assert.doesNotMatch(
    migration,
    /(?:drop function|revoke all on function) app_public\.correction_gateway_submit\(uuid,uuid,uuid,text,text,bytea,text\)/i,
  )
  assert.match(edge, /args\.p_idempotency_key = body\.idempotencyKey/)
})
