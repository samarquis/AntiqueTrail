import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createReceipt, createRelease, verifyRelease } from './release-artifact.mjs'

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

async function vercelFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'antique-trail-vercel-release-'))
  const dist = path.join(root, 'output')
  const bundle = path.join(root, 'bundle')
  const lockfile = path.join(root, 'package-lock.json')
  await mkdir(dist, { recursive: true })
  await writeFile(path.join(dist, 'index.html'), '<h1>Antique Trail</h1>\n')
  await writeFile(
    path.join(dist, 'config.json'),
    JSON.stringify({
      version: 3,
      routes: null,
      headers: VERCEL_AUTH_SOURCES.map((source) => ({
        source,
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      })),
    }),
  )
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
  await writeFile(
    path.join(item.dist, 'config.json'),
    JSON.stringify({ version: 3, routes: null, headers: [] }),
  )
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
