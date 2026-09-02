/* global console, process */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOWED_LICENSES = new Set([
  '(MIT OR CC0-1.0)',
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  // MPL-2.0 is file-level copyleft; accepted only for the dev-time axe-core
  // accessibility testing stack, never shipped to browsers from this repo.
  'MPL-2.0',
  'Python-2.0',
])

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

// Retired photo-tier vocabulary (featured/unlimited) must not return to live
// source. Immutable migrations and the 0077 compatibility boundary stay
// excluded because their legacy text is the tested conversion contract; the
// StorePhotosPage exception is a documented photo-tile layout Set, not tier
// vocabulary (gates/issue-174.md G1/G8).
const LIVE_SOURCE_PREFIXES = ['src/', 'supabase/functions/', 'e2e/']
const TIER_VOCABULARY_FILE_EXCEPTIONS = new Set(['src/features/catalog/StorePhotosPage.tsx'])
const RETIRED_TIER_VOCABULARY = /featured|unlimited/iu

export function findRetiredTierVocabularyFindings(entries) {
  const findings = []
  for (const { path, text } of entries) {
    if (!LIVE_SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix))) continue
    if (TIER_VOCABULARY_FILE_EXCEPTIONS.has(path)) continue
    if (RETIRED_TIER_VOCABULARY.test(text))
      findings.push(`${path}: retired tier vocabulary featured|unlimited`)
  }
  return findings
}

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/u],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u],
]

export function findSecretFindings(entries) {
  const findings = []
  for (const { path, text } of entries) {
    for (const [kind, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push(`${path}: possible ${kind}`)
    }
  }
  return findings
}

export function findLicenseFindings(lock) {
  const findings = []
  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    if (!path) continue
    const license = metadata.license
    if (typeof license !== 'string') findings.push(`${path}: missing license metadata`)
    else if (!ALLOWED_LICENSES.has(license)) findings.push(`${path}: unapproved license ${license}`)
  }
  return findings
}

export function findUnpinnedActions(entries) {
  const findings = []
  for (const { path, text } of entries) {
    for (const match of text.matchAll(/^\s*-?\s*uses:\s*([^@\s]+)@([^\s#]+)/gmu)) {
      const [, action, revision] = match
      if (action.startsWith('./')) continue
      if (!/^[0-9a-f]{40}$/u.test(revision)) findings.push(`${path}: ${action}@${revision}`)
    }
  }
  return findings
}

export function findMigrationVersionFindings(paths) {
  const versions = new Map()
  const findings = []
  for (const path of paths.filter((candidate) => candidate.startsWith('supabase/migrations/'))) {
    const match = path.match(/\/([0-9]{14})_[^/]+\.sql$/u)
    if (!match) {
      findings.push(`${path}: migration filename must start with a 14-digit version`)
      continue
    }
    const duplicate = versions.get(match[1])
    if (duplicate) findings.push(`${path}: duplicate migration version also used by ${duplicate}`)
    else versions.set(match[1], path)
  }
  return findings
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
}

function textEntries(paths) {
  return paths
    .filter((path) => TEXT_EXTENSIONS.has(extname(path)) && statSync(path).size <= 2_000_000)
    .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
}

export function runSecurityContract(paths = trackedFiles()) {
  const entries = textEntries(paths)
  return [
    ...findSecretFindings(entries),
    ...findLicenseFindings(JSON.parse(readFileSync('package-lock.json', 'utf8'))),
    ...findUnpinnedActions(entries.filter(({ path }) => path.startsWith('.github/workflows/'))),
    ...findMigrationVersionFindings(paths),
    ...findRetiredTierVocabularyFindings(entries),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = runSecurityContract()
  if (findings.length > 0) {
    console.error(findings.join('\n'))
    process.exitCode = 1
  } else {
    console.log(
      'Security contract checks passed: secrets, licenses, action pins, migrations, tier vocabulary.',
    )
  }
}
