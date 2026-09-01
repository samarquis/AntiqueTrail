import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findLicenseFindings,
  findMigrationVersionFindings,
  findRetiredTierVocabularyFindings,
  findSecretFindings,
  findUnpinnedActions,
} from './security-contract.mjs'

test('detects credential material without flagging ordinary configuration names', () => {
  assert.deepEqual(
    findSecretFindings([{ path: 'safe.ts', text: 'const H01_TOKEN = process.env.X' }]),
    [],
  )
  assert.deepEqual(
    findSecretFindings([
      { path: 'leak.txt', text: `token=${'gh' + 'p_'}abcdefghijklmnopqrstuvwxyz123456` },
    ]),
    ['leak.txt: possible GitHub token'],
  )
})

test('allows the reviewed permissive license set and rejects missing or unknown terms', () => {
  assert.deepEqual(
    findLicenseFindings({ packages: { '': {}, 'node_modules/a': { license: 'MIT' } } }),
    [],
  )
  assert.deepEqual(
    findLicenseFindings({
      packages: {
        '': {},
        'node_modules/a': {},
        'node_modules/b': { license: 'GPL-3.0-only' },
      },
    }),
    ['node_modules/a: missing license metadata', 'node_modules/b: unapproved license GPL-3.0-only'],
  )
})

test('requires third-party workflow actions to use full immutable commits', () => {
  assert.deepEqual(
    findUnpinnedActions([
      {
        path: '.github/workflows/ci.yml',
        text: [
          '      - uses: actions/checkout@v4',
          '      - uses: owner/action@0123456789abcdef0123456789abcdef01234567',
          '      - uses: ./local-action',
        ].join('\n'),
      },
    ]),
    ['.github/workflows/ci.yml: actions/checkout@v4'],
  )
})

test('requires unique fourteen-digit migration versions', () => {
  assert.deepEqual(
    findMigrationVersionFindings([
      'supabase/migrations/20260803000000_first.sql',
      'supabase/migrations/20260803000000_second.sql',
      'supabase/migrations/bad.sql',
    ]),
    [
      'supabase/migrations/20260803000000_second.sql: duplicate migration version also used by supabase/migrations/20260803000000_first.sql',
      'supabase/migrations/bad.sql: migration filename must start with a 14-digit version',
    ],
  )
})

test('flags retired Featured/Unlimited vocabulary in live billing source', () => {
  const retire = (path) => `${path}: retired tier vocabulary featured|unlimited`
  assert.deepEqual(
    findRetiredTierVocabularyFindings([
      {
        path: 'supabase/functions/_shared/billing-provider.ts',
        text: 'priceFeatured?: string',
      },
    ]),
    [retire('supabase/functions/_shared/billing-provider.ts')],
  )
  assert.deepEqual(
    findRetiredTierVocabularyFindings([
      {
        path: 'supabase/functions/store-billing-webhook/index.ts',
        text: "priceUnlimited: Deno.env.get('STRIPE_PRICE_UNLIMITED')",
      },
    ]),
    [retire('supabase/functions/store-billing-webhook/index.ts')],
  )
  assert.deepEqual(
    findRetiredTierVocabularyFindings([
      { path: 'src/features/billing/types.ts', text: "tier: 'featured' | 'unlimited'" },
    ]),
    [retire('src/features/billing/types.ts')],
  )
})

test('allows documented exceptions and files outside live source', () => {
  assert.deepEqual(
    findRetiredTierVocabularyFindings([
      {
        path: 'src/features/catalog/StorePhotosPage.tsx',
        text: 'const featured = new Set<number>([0])',
      },
      {
        path: 'supabase/tests/0077_package_13_tier_boundaries.sql',
        text: "('00000000-0000-4000-8000-000000000003','featured')",
      },
      {
        path: 'supabase/migrations/20260831010000_migrate_photo_tiers_free_gallery_full_gallery.sql',
        text: "if p_tier = 'featured' then p_tier := 'gallery'; end if;",
      },
      { path: 'docs/evidence/issue-174/inventory.md', text: 'featured -> gallery' },
      { path: 'package.json', text: 'featured' },
    ]),
    [],
  )
})

test('accepts canonical Free/Gallery/Full Gallery vocabulary unchanged', () => {
  assert.deepEqual(
    findRetiredTierVocabularyFindings([
      { path: 'src/features/billing/types.ts', text: "tier: 'gallery' | 'full_gallery'" },
      {
        path: 'supabase/functions/store-billing-webhook/index.ts',
        text: "if (priceId && priceId === env.priceFullGallery) return 'full_gallery'",
      },
    ]),
    [],
  )
})
