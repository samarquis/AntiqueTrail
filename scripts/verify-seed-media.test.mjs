import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { seededMediaPaths, verifySeedMedia } from './verify-seed-media.mjs'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-media-'))
  const built = path.join(root, 'dist')
  const assetPath = '/images/synthetic-stores/1280w/fixture.webp'
  fs.mkdirSync(path.join(root, 'supabase'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs/evidence/free-private-assets'), { recursive: true })
  fs.mkdirSync(path.dirname(path.join(built, assetPath.slice(1))), { recursive: true })
  fs.writeFileSync(path.join(root, 'supabase/seed.sql'), `values ('fixture','${assetPath}')`)
  fs.writeFileSync(
    path.join(root, 'docs/evidence/free-private-assets/provenance.json'),
    JSON.stringify({
      assets: [
        {
          path: `public${assetPath}`,
          rightsStatus: 'declared_internal_synthetic',
          syntheticRestriction: 'Internal Alpha synthetic fixture only',
        },
      ],
    }),
  )
  fs.writeFileSync(path.join(built, assetPath.slice(1)), 'fixture')
  return { root, built, assetPath }
}

test('finds maintained seed media paths', () => {
  assert.deepEqual(seededMediaPaths("'/images/synthetic-stores/1280w/fixture.webp'"), [
    '/images/synthetic-stores/1280w/fixture.webp',
  ])
})

test('accepts a seeded, built, provenance-tracked synthetic asset', () => {
  const { root, built, assetPath } = fixture()
  assert.deepEqual(verifySeedMedia(root, built), { paths: [assetPath], errors: [] })
})

test('rejects a deleted or misspelled built seed media asset', () => {
  const { root, built, assetPath } = fixture()
  fs.rmSync(path.join(built, assetPath.slice(1)))
  assert.equal(
    verifySeedMedia(root, built).errors.includes(
      `seed media missing from built static inventory: ${assetPath}`,
    ),
    true,
  )
})
