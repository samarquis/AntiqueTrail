/* global URL */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('configured stores seed five gallery photos each', async () => {
  const [seed, migration] = await Promise.all([
    readFile(new URL('supabase/seed.sql', root), 'utf8'),
    readFile(new URL('supabase/migrations/20260919000000_configured_store_gallery.sql', root), 'utf8'),
  ])

  assert.match(seed, /cross join generate_series\(1, 5\) as g\(photo\)/u)
  assert.match(migration, /cross join generate_series\(1, 5\) as g\(photo\)/u)
})
