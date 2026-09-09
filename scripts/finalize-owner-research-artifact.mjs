/* global console */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const directory = 'dist-owner-research'
const files = readdirSync(directory, { recursive: true })
  .map(String)
  .filter((path) => path !== 'owner-research-manifest.json')
  .filter((path) => statSync(join(directory, path)).isFile())
  .sort()
const hashes = Object.fromEntries(
  files.map((path) => [
    path.replaceAll('\\', '/'),
    createHash('sha256')
      .update(readFileSync(join(directory, path)))
      .digest('hex'),
  ]),
)
const canonical = Object.entries(hashes)
  .map(([path, hash]) => `${hash}  ${path}`)
  .join('\n')
const contentDigest = `sha256:${createHash('sha256').update(`${canonical}\n`).digest('hex')}`
const manifest = {
  kind: 'antique-trail-owner-research',
  audience: 'synthetic',
  route: '/for-stores',
  indexing: 'noindex',
  deploymentProtection: 'required',
  contentDigest,
  files: hashes,
}
writeFileSync(
  join(directory, 'owner-research-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(`Owner research content digest: ${contentDigest}`)
