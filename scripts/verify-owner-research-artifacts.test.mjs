import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { verifyOwnerResearchArtifacts } from './verify-owner-research-artifacts.mjs'

const markers =
  'owner_research_command Private research artifact existing-store-a new-store-a topeka-owner-10a Verify your private invitation https://uaupykgpegbseboklubv.supabase.co'

function fixture() {
  const root = join(tmpdir(), `owner-research-verify-${randomUUID()}`)
  const normal = join(root, 'normal')
  const research = join(root, 'research')
  mkdirSync(normal, { recursive: true })
  mkdirSync(research)
  writeFileSync(join(normal, 'index.html'), '<main>normal application</main>')
  writeFileSync(
    join(research, 'owner-research.html'),
    '<meta content="noindex, nofollow, noarchive">',
  )
  writeFileSync(join(research, 'research.js'), markers)
  const files = Object.fromEntries(
    ['owner-research.html', 'research.js'].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(join(research, path)))
        .digest('hex'),
    ]),
  )
  const canonical = Object.entries(files)
    .map(([path, hash]) => `${hash}  ${path}`)
    .join('\n')
  writeFileSync(
    join(research, 'owner-research-manifest.json'),
    JSON.stringify({
      kind: 'antique-trail-owner-research',
      audience: 'synthetic',
      route: '/for-stores',
      indexing: 'noindex',
      deploymentProtection: 'required',
      contentDigest: `sha256:${createHash('sha256').update(`${canonical}\n`).digest('hex')}`,
      files,
    }),
  )
  const config = join(root, 'vercel.json')
  writeFileSync(
    config,
    JSON.stringify({
      git: { deploymentEnabled: false },
      rewrites: [{ source: '/for-stores', destination: '/owner-research.html' }],
      headers: [
        {
          source: '/(.*)',
          headers: [
            ['Cache-Control', 'private, no-store'],
            ['X-Robots-Tag', 'noindex, nofollow, noarchive'],
            ['Referrer-Policy', 'no-referrer'],
            ['X-Content-Type-Options', 'nosniff'],
            ['X-Frame-Options', 'DENY'],
            ['Cross-Origin-Opener-Policy', 'same-origin'],
            ['Cross-Origin-Resource-Policy', 'same-site'],
            ['Vary', 'Authorization, Origin'],
            [
              'Content-Security-Policy',
              "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://uaupykgpegbseboklubv.supabase.co; connect-src 'self' https://uaupykgpegbseboklubv.supabase.co wss://uaupykgpegbseboklubv.supabase.co; manifest-src 'self'; worker-src 'self'; media-src 'self'; upgrade-insecure-requests",
            ],
            [
              'Permissions-Policy',
              'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
            ],
          ].map(([key, value]) => ({ key, value })),
        },
      ],
    }),
  )
  return { root, normal, research, config }
}

test('accepts only exact digested research bytes and isolation headers', () => {
  const input = fixture()
  try {
    assert.doesNotThrow(() =>
      verifyOwnerResearchArtifacts(input.normal, input.research, input.config),
    )
    writeFileSync(join(input.research, 'research.js'), `${markers} mutated`)
    assert.throws(
      () => verifyOwnerResearchArtifacts(input.normal, input.research, input.config),
      /manifest or content digest/,
    )
  } finally {
    rmSync(input.root, { recursive: true, force: true })
  }
})

test('rejects a leaked normal fixture and every mutated controlling browser header', () => {
  const input = fixture()
  try {
    writeFileSync(join(input.normal, 'index.html'), 'existing-store-a')
    assert.throws(
      () => verifyOwnerResearchArtifacts(input.normal, input.research, input.config),
      /normal artifact contains research surface/i,
    )
    writeFileSync(join(input.normal, 'index.html'), 'normal')
    const original = JSON.parse(readFileSync(input.config, 'utf8'))
    for (const key of [
      'Content-Security-Policy',
      'Permissions-Policy',
      'Cross-Origin-Resource-Policy',
      'Vary',
    ]) {
      const config = JSON.parse(JSON.stringify(original))
      const header = config.headers[0].headers.find((candidate) => candidate.key === key)
      header.value = `${header.value} mutated`
      writeFileSync(input.config, JSON.stringify(config))
      assert.throws(
        () => verifyOwnerResearchArtifacts(input.normal, input.research, input.config),
        new RegExp(key),
      )
    }
  } finally {
    rmSync(input.root, { recursive: true, force: true })
  }
})

test('teardown verifies the idempotent purge receipt before deleting the deployment', () => {
  const source = readFileSync('scripts/owner-research-teardown.mjs', 'utf8')
  const purge = source.indexOf('/rpc/owner_research_teardown')
  const verification = source.indexOf('purge receipt verification failed')
  const deployment = source.indexOf('api.vercel.com')
  assert.ok(purge >= 0 && verification > purge && deployment > verification)
  assert.match(source, /deployment\.status !== 404/)
})

test('teardown executes the app_public purge before deletion and stops on an invalid receipt', () => {
  for (const invalidReceipt of [false, true]) {
    const result = spawnSync(process.execPath, ['--input-type=module'], {
      encoding: 'utf8',
      input: `
        import assert from 'node:assert/strict';
        Object.assign(process.env, {
          OWNER_RESEARCH_ARTIFACT_DIGEST: 'sha256:' + 'a'.repeat(64),
          OWNER_RESEARCH_RECEIPT_AT: '2026-09-03T00:00:00Z',
          OWNER_RESEARCH_DEPLOYMENT_ID: 'synthetic-deployment',
          VERCEL_TOKEN: 'synthetic', SUPABASE_URL: 'https://synthetic.invalid',
          SUPABASE_SERVICE_ROLE_KEY: 'synthetic'
        });
        const calls = [];
        globalThis.fetch = async (url, options) => {
          calls.push(url);
          if (calls.length === 1) {
            assert.equal(options.headers['Content-Profile'], 'app_public');
            assert.equal(options.method, 'POST');
            return { ok: true, json: async () => ({
              artifactDigest: process.env.OWNER_RESEARCH_ARTIFACT_DIGEST,
              deploymentId: ${JSON.stringify(invalidReceipt ? 'wrong-deployment' : 'synthetic-deployment')},
              receiptAt: process.env.OWNER_RESEARCH_RECEIPT_AT,
              revoked: true, receiptDigest: 'sha256:' + 'b'.repeat(64)
            }) };
          }
          assert.equal(options.method, 'DELETE');
          return { ok: false, status: 404 };
        };
        const execution = import('./scripts/owner-research-teardown.mjs');
        ${invalidReceipt ? 'await assert.rejects(execution, /receipt verification failed/);' : 'await execution;'}
        assert.equal(calls.length, ${invalidReceipt ? 1 : 2});
      `,
    })
    assert.equal(result.status, 0, result.stderr)
  }
})
