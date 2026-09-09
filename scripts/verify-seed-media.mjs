#!/usr/bin/env node
/* global console, process */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Collect paths before validating them so malformed namespaces/extensions cannot
// disappear from the inventory while other valid entries keep the check green.
const SEED_MEDIA_PATH = /'((?:\/)[^']*)'/g

export function seededMediaPaths(seedSql) {
  return [...new Set([...seedSql.matchAll(SEED_MEDIA_PATH)].map((match) => match[1]))]
}

export function verifySeedMedia(root, builtRoot) {
  const errors = []
  const seed = fs.readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8')
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/evidence/free-private-assets/provenance.json'), 'utf8'),
  )
  const paths = seededMediaPaths(seed)
  if (!paths.length) errors.push('seed has no maintained synthetic media paths')
  for (const assetPath of paths) {
    const publicPath = `public${assetPath}`
    const asset = manifest.assets?.find((item) => item.path === publicPath)
    if (!asset) errors.push(`seed media lacks provenance: ${assetPath}`)
    else if (asset.rightsStatus !== 'declared_internal_synthetic')
      errors.push(`seed media lacks internal synthetic provenance: ${assetPath}`)
    else if (!asset.syntheticRestriction?.includes('Internal Alpha'))
      errors.push(`seed media has invalid synthetic restriction: ${assetPath}`)
    if (!fs.existsSync(path.join(builtRoot, assetPath.slice(1))))
      errors.push(`seed media missing from built static inventory: ${assetPath}`)
  }
  return { paths, errors }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = process.argv.indexOf('--built-root')
  const builtRoot = option === -1 ? null : process.argv[option + 1]
  if (!builtRoot)
    throw new Error('Usage: node scripts/verify-seed-media.mjs --built-root <directory>')
  const result = verifySeedMedia(process.cwd(), path.resolve(builtRoot))
  console.log(JSON.stringify(result, null, 2))
  if (result.errors.length) process.exitCode = 1
}
