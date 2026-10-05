import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { URL } from 'node:url'
import { createReceipt, createRelease, verifyRelease } from './release-artifact.mjs'

// Fifty-one distinct 1x1 color images encoded and decoded with libwebp via Pillow.
// No client photographs or test-time image dependency.
const CURATED_WEBPS = [
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vtV4/+lwf/S4P/pcH/pcH8bss4bpAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vsuS/+jjf/Rxv/o43/o436FGyiTqAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoBAAEAAUAmJaACdLoABDAAAP77Gcv/oUP/0KH/6FD/6FD67xaSkAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAABwAQCdASoBAAEAAUAmJaACdAF1AAD++xnL/57R//z2j//ntH/nEXVVPX36AAAA',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++u/v/5l5//zLz//mXn/MvLDk2uYgAA==',
  'UklGRjYAAABXRUJQVlA4ICoAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++to//5aF//loX/+Whf8mxg+K+AA=',
  'UklGRjYAAABXRUJQVlA4ICoAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++q4P/5Nl//k2X/+TZf8moGCAAAA=',
  'UklGRjIAAABXRUJQVlA4ICYAAAAwAQCdASoBAAEAAUAmJaAAA3AA/vqJ3///ID//8gP//yA//i5gAA==',
  'UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++onf/4kL//jKn/+Mqf8QuSAA',
  'UklGRjYAAABXRUJQVlA4ICoAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++nlf/4U1//hTX/+FNf8KXJuwMAA=',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++ld3/4E7//gTv/+BO/8CdKvV5XAAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAFAAAD++kXL/37S//voB//fQD/VzgSVqzCAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vohl/97Bf+9AP+9AP7TPIyG3MAAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vohl/94z/+4z/+4z/5ffbsXbwwAAA==',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vn7A/92T/+2T/+2T/3jPyR3nsvgAAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vnnA/9zgf9wcf9g4/jr/amxVTycAAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoBAAEAAUAmJaACdLoABGaAAP75vhf/bQ//Wh/+tD/qO/w5U+nbYAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++b4X/2ln6ln6ln+PL/bsFnLGAAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++ajv/2Vj6Vj6Vj9kj/4hno9S4AAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++X2//2Dv5wH5wH9MH/43ZCofZQAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++U8//1aHy0PlofwkP/JTX+NuOwAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++TbP/1BnyDPkGfqpf/LPn8NnDgAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++TbP/0mzxNnibPkkf/M0THMfr0AA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++QRn/0JPwSfgk/dP/+cSx1O7tAAA',
  'UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++Op//z0yiCzev3/z0zXmD/CwAA==',
  'UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vi1F/8zRMcx+1f/6En4JPwSfuAAAAA=',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++Hyz/yz5/DZ1Of/SbPE2eJs+OYAA',
  'UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD++Hyz/yU1/jblq/+oM+Wh8tD9bgAA',
  'UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vhff/8Qz0epku/+rQ+Wh8tD9uwAAAA=',
  'UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vgjb/8D8unDHh/9cB+cB+cB/KwAAAA=',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vgEP/na2GIKl//ZWP/Ssf+lY/XoAAAA',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vfEX/DlT6dnd/9pZ/9Kx/6Vj+FQAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vfEX+SO89mIX/20P/1of/rQ/6UAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vd+L4tikPQ//uDj/sHH/YOP14AAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vdZLyKRYyt/9zgf9zgf9zgfxIAAAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9w1uBJWrC9/92T//7ZP//tk/9wgAAA==',
  'UklGRjYAAABXRUJQVlA4ICoAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9uXpaiSpv/vGf//cZ//9xn/yIAA=',
  'UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9uL1G/+9gv/92C//3YL/WwAA',
  'UklGRjIAAABXRUJQVlA4ICYAAAAwAQCdASoBAAEAAUAmJaAAA3AA/vaVV//99AP/76Af/30A/wQAAA==',
  'UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9j9gw/+/aX/9+0v/79pf6hAA',
  'UklGRjYAAABXRUJQVlA4ICoAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9hNOT9L3/8Cd//wJ3//Anf+ECAA=',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+9bh+qqevxu//Cmv/8Ka//wpr/hAgAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoBAAEAAUAmJaACdAF1AAD+9bh+qqevxu//GVP/8ZU//xlT/i5gAA==',
  'UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vWJH6+AKeqP/yA//yA//yA//i5gAA==',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vUnX8VvqBnIP/k2X/kB//kB//JOAAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vS+790bF1tLn/8tC/8tC/8tC/5JwAAA',
  'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoBAAEAAUAmJaACdLoABGaAAP70iIf7jsDdeLf/y0L/y0L/y0L/laAA',
  'UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoBAAEAAUAmJaACdLoB+AAETAAA/vSIh/tyZecEf/nEX5xF+cRf+eEAAAA=',
  'UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoBAAEAAUAmJaACdLoB+AAETAAA/vQYt/4s5GI7PN/+e0fntH57R/54QAA=',
  'UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+899n/kF6t823b/9Ch/Qof0KH/0EgAAA=',
  'UklGRj4AAABXRUJQVlA4IDIAAADwAQCdASoBAAEAAUAmJaACdLoB+AAEgwAA/vNpl/5glfkG7UP/0cb9HG/Rxv/RcAAAAA==',
]

async function curatedFixture(kind = 'pages') {
  const item = kind === 'vercel' ? await vercelFixture() : await fixture()
  const input = path.join(item.root, 'private-input')
  const manifestPath = path.join(item.root, 'publication-manifest.json')
  await mkdir(input)
  const assets = []
  for (const [order, encoded] of CURATED_WEBPS.entries()) {
    const bytes = Buffer.from(encoded, 'base64')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const sourcePhotoId = String(100000000000000 + order)
    await writeFile(path.join(input, `${sourcePhotoId}.webp`), bytes)
    assets.push({
      kind: order === 0 ? 'cover' : 'gallery',
      order,
      sourcePhotoId,
      sha256,
      bytes: bytes.length,
      width: 1,
      height: 1,
      chunks: ['VP8'],
      path: `/curated/macvicar/v1/${sha256}.webp`,
      alt: `Synthetic color ${order}`,
      caption: `Color ${order}`,
      rightsLabel: 'Store owner-authorized photo',
    })
  }
  const manifest = {
    schemaVersion: 1,
    storeSlug: 'the-market-at-macvicar',
    galleryWallSha256: 'a'.repeat(64),
    sourceRightsManifestSha256: 'b'.repeat(64),
    assets,
  }
  const text = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(manifestPath, text)
  const manifestSha256 = createHash('sha256').update(text).digest('hex')
  const options = {
    ...VERCEL_COMMON,
    kind,
    dist: item.dist,
    out: item.bundle,
    lockfile: item.lockfile,
    'source-sha': SOURCE_SHA,
    'curated-scope': 'macvicar',
    'curated-manifest': manifestPath,
    'curated-input': input,
    'curated-manifest-sha256': manifestSha256,
  }
  return { ...item, input, manifestPath, manifest, manifestSha256, options }
}

test('seals all fifty-one approved curated derivatives after copying generated output', async () => {
  const item = await curatedFixture()
  const manifest = await createRelease(item.options)
  assert.equal(manifest.curatedCatalog?.manifestSha256, item.manifestSha256)
  assert.deepEqual(manifest.curatedCatalog.assets, item.manifest.assets)
  assert.equal(manifest.files.filter((file) => file.path.startsWith('curated/')).length, 51)
  for (const asset of item.manifest.assets) {
    assert.deepEqual(
      await readFile(path.join(item.bundle, 'dist', asset.path)),
      await readFile(path.join(item.input, `${asset.sourcePhotoId}.webp`)),
    )
  }
  assert.equal(JSON.stringify(manifest).includes(item.input), false)
  await verifyRelease({
    bundle: item.bundle,
    'expected-digest': manifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
    'expected-curated-manifest-sha256': item.manifestSha256,
  })
})

test('requires external curated manifest identity when verifying a curated release', async () => {
  const item = await curatedFixture()
  const manifest = await createRelease(item.options)
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
    }),
    /expected curated manifest/,
  )
})

for (const withdrawing of [false, true]) {
  test(`${withdrawing ? 'withdrawal ' : ''}imports curated assets into Vercel static output and retains the binding in receipts`, async () => {
    const item = await curatedFixture('vercel')
    const withdrawn = withdrawing ? item.manifest.assets[1].sha256 : undefined
    const manifest = await createRelease({
      ...item.options,
      ...(withdrawing ? { 'curated-withdrawn-sha256': withdrawn } : {}),
    })
    assert.equal(
      manifest.files.filter((file) => file.path.startsWith('static/curated/')).length,
      withdrawing ? 50 : 51,
    )
    const expected = {
      bundle: item.bundle,
      kind: 'vercel',
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': item.manifestSha256,
      'expected-curated-withdrawn-sha256': withdrawn,
    }
    await verifyRelease(expected)
    const providerFile = path.join(item.root, 'provider.json')
    await writeFile(
      providerFile,
      JSON.stringify({
        deploymentId: 'id',
        deploymentUrl: 'https://deployment.test',
        canonicalHostname: 'https://canonical.test',
        projectName: 'antique-trail',
        branch: 'main',
        environment: 'production',
        cliVersion: '1',
        mode: 'promotion',
        reasonCode: 'reviewed',
        sourceRunId: '1',
        deployedAt: '2026-10-04T00:00:00Z',
        deploymentAccessStatus: '200',
        canonicalAccessStatus: '200',
      }),
    )
    await assert.rejects(
      createReceipt({
        ...expected,
        'expected-curated-manifest-sha256': undefined,
        'provider-file': providerFile,
        out: path.join(item.root, 'invalid-receipt.json'),
      }),
      /expected curated manifest/,
    )
    const receipt = await createReceipt({
      ...expected,
      'provider-file': providerFile,
      out: path.join(item.root, 'receipt.json'),
    })
    assert.deepEqual(receipt.artifact.curatedCatalog, manifest.curatedCatalog)
    if (withdrawing)
      await assert.rejects(
        createReceipt({
          ...expected,
          'expected-curated-withdrawn-sha256': undefined,
          'provider-file': providerFile,
          out: path.join(item.root, 'missing-withdrawal-receipt.json'),
        }),
        /expected curated withdrawal/,
      )
  })
}

for (const flag of [
  'curated-scope',
  'curated-manifest',
  'curated-input',
  'curated-manifest-sha256',
]) {
  test(`rejects curated release missing --${flag}`, async () => {
    const item = await curatedFixture()
    delete item.options[flag]
    await assert.rejects(createRelease(item.options), /curated option group/)
  })
}

test('rejects unknown curated options instead of silently producing a synthetic-only release', async () => {
  const item = await fixture()
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
      'source-sha': SOURCE_SHA,
      'curated-unknown': 'private-input',
    }),
    /curated option group/,
  )
})

for (const [name, change, error] of [
  [
    'wrong scope',
    async (item) => {
      item.options['curated-scope'] = 'other'
    },
    /curated option group/,
  ],
  [
    'wrong manifest digest',
    async (item) => {
      item.options['curated-manifest-sha256'] = 'f'.repeat(64)
    },
    /manifest digest/,
  ],
  [
    'missing derivative',
    async (item) => {
      await rm(path.join(item.input, `${item.manifest.assets[0].sourcePhotoId}.webp`))
    },
    /Missing, extra/,
  ],
  [
    'extra private input',
    async (item) => {
      await writeFile(path.join(item.input, 'private-permission.txt'), 'private')
    },
    /Missing, extra/,
  ],
  [
    'changed derivative',
    async (item) => {
      await writeFile(
        path.join(item.input, `${item.manifest.assets[0].sourcePhotoId}.webp`),
        Buffer.from(CURATED_WEBPS[1], 'base64'),
      )
    },
    /hash, size or dimensions/,
  ],
  [
    'unexpected generated curated bytes',
    async (item) => {
      await mkdir(path.join(item.dist, 'curated'))
      await writeFile(
        path.join(item.dist, 'curated', 'old.webp'),
        Buffer.from(CURATED_WEBPS[0], 'base64'),
      )
    },
    /Unexpected curated output/,
  ],
]) {
  test(`rejects curated release with ${name}`, async () => {
    const item = await curatedFixture()
    await change(item)
    await assert.rejects(createRelease(item.options), error)
  })
}

for (const [name, change] of [
  [
    'stripped admission metadata',
    async (item, manifest) => {
      delete manifest.curatedCatalog
    },
  ],
  [
    'changed public caption',
    async (item, manifest) => {
      manifest.curatedCatalog.assets[0].caption = 'Unapproved caption'
    },
  ],
  [
    'missing derivative',
    async (item) => {
      await rm(path.join(item.bundle, 'dist', item.manifest.assets[0].path))
    },
  ],
  [
    'tampered derivative',
    async (item) => {
      await writeFile(
        path.join(item.bundle, 'dist', item.manifest.assets[0].path),
        Buffer.from(CURATED_WEBPS[1], 'base64'),
      )
    },
  ],
  [
    'extra derivative',
    async (item) => {
      await writeFile(
        path.join(item.bundle, 'dist', 'curated', 'private.webp'),
        Buffer.from(CURATED_WEBPS[0], 'base64'),
      )
    },
  ],
]) {
  test(`rejects sealed curated artifact with ${name}`, async () => {
    const item = await curatedFixture(),
      manifest = await createRelease(item.options)
    await change(item, manifest)
    await writeFile(path.join(item.bundle, 'artifact-manifest.json'), JSON.stringify(manifest))
    await assert.rejects(
      verifyRelease({
        bundle: item.bundle,
        'expected-digest': manifest.artifactDigest,
        'expected-source-sha': SOURCE_SHA,
        'expected-curated-manifest-sha256': item.manifestSha256,
      }),
      /curated|Curated|digest does not match/,
    )
  })
}

test('denies a retained curated artifact under a new withdrawal manifest identity', async () => {
  const item = await curatedFixture(),
    manifest = await createRelease(item.options)
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': 'c'.repeat(64),
    }),
    /expected admission/,
  )
})

test('denies an old full-photo artifact against the current individual withdrawal set', async () => {
  const item = await curatedFixture(),
    manifest = await createRelease(item.options)
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': item.manifestSha256,
      'expected-curated-withdrawn-sha256': item.manifest.assets[1].sha256,
    }),
    /withdrawal/,
  )
})

for (const [name, indexes] of [
  ['one gallery image', [1]],
  ['cover', [0]],
  ['all gallery images leaving only cover', Array.from({ length: 50 }, (_, index) => index + 1)],
  ['all images including the final cover', Array.from({ length: 51 }, (_, index) => index)],
]) {
  test(`withdrawal excludes ${name} while retaining immutable approved metadata`, async () => {
    const item = await curatedFixture()
    const withdrawn = indexes.map((index) => item.manifest.assets[index].sha256)
    const manifest = await createRelease({
      ...item.options,
      'curated-withdrawn-sha256': withdrawn.join(','),
    })
    assert.deepEqual(manifest.curatedCatalog.assets, item.manifest.assets)
    assert.deepEqual(manifest.curatedCatalog.withdrawnSha256, [...withdrawn].sort())
    assert.equal(
      manifest.files.filter((file) => file.path.startsWith('curated/')).length,
      51 - withdrawn.length,
    )
    for (const hash of withdrawn)
      await assert.rejects(
        readFile(path.join(item.bundle, 'dist', 'curated', 'macvicar', 'v1', `${hash}.webp`)),
        { code: 'ENOENT' },
      )
    const expected = {
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': item.manifestSha256,
    }
    await assert.rejects(verifyRelease(expected), /expected curated withdrawal/)
    await verifyRelease({ ...expected, 'expected-curated-withdrawn-sha256': withdrawn.join(',') })
    await assert.rejects(
      verifyRelease({ ...expected, 'expected-curated-withdrawn-sha256': '' }),
      /withdrawal/,
    )
  })
}

for (const [name, value] of [
  [
    'duplicate hash',
    (item) => `${item.manifest.assets[1].sha256},${item.manifest.assets[1].sha256}`,
  ],
  ['unapproved hash', () => 'f'.repeat(64)],
  ['uppercase hash', (item) => item.manifest.assets[1].sha256.toUpperCase()],
  ['empty list item', (item) => `${item.manifest.assets[1].sha256},`],
  ['nonstring value', () => null],
]) {
  test(`withdrawal rejects ${name}`, async () => {
    const item = await curatedFixture()
    await assert.rejects(
      createRelease({ ...item.options, 'curated-withdrawn-sha256': value(item) }),
      /withdrawal/,
    )
  })
}

test('withdrawal option requires the complete curated admission group', async () => {
  const item = await fixture()
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
      'source-sha': SOURCE_SHA,
      'curated-withdrawn-sha256': '',
    }),
    /curated option group/,
  )
})

test('empty withdrawal preserves the original artifact metadata and digest', async () => {
  const item = await curatedFixture(),
    original = await createRelease(item.options)
  const empty = await createRelease({
    ...item.options,
    out: path.join(item.root, 'empty-withdrawal-bundle'),
    'curated-withdrawn-sha256': '',
  })
  assert.deepEqual(empty, original)
  await verifyRelease({
    bundle: item.bundle,
    'expected-digest': original.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
    'expected-curated-manifest-sha256': item.manifestSha256,
    'expected-curated-withdrawn-sha256': '',
  })
})

test('withdrawal metadata cannot hide retained copies from an old full-photo artifact', async () => {
  const item = await curatedFixture(),
    manifest = await createRelease(item.options)
  const withdrawn = item.manifest.assets[1].sha256
  manifest.curatedCatalog.withdrawnSha256 = [withdrawn]
  await writeFile(path.join(item.bundle, 'artifact-manifest.json'), JSON.stringify(manifest))
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': item.manifestSha256,
      'expected-curated-withdrawn-sha256': withdrawn,
    }),
    /coverage/,
  )
})

test('stripped withdrawal metadata and reintroduced withdrawn bytes both fail verification', async () => {
  const item = await curatedFixture(),
    withdrawn = item.manifest.assets[1].sha256
  const manifest = await createRelease({ ...item.options, 'curated-withdrawn-sha256': withdrawn })
  const expected = {
    bundle: item.bundle,
    'expected-digest': manifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
    'expected-curated-manifest-sha256': item.manifestSha256,
    'expected-curated-withdrawn-sha256': withdrawn,
  }
  delete manifest.curatedCatalog.withdrawnSha256
  await writeFile(path.join(item.bundle, 'artifact-manifest.json'), JSON.stringify(manifest))
  await assert.rejects(verifyRelease(expected), /withdrawal/)
  manifest.curatedCatalog.withdrawnSha256 = [withdrawn]
  await writeFile(path.join(item.bundle, 'artifact-manifest.json'), JSON.stringify(manifest))
  await writeFile(
    path.join(item.bundle, 'dist', item.manifest.assets[1].path),
    Buffer.from(CURATED_WEBPS[1], 'base64'),
  )
  await assert.rejects(verifyRelease(expected), /coverage/)
})

test('withdrawal still validates withdrawn private input bytes rather than omitting failures', async () => {
  const item = await curatedFixture(),
    asset = item.manifest.assets[1]
  await writeFile(
    path.join(item.input, `${asset.sourcePhotoId}.webp`),
    Buffer.from(CURATED_WEBPS[2], 'base64'),
  )
  await assert.rejects(
    createRelease({ ...item.options, 'curated-withdrawn-sha256': asset.sha256 }),
    /hash, size or dimensions/,
  )
})

test('detects stripped curated metadata from actual output even without an expected manifest flag', async () => {
  const item = await curatedFixture(),
    manifest = await createRelease(item.options)
  delete manifest.curatedCatalog
  await writeFile(path.join(item.bundle, 'artifact-manifest.json'), JSON.stringify(manifest))
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
    }),
    /Missing curated admission metadata/,
  )
})

test('synthetic-only rollback cannot satisfy an expected real-store curated admission', async () => {
  const item = await fixture(),
    manifest = await createRelease({
      ...VERCEL_COMMON,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
      'source-sha': SOURCE_SHA,
    })
  assert.equal(Object.hasOwn(manifest, 'curatedCatalog'), false)
  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
      'expected-curated-manifest-sha256': 'c'.repeat(64),
    }),
    /unsafe withdrawal rollback/,
  )
})

const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'antique-trail-release-'))
  const dist = path.join(root, 'dist')
  const bundle = path.join(root, 'bundle')
  const lockfile = path.join(root, 'package-lock.json')
  await mkdir(path.join(dist, 'assets'), { recursive: true })
  await writeFile(path.join(dist, 'index.html'), '<h1>Antique Trail</h1>\n')
  await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log("trail")\n')
  await writeFile(
    path.join(dist, '_headers'),
    [
      '/auth/callback*',
      '  Cache-Control: private, no-store',
      '  Referrer-Policy: no-referrer',
      '',
      '/auth/register*',
      '  Cache-Control: private, no-store',
      '  Referrer-Policy: no-referrer',
      '',
      '/auth/verify*',
      '  Cache-Control: private, no-store',
      '  Referrer-Policy: no-referrer',
      '',
      '/auth/recovery*',
      '  Cache-Control: private, no-store',
      '  Referrer-Policy: no-referrer',
      '',
    ].join('\n'),
  )
  await writeFile(lockfile, '{}\n')
  return { root, dist, bundle, lockfile }
}

test('creates and verifies a deterministic exact-file manifest', async () => {
  const first = await fixture()
  const second = await fixture()
  const common = {
    'source-sha': SOURCE_SHA,
    repository: 'samarquis/AntiqueTrail',
    'node-version': 'v20.19.0',
    'npm-version': '11.13.1',
    'runner-os': 'Linux',
    'runner-arch': 'X64',
  }
  const firstManifest = await createRelease({
    ...common,
    dist: first.dist,
    out: first.bundle,
    lockfile: first.lockfile,
  })
  const secondManifest = await createRelease({
    ...common,
    dist: second.dist,
    out: second.bundle,
    lockfile: second.lockfile,
  })

  assert.equal(firstManifest.artifactDigest, secondManifest.artifactDigest)
  const verified = await verifyRelease({
    bundle: first.bundle,
    'expected-digest': firstManifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
  })
  assert.deepEqual(verified.files, firstManifest.files)
})

test('fails closed when artifact bytes change', async () => {
  const item = await fixture()
  const manifest = await createRelease({
    dist: item.dist,
    out: item.bundle,
    'source-sha': SOURCE_SHA,
    repository: 'samarquis/AntiqueTrail',
    'node-version': 'v20.19.0',
    'npm-version': '11.13.1',
    'runner-os': 'Linux',
    'runner-arch': 'X64',
    lockfile: item.lockfile,
  })
  await writeFile(path.join(item.bundle, 'dist', 'index.html'), 'tampered\n')

  await assert.rejects(
    verifyRelease({
      bundle: item.bundle,
      'expected-digest': manifest.artifactDigest,
      'expected-source-sha': SOURCE_SHA,
    }),
    /digest does not match/,
  )
})

test('rejects review-harness identities and controls from production artifacts', async () => {
  const item = await fixture()
  await writeFile(
    path.join(item.dist, 'assets', 'app.js'),
    'console.log("Synthetic Review Harness: review-shopper-a")\n',
  )
  await assert.rejects(
    createRelease({
      dist: item.dist,
      out: item.bundle,
      'source-sha': SOURCE_SHA,
      repository: 'samarquis/AntiqueTrail',
      'node-version': 'v20.19.0',
      'npm-version': '11.13.1',
      'runner-os': 'Linux',
      'runner-arch': 'X64',
      lockfile: item.lockfile,
    }),
    /review-only marker/,
  )
})

test('rejects a production artifact without route-specific private auth headers', async () => {
  const item = await fixture()
  await writeFile(path.join(item.dist, '_headers'), '/*\n  Referrer-Policy: no-referrer\n')
  await assert.rejects(
    createRelease({
      dist: item.dist,
      out: item.bundle,
      'source-sha': SOURCE_SHA,
      repository: 'samarquis/AntiqueTrail',
      'node-version': 'v20.19.0',
      'npm-version': '11.13.1',
      'runner-os': 'Linux',
      'runner-arch': 'X64',
      lockfile: item.lockfile,
    }),
    /private no-store auth headers/,
  )
})

test('binds a deployment receipt to the verified artifact digest', async () => {
  const item = await fixture()
  const manifest = await createRelease({
    dist: item.dist,
    out: item.bundle,
    'source-sha': SOURCE_SHA,
    repository: 'samarquis/AntiqueTrail',
    'node-version': 'v20.19.0',
    'npm-version': '11.13.1',
    'runner-os': 'Linux',
    'runner-arch': 'X64',
    lockfile: item.lockfile,
  })
  const providerFile = path.join(item.root, 'provider.json')
  const receiptFile = path.join(item.root, 'receipt.json')
  await writeFile(
    providerFile,
    JSON.stringify({
      deploymentId: 'deployment-id',
      deploymentUrl: 'https://deployment.example.test',
      canonicalHostname: 'https://shared.example.test',
      projectName: 'antique-trail',
      branch: 'shared-alpha',
      environment: 'shared-alpha',
      cliVersion: '4.28.1',
      mode: 'rollback',
      reasonCode: 'restore-prior-accepted',
      sourceRunId: '1234',
      deployedAt: '2026-08-04T12:00:00Z',
      deploymentAccessStatus: '302',
      canonicalAccessStatus: '403',
    }),
  )

  const receipt = await createReceipt({
    bundle: item.bundle,
    'provider-file': providerFile,
    out: receiptFile,
    'expected-digest': manifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
  })
  assert.equal(receipt.artifact.artifactDigest, manifest.artifactDigest)
  assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/)
  assert.deepEqual(JSON.parse(await readFile(receiptFile, 'utf8')), receipt)
})

const VERCEL_AUTH_SOURCES = [
  '/auth/callback/:path*',
  '/auth/register/:path*',
  '/auth/verify/:path*',
  '/auth/recovery/:path*',
]
const VERCEL_COMMON = {
  repository: 'samarquis/AntiqueTrail',
  'node-version': 'v20.19.0',
  'npm-version': '11.13.1',
  'runner-os': 'Linux',
  'runner-arch': 'X64',
}

test('authored SPA fallback excludes only the exact curated namespace and preserves adjacent deep links', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.rewrites.length, 1)
  assert.equal(config.rewrites[0].destination, '/index.html')
  const fallback = new RegExp(`^${config.rewrites[0].source}$`)
  for (const pathname of [
    '/curated/macvicar/v1',
    '/curated/macvicar/v1/',
    '/curated/macvicar/v1/missing.webp',
    '/curated/macvicar/v1/nested/missing.webp',
  ])
    assert.equal(fallback.test(pathname), false, pathname)
  for (const pathname of [
    '/',
    '/stores',
    '/stores/the-market-at-macvicar',
    '/stores/the-market-at-macvicar/photos',
    '/auth/callback',
    '/auth/recovery/code',
    '/curated/macvicar/v10/missing.webp',
    '/curated/macvicar/v1-adjacent/missing.webp',
  ])
    assert.equal(fallback.test(pathname), true, pathname)
})

test('rejects the original unrestricted Vercel SPA fallback', async () => {
  const item = await vercelFixture()
  const config = vercelOutputConfig()
  config.routes[7].src = '^(?:/(.*))$'
  await writeFile(path.join(item.dist, 'config.json'), JSON.stringify(config))
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      kind: 'vercel',
      'source-sha': SOURCE_SHA,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
    }),
    /SPA fallback required/,
  )
})

// Reviewed Build Output contract; native build evidence must confirm this exact
// compiled shape, including headers and filesystem-first rewrite.
function vercelOutputConfig() {
  return {
    version: 3,
    routes: [
      ...VERCEL_AUTH_SOURCES.map((source) => ({
        src: `^${source.replace('/:path*', '')}(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?$`,
        headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
        continue: true,
      })),
      {
        src: '^/for-stores(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))?$',
        headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store' },
        continue: true,
      },
      {
        src: '^/assets(?:/(.*))$',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        continue: true,
      },
      { handle: 'filesystem' },
      { src: '^(?:/((?!curated/macvicar/v1(?:/|$)).*))$', dest: '/index.html', check: true },
      { handle: 'error' },
      { status: 404, src: '^(?!/api).*$', dest: '/404.html' },
    ],
    framework: { version: '6.4.3' },
    crons: [],
  }
}

async function vercelFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'antique-trail-vercel-release-'))
  const dist = path.join(root, 'output')
  const bundle = path.join(root, 'bundle')
  const lockfile = path.join(root, 'package-lock.json')
  await mkdir(path.join(dist, 'static'), { recursive: true })
  await writeFile(path.join(dist, 'static', 'index.html'), '<h1>Antique Trail</h1>\n')
  await writeFile(path.join(dist, 'config.json'), JSON.stringify(vercelOutputConfig()))
  await writeFile(lockfile, '{}\n')
  return { root, dist, bundle, lockfile }
}

test('creates and verifies a deterministic Vercel prebuilt bundle', async () => {
  const first = await vercelFixture()
  const second = await vercelFixture()
  const common = { ...VERCEL_COMMON, 'source-sha': SOURCE_SHA }
  const firstManifest = await createRelease({
    ...common,
    kind: 'vercel',
    dist: first.dist,
    out: first.bundle,
    lockfile: first.lockfile,
  })
  const secondManifest = await createRelease({
    ...common,
    kind: 'vercel',
    dist: second.dist,
    out: second.bundle,
    lockfile: second.lockfile,
  })

  assert.equal(firstManifest.artifactDigest, secondManifest.artifactDigest)
  const verified = await verifyRelease({
    kind: 'vercel',
    bundle: first.bundle,
    'expected-digest': firstManifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
  })
  assert.deepEqual(verified.files, firstManifest.files)
})

test('accepted emitted SPA pattern excludes bare and nested curated misses without excluding v10', () => {
  const fallback = new RegExp(vercelOutputConfig().routes[7].src)
  for (const pathname of [
    '/curated/macvicar/v1',
    '/curated/macvicar/v1/',
    '/curated/macvicar/v1/missing.webp',
    '/curated/macvicar/v1/nested/missing.webp',
  ])
    assert.equal(fallback.test(pathname), false, pathname)
  for (const pathname of [
    '/curated/macvicar/v10/missing.webp',
    '/curated/macvicar/v1-adjacent',
    '/stores',
    '/stores/the-market-at-macvicar',
    '/stores/the-market-at-macvicar/photos',
    '/auth/register',
    '/auth/callback/code',
    '/auth/verify/code',
    '/auth/recovery/code',
  ])
    assert.equal(fallback.test(pathname), true, pathname)
})

test('accepts the protected emitted fallback with the existing optional error handler omitted', async () => {
  const item = await vercelFixture(),
    config = vercelOutputConfig()
  config.routes.splice(-2)
  await writeFile(path.join(item.dist, 'config.json'), JSON.stringify(config))
  const manifest = await createRelease({
    ...VERCEL_COMMON,
    kind: 'vercel',
    'source-sha': SOURCE_SHA,
    dist: item.dist,
    out: item.bundle,
    lockfile: item.lockfile,
  })
  await verifyRelease({
    bundle: item.bundle,
    kind: 'vercel',
    'expected-digest': manifest.artifactDigest,
    'expected-source-sha': SOURCE_SHA,
  })
})

test('records only the explicitly supplied runner image', async () => {
  for (const [runnerOs, runnerImage] of [
    ['Windows', undefined],
    ['Linux', 'ubuntu-latest'],
  ]) {
    const item = await vercelFixture()
    const manifest = await createRelease({
      ...VERCEL_COMMON,
      kind: 'vercel',
      'source-sha': SOURCE_SHA,
      'runner-os': runnerOs,
      ...(runnerImage ? { 'runner-image': runnerImage } : {}),
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
    })
    assert.equal(manifest.buildEnvironment.runnerOs, runnerOs)
    assert.equal(manifest.buildEnvironment.runnerImage, runnerImage ?? null)
  }
})

test('rejects a Vercel bundle without a readable config.json', async () => {
  const item = await vercelFixture()
  await rm(path.join(item.dist, 'config.json'))
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      kind: 'vercel',
      'source-sha': SOURCE_SHA,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
    }),
    /readable config\.json/,
  )
})

test('rejects a Vercel bundle without route-specific private auth headers', async () => {
  const item = await vercelFixture()
  const config = vercelOutputConfig()
  config.routes.shift()
  await writeFile(path.join(item.dist, 'config.json'), JSON.stringify(config))
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      kind: 'vercel',
      'source-sha': SOURCE_SHA,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
    }),
    /lacks private no-store auth headers/,
  )
})

for (const [name, change, error] of [
  [
    'source-config headers instead of emitted routes',
    (config) => {
      config.routes = null
    },
    /routing/,
  ],
  [
    'unsupported output version',
    (config) => {
      config.version = 2
    },
    /routing/,
  ],
  [
    'missing cache policy',
    (config) => {
      delete config.routes[0].headers['Cache-Control']
    },
    /lacks private/,
  ],
  [
    'missing referrer policy',
    (config) => {
      delete config.routes[0].headers['Referrer-Policy']
    },
    /lacks private/,
  ],
  [
    'malformed header map',
    (config) => {
      config.routes[0].headers = []
    },
    /header routing/,
  ],
  [
    'nonstring header value',
    (config) => {
      config.routes[0].headers['Cache-Control'] = null
    },
    /Malformed/,
  ],
  [
    'case-colliding header names',
    (config) => {
      config.routes[0].headers['cache-control'] = 'public'
    },
    /Malformed/,
  ],
  [
    'conditional auth headers',
    (config) => {
      config.routes[0].has = [{ type: 'header', key: 'x-preview' }]
    },
    /header routing/,
  ],
  [
    'method-limited auth headers',
    (config) => {
      config.routes[0].methods = ['GET']
    },
    /header routing/,
  ],
  [
    'terminal auth header rule',
    (config) => {
      config.routes[0].continue = false
    },
    /header routing/,
  ],
  [
    'base-only auth match',
    (config) => {
      config.routes[0].src = '^/auth/callback$'
    },
    /lacks private/,
  ],
  [
    'public cache override',
    (config) => {
      config.routes.splice(4, 0, {
        src: '^/auth/.*$',
        headers: { 'Cache-Control': 'public, max-age=60' },
        continue: true,
      })
    },
    /weakens private/,
  ],
  [
    'weakened immutable assets cache',
    (config) => {
      config.routes[5].headers['Cache-Control'] = 'public, max-age=60'
    },
    /weakens private/,
  ],
  [
    'assets cache with extra headers',
    (config) => {
      config.routes[5].headers['Referrer-Policy'] = 'no-referrer'
    },
    /weakens private/,
  ],
  [
    'referrer override',
    (config) => {
      config.routes[0].headers['Referrer-Policy'] = 'origin'
    },
    /weakens private/,
  ],
  [
    'conditional later override',
    (config) => {
      config.routes.splice(4, 0, {
        src: '^/auth/.*$',
        headers: { 'Cache-Control': 'public' },
        continue: true,
        has: [{ type: 'cookie', key: 'preview' }],
      })
    },
    /header routing/,
  ],
  [
    'missing filesystem handler',
    (config) => {
      config.routes.splice(6, 1)
    },
    /filesystem-first/,
  ],
  [
    'missing SPA rewrite',
    (config) => {
      config.routes.splice(7, 1)
    },
    /SPA fallback required/,
  ],
  [
    'external SPA rewrite',
    (config) => {
      config.routes[7].dest = 'https://example.test/'
    },
    /SPA fallback required/,
  ],
  [
    'conditional SPA rewrite',
    (config) => {
      config.routes[7].has = [{ type: 'header', key: 'x-preview' }]
    },
    /SPA fallback required/,
  ],
  [
    'curated exclusion missing bare namespace protection',
    (config) => {
      config.routes[7].src = '^(?:/((?!curated/macvicar/v1/).*))$'
    },
    /SPA fallback required/,
  ],
  [
    'curated exclusion also blocking adjacent v10',
    (config) => {
      config.routes[7].src = '^(?:/((?!curated/macvicar/v1).*))$'
    },
    /SPA fallback required/,
  ],
  [
    'SPA rewrite without filesystem recheck',
    (config) => {
      config.routes[7].check = false
    },
    /SPA fallback required/,
  ],
  [
    'SPA rewrite before filesystem',
    (config) => {
      const [rewrite] = config.routes.splice(7, 1)
      config.routes.splice(6, 0, rewrite)
    },
    /header routing/,
  ],
  [
    'late header override',
    (config) => {
      config.routes.push({ src: '.*', headers: { 'Cache-Control': 'public' }, continue: true })
    },
    /SPA fallback required/,
  ],
]) {
  test(`rejects Vercel output with ${name}`, async () => {
    const item = await vercelFixture()
    const config = vercelOutputConfig()
    change(config)
    await writeFile(path.join(item.dist, 'config.json'), JSON.stringify(config))
    await assert.rejects(
      createRelease({
        ...VERCEL_COMMON,
        kind: 'vercel',
        'source-sha': SOURCE_SHA,
        dist: item.dist,
        out: item.bundle,
        lockfile: item.lockfile,
      }),
      error,
    )
  })
}

test('rejects a Vercel rewrite whose static entry file is missing', async () => {
  const item = await vercelFixture()
  await rm(path.join(item.dist, 'static', 'index.html'))
  await assert.rejects(
    createRelease({
      ...VERCEL_COMMON,
      kind: 'vercel',
      'source-sha': SOURCE_SHA,
      dist: item.dist,
      out: item.bundle,
      lockfile: item.lockfile,
    }),
    /lacks static\/index\.html/,
  )
})
