import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, open, symlink, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  importCuratedCatalog,
  inspectCuratedWebP,
  validateCuratedManifest,
  verifyCuratedCatalog,
} from './curated-catalog-assets.mjs'

const IMAGE = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vtV4/+lwf/S4P/pcH/pcH8bss4bpAAA',
  'base64',
)
function manifest() {
  return {
    schemaVersion: 1,
    storeSlug: 'the-market-at-macvicar',
    galleryWallSha256: 'a'.repeat(64),
    sourceRightsManifestSha256: 'b'.repeat(64),
    assets: Array.from({ length: 51 }, (_, order) => {
      const sha256 = String(order + 1).padStart(64, '0')
      return {
        kind: order === 0 ? 'cover' : 'gallery',
        order,
        sourcePhotoId: String(order + 1),
        sha256,
        bytes: IMAGE.length,
        width: 1,
        height: 1,
        chunks: ['VP8'],
        path: `/curated/macvicar/v1/${sha256}.webp`,
        alt: 'Synthetic color',
        caption: 'Synthetic color image',
        rightsLabel: 'Store owner-authorized photo',
      }
    }),
  }
}

test('accepts only the fixed ordered public manifest and simple still-image WebP container', () => {
  assert.equal(validateCuratedManifest(manifest()).assets.length, 51)
  assert.deepEqual(inspectCuratedWebP(IMAGE), { width: 1, height: 1, chunks: ['VP8'] })
})

for (const [name, value] of [
  ['null', () => null],
  ['scalar', (item) => item.assets[0].sha256],
  ['duplicates', (item) => [item.assets[0].sha256, item.assets[0].sha256]],
  ['unapproved hash', () => ['f'.repeat(64)]],
  ['unsorted hashes', (item) => [item.assets[1].sha256, item.assets[0].sha256]],
]) {
  test(`rejects ${name} withdrawal metadata`, () => {
    const item = manifest()
    const binding = {
      storeSlug: item.storeSlug,
      manifestSha256: 'c'.repeat(64),
      assets: item.assets,
      withdrawnSha256: value(item),
    }
    assert.throws(
      () => verifyCuratedCatalog([], 'pages', binding, binding.manifestSha256, ''),
      /withdrawal/,
    )
  })
}

for (const [name, change] of [
  [
    'unknown private root fields',
    (item) => {
      item.privatePath = 'C:/private/permission'
    },
  ],
  [
    'private asset fields',
    (item) => {
      item.assets[0].permission = 'private correspondence'
    },
  ],
  [
    'wrong store',
    (item) => {
      item.storeSlug = 'other-store'
    },
  ],
  [
    'wrong schema',
    (item) => {
      item.schemaVersion = 2
    },
  ],
  [
    'missing derivative',
    (item) => {
      item.assets.pop()
    },
  ],
  [
    'extra derivative',
    (item) => {
      item.assets.push(item.assets[0])
    },
  ],
  [
    'unordered gallery',
    (item) => {
      item.assets.reverse()
    },
  ],
  [
    'second cover',
    (item) => {
      item.assets[1].kind = 'cover'
    },
  ],
  [
    'duplicate hash',
    (item) => {
      item.assets[1].sha256 = item.assets[0].sha256
    },
  ],
  [
    'duplicate source',
    (item) => {
      item.assets[1].sourcePhotoId = item.assets[0].sourcePhotoId
    },
  ],
  [
    'source traversal',
    (item) => {
      item.assets[0].sourcePhotoId = '../private'
    },
  ],
  [
    'output traversal',
    (item) => {
      item.assets[0].path = '/curated/macvicar/v1/../private.webp'
    },
  ],
  [
    'original path',
    (item) => {
      item.assets[0].path = '/original/photo.webp'
    },
  ],
  [
    'zero bytes',
    (item) => {
      item.assets[0].bytes = 0
    },
  ],
  [
    'excessive bytes',
    (item) => {
      item.assets[0].bytes = 9 * 1024 * 1024
    },
  ],
  [
    'fractional dimensions',
    (item) => {
      item.assets[0].width = 1.5
    },
  ],
  [
    'oversize dimensions',
    (item) => {
      item.assets[0].height = 16384
    },
  ],
  [
    'embedded metadata',
    (item) => {
      item.assets[0].chunks.push('EXIF')
    },
  ],
  [
    'HTML caption',
    (item) => {
      item.assets[0].caption = '<img src=x>'
    },
  ],
  [
    'private alt path',
    (item) => {
      item.assets[0].alt = 'C:/Users/private/photo'
    },
  ],
  [
    'missing rights label',
    (item) => {
      item.assets[0].rightsLabel = ''
    },
  ],
]) {
  test(`rejects curated manifest with ${name}`, () => {
    const item = manifest()
    change(item)
    assert.throws(() => validateCuratedManifest(item), /curated|Curated/)
  })
}

for (const [name, change] of [
  [
    'non-image content',
    (bytes) => {
      bytes.write('HTML', 0)
    },
  ],
  [
    'truncated RIFF length',
    (bytes) => {
      bytes.writeUInt32LE(bytes.length, 4)
    },
  ],
  [
    'oversize chunk',
    (bytes) => {
      bytes.writeUInt32LE(0xffffffff, 16)
    },
  ],
  [
    'EXIF',
    (bytes) => {
      bytes.write('EXIF', 12)
    },
  ],
  [
    'XMP',
    (bytes) => {
      bytes.write('XMP ', 12)
    },
  ],
  [
    'ICCP',
    (bytes) => {
      bytes.write('ICCP', 12)
    },
  ],
  [
    'animation',
    (bytes) => {
      bytes.write('ANIM', 12)
    },
  ],
  [
    'unknown chunk',
    (bytes) => {
      bytes.write('JUNK', 12)
    },
  ],
  [
    'invalid frame signature',
    (bytes) => {
      bytes.write('bad', 23)
    },
  ],
]) {
  test(`rejects WebP with ${name}`, () => {
    const bytes = Buffer.from(IMAGE)
    change(bytes)
    assert.throws(() => inspectCuratedWebP(bytes), /curated|Curated/)
  })
}

test('rejects trailing bytes and appended metadata even when RIFF length is updated', () => {
  const bytes = Buffer.concat([IMAGE, Buffer.from('EXIF\0\0\0\0')])
  assert.throws(() => inspectCuratedWebP(bytes), /RIFF/)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  assert.throws(() => inspectCuratedWebP(bytes), /chunk bounds/)
})

test('rejects symlink input before reading derivative bytes', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'curated-symlink-'))
  const input = path.join(root, 'input'),
    output = path.join(root, 'output')
  await mkdir(input)
  await mkdir(output)
  const item = manifest(),
    text = JSON.stringify(item),
    manifestPath = path.join(root, 'manifest.json')
  await writeFile(manifestPath, text)
  for (const asset of item.assets.slice(1))
    await writeFile(path.join(input, `${asset.sourcePhotoId}.webp`), IMAGE)
  const outside = path.join(root, 'outside.webp')
  await writeFile(outside, IMAGE)
  try {
    await symlink(outside, path.join(input, '1.webp'), 'file')
  } catch (error) {
    if (error.code === 'EPERM')
      return context.skip('Windows symlink privilege unavailable; Linux CI supplies this negative')
    throw error
  }
  await assert.rejects(
    importCuratedCatalog(
      {
        'curated-scope': 'macvicar',
        'curated-manifest': manifestPath,
        'curated-input': input,
        'curated-manifest-sha256': createHash('sha256').update(text).digest('hex'),
      },
      output,
      'pages',
    ),
    /nonregular/,
  )
})

test('rejects a derivative modified during its actual file read', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'curated-mutation-'))
  const input = path.join(root, 'input'),
    output = path.join(root, 'output'),
    manifestPath = path.join(root, 'manifest.json')
  await mkdir(input)
  await mkdir(output)
  const item = manifest(),
    text = JSON.stringify(item)
  await writeFile(manifestPath, text)
  for (const asset of item.assets)
    await writeFile(path.join(input, `${asset.sourcePhotoId}.webp`), IMAGE)
  const probe = await open(manifestPath, 'r'),
    prototype = Object.getPrototypeOf(probe)
  const readFile = prototype.readFile
  await probe.close()
  context.mock.method(prototype, 'readFile', async function (...arguments_) {
    const bytes = await readFile.apply(this, arguments_)
    if (bytes.toString('ascii', 0, 4) === 'RIFF') {
      const changedTime = new Date(Date.now() + 10000)
      await utimes(path.join(input, '1.webp'), changedTime, changedTime)
    }
    return bytes
  })
  await assert.rejects(
    importCuratedCatalog(
      {
        'curated-scope': 'macvicar',
        'curated-manifest': manifestPath,
        'curated-input': input,
        'curated-manifest-sha256': createHash('sha256').update(text).digest('hex'),
      },
      output,
      'pages',
    ),
    /changed during read/,
  )
})
