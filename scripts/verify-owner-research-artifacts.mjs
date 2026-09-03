/* global console, process */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const requiredHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Authorization, Cookie',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.supabase.co; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
}

function artifactFiles(directory) {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((path) => path !== 'owner-research-manifest.json')
    .filter((path) => statSync(join(directory, path)).isFile())
    .sort()
}

function fileHashes(directory) {
  return Object.fromEntries(
    artifactFiles(directory).map((path) => [
      path.replaceAll('\\', '/'),
      createHash('sha256')
        .update(readFileSync(join(directory, path)))
        .digest('hex'),
    ]),
  )
}

function contentDigest(hashes) {
  const canonical = Object.entries(hashes)
    .map(([path, hash]) => `${hash}  ${path}`)
    .join('\n')
  return `sha256:${createHash('sha256').update(`${canonical}\n`).digest('hex')}`
}

function searchableText(directory) {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((path) => statSync(join(directory, path)).isFile())
    .filter((path) => ['.html', '.js', '.json'].includes(extname(path)))
    .map((path) => readFileSync(join(directory, path), 'utf8'))
    .join('\n')
}

export function verifyOwnerResearchArtifacts(
  normalDirectory = 'dist',
  researchDirectory = 'dist-owner-research',
  configPath = 'vercel.owner-research.json',
) {
  const normal = searchableText(normalDirectory)
  const research = searchableText(researchDirectory)
  const manifest = JSON.parse(
    readFileSync(join(researchDirectory, 'owner-research-manifest.json'), 'utf8'),
  )
  const hashes = fileHashes(researchDirectory)
  if (
    manifest.kind !== 'antique-trail-owner-research' ||
    manifest.audience !== 'synthetic' ||
    manifest.route !== '/for-stores' ||
    manifest.indexing !== 'noindex' ||
    manifest.deploymentProtection !== 'required' ||
    JSON.stringify(manifest.files) !== JSON.stringify(hashes) ||
    manifest.contentDigest !== contentDigest(hashes)
  )
    throw new Error('Research artifact manifest or content digest is invalid.')

  for (const marker of [
    'owner_research_command',
    'Private research artifact',
    'existing-store-a',
    'new-store-a',
    'topeka-owner-10a',
    'Verify your private invitation',
  ]) {
    if (normal.includes(marker))
      throw new Error(`Normal artifact contains research surface: ${marker}`)
    if (!research.includes(marker)) throw new Error(`Research artifact lacks marker: ${marker}`)
  }
  if (!research.includes('noindex, nofollow, noarchive'))
    throw new Error('Research artifact is missing the noindex contract.')

  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  if (
    config.git?.deploymentEnabled !== false ||
    !config.rewrites?.some(
      (rewrite) =>
        rewrite.source === '/for-stores' && rewrite.destination === '/owner-research.html',
    )
  )
    throw new Error('Research deployment isolation is invalid.')
  const headers = Object.fromEntries(
    (config.headers?.find((entry) => entry.source === '/(.*)')?.headers ?? []).map((header) => [
      header.key,
      header.value,
    ]),
  )
  for (const [key, value] of Object.entries(requiredHeaders))
    if (headers[key] !== value) throw new Error(`Research deployment header is invalid: ${key}`)

  return manifest
}

if (process.argv[1]?.endsWith('verify-owner-research-artifacts.mjs')) {
  const manifest = verifyOwnerResearchArtifacts()
  console.log(`Owner research artifact isolation checks passed: ${manifest.contentDigest}`)
}
