import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const edge = await readFile('supabase/functions/public-catalog/index.ts', 'utf8')
const migration = await readFile(
  'supabase/migrations/20260823110000_shared_alpha_catalog_gateway.sql',
  'utf8',
)

test('shared alpha uses a provider-verified user and exact session binding', () => {
  assert.match(edge, /auth\.getUser\(bearer\)/)
  assert.match(edge, /sessionIdFromVerifiedJwt\(bearer\)/)
  assert.match(edge, /p_user_id: actor \?\? null/)
  assert.match(edge, /p_session_id: sessionId/)
  assert.match(migration, /'session_id',p_session_id/)
  assert.match(migration, /return app_private\.current_session_is_active\(\)/)
  assert.match(migration, /gateway_session_is_active\(p_user_id,p_session_id\)/)
})

test('shared alpha requires signed stage, registration, quarantine, and shopper gates', () => {
  assert.match(migration, /e\.stage='synthetic_alpha'/)
  assert.match(migration, /e\.receipt_id is not null/)
  assert.match(migration, /e\.capabilities @> '\{"private_auth":true\}'::jsonb/)
  assert.match(migration, /c\.mode='receipt_only'/)
  assert.match(migration, /c\.stage_receipt_id=e\.receipt_id/)
  assert.match(migration, /q\.state='open'/)
  assert.match(migration, /g\.role='shopper' and g\.state='active'/)
})

test('public behavior remains the only fallback outside synthetic alpha', () => {
  assert.match(edge, /synthetic_catalog_outside_stage/)
  assert.match(edge, /public_catalog_gateway_request/)
  assert.match(edge, /ALPHA_AUTH_REQUIRED/)
  assert.match(edge, /body\.operation !== 'map'/)
  assert.match(edge, /synthetic_catalog_map_disabled/)
  assert.match(
    migration,
    /if p_operation='map' then\s+raise exception 'synthetic_catalog_map_disabled'/,
  )
  assert.match(migration, /synthetic_catalog_evidence_invalid/)
  assert.doesNotMatch(migration, /grant execute[^;]+to (?:anon|authenticated)/is)
})
