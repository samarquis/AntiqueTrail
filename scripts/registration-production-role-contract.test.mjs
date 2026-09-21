import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const migrationsDirectory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort()
const callbackMigration = (
  await Promise.all(
    migrationFiles.map(async (file) => ({
      file,
      source: await readFile(join(migrationsDirectory, file), 'utf8'),
    })),
  )
)
  .filter(({ source }) => source.includes('complete_account_registration_callback'))
  .at(-1)
const oauthMigration = (
  await Promise.all(
    migrationFiles.map(async (file) => ({
      file,
      source: await readFile(join(migrationsDirectory, file), 'utf8'),
    })),
  )
)
  .filter(({ source }) => source.includes('oauth_admission_check'))
  .at(-1)

test('production registration callback grants only the ordinary Shopper role', () => {
  assert.ok(callbackMigration, 'a production callback migration must exist')
  assert.match(callbackMigration.source, /public_test_private\.complete_callback_base/u)
  assert.match(callbackMigration.source, /insert into app_private\.role_grants/iu)
  assert.match(
    callbackMigration.source,
    /values\s*\(p_provider_user_id\s*,\s*'shopper'\s*,\s*null\s*\)/iu,
  )
  assert.doesNotMatch(callbackMigration.source, /values\s*\([^)]*'administrator'/iu)
})

test('OAuth admission check qualifies its extracted admission id', () => {
  assert.ok(oauthMigration, 'an OAuth admission migration must exist')
  assert.match(oauthMigration.source, /admission_id_text\s+text/u)
  assert.match(oauthMigration.source, /r\.admission_id\s*=\s*admission_id_text::uuid/u)
  assert.doesNotMatch(oauthMigration.source, /r\.admission_id\s*=\s*admission_id::uuid/u)
})
