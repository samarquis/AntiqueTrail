import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
/* global Buffer */
import { verifyManifest } from './verify-free-private-assets.mjs'

function fixtureManifest(root, overrides = {}) {
  const asset = {
    path: 'public/fixture.bin',
    sha256: crypto.createHash('sha256').update(Buffer.from('fixture')).digest('hex'),
    source: 'docs/evidence/source.md',
    use: 'private evaluation fixture',
    rightsStatus: 'unknown',
    ...overrides,
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true })
  fs.mkdirSync(path.dirname(path.join(root, asset.path)), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs/evidence'), { recursive: true })
  fs.writeFileSync(path.join(root, asset.path), Buffer.from('fixture'))
  fs.writeFileSync(path.join(root, asset.source), 'source')
  const manifestPath = path.join(root, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify({ assets: [asset] }))
  return { manifestPath, asset }
}

test('passes a complete asset and reports unknown rights separately', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-assets-'))
  const { manifestPath } = fixtureManifest(root)
  const result = verifyManifest(root, manifestPath)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.unknownRights, ['public/fixture.bin'])
})

test('reports deleted references', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-assets-'))
  const { manifestPath, asset } = fixtureManifest(root)
  fs.rmSync(path.join(root, asset.path))
  const result = verifyManifest(root, manifestPath)
  assert.equal(
    result.errors.some((error) => error.includes('missing asset')),
    true,
  )
})

test('reports modified bytes and missing provenance evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-assets-'))
  const { manifestPath, asset } = fixtureManifest(root)
  fs.writeFileSync(path.join(root, asset.path), 'changed')
  fs.rmSync(path.join(root, asset.source))
  const result = verifyManifest(root, manifestPath)
  assert.equal(
    result.errors.some((error) => error.includes('hash mismatch')),
    true,
  )
  assert.equal(
    result.errors.some((error) => error.includes('missing source evidence')),
    true,
  )
})

test('reports synthetic-scope mismatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-assets-'))
  const { manifestPath } = fixtureManifest(root, {
    path: 'public/images/synthetic-stores/fixture.bin',
    syntheticRestriction: 'public evidence allowed',
  })
  const result = verifyManifest(root, manifestPath)
  assert.equal(
    result.errors.some((error) => error.includes('synthetic restriction mismatch')),
    true,
  )
})

test('preserves an explicitly unknown source without fabricated clearance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-assets-'))
  const { manifestPath } = fixtureManifest(root, { source: 'docs/evidence/unknown.md' })
  const result = verifyManifest(root, manifestPath)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.unknownRights, ['public/fixture.bin'])
})
