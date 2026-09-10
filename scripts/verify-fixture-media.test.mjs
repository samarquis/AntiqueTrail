import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'

describe('verify-fixture-media', () => {
  let tempRoot

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-fixture-'))
  })

  after(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('passes for the canonical fixture inventory', async () => {
    const { verifyFixtureMedia } = await import('./verify-fixture-media.mjs')
    const scriptDir = path.dirname(fileURLToPath(new URL(import.meta.url)))
    const root = path.resolve(scriptDir, '..')
    const result = verifyFixtureMedia(root)
    assert.deepStrictEqual(result.errors, [])
    assert.ok(typeof result.fileDigest === 'string' && result.fileDigest.length === 64)
  })

  it('rejects a missing cover file', async () => {
    const { verifyFixtureMedia } = await import('./verify-fixture-media.mjs')
    const scriptDir = path.dirname(fileURLToPath(new URL(import.meta.url)))
    const root = path.resolve(scriptDir, '..')
    const stubRoot = path.join(tempRoot, 'no-cover')
    fs.mkdirSync(
      path.join(stubRoot, 'public', 'images', 'synthetic-fixtures', 'blue-finch-curios'),
      { recursive: true },
    )
    fs.mkdirSync(path.join(stubRoot, 'public', 'images', 'synthetic-stores', '1280w'), {
      recursive: true,
    })
    fs.mkdirSync(path.join(stubRoot, 'src', 'features', 'catalog'), { recursive: true })
    fs.mkdirSync(path.join(stubRoot, 'docs', 'evidence', 'fixture-eval'), { recursive: true })
    fs.copyFileSync(
      path.join(root, 'src', 'features', 'catalog', 'fixtureMedia.json'),
      path.join(stubRoot, 'src', 'features', 'catalog', 'fixtureMedia.json'),
    )
    fs.copyFileSync(
      path.join(root, 'docs', 'evidence', 'fixture-eval', 'provenance.json'),
      path.join(stubRoot, 'docs', 'evidence', 'fixture-eval', 'provenance.json'),
    )
    const result = verifyFixtureMedia(stubRoot)
    assert.ok(result.errors.some((error) => error.includes('missing cover')))
  })
})
