import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findLicenseFindings,
  findMigrationVersionFindings,
  findSecretFindings,
  findUnpinnedActions,
} from './security-contract.mjs'

test('detects credential material without flagging ordinary configuration names', () => {
  assert.deepEqual(findSecretFindings([{ path: 'safe.ts', text: 'const H01_TOKEN = process.env.X' }]), [])
  assert.deepEqual(
    findSecretFindings([{ path: 'leak.txt', text: 'token=ghp_abcdefghijklmnopqrstuvwxyz123456' }]),
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
    [
      'node_modules/a: missing license metadata',
      'node_modules/b: unapproved license GPL-3.0-only',
    ],
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
