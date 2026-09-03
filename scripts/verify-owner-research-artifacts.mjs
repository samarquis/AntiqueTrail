/* global console */
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

function text(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((path) => ['.html', '.js', '.json'].includes(extname(path)))
    .map((path) => readFileSync(join(directory, path), 'utf8'))
    .join('\n')
}

const normal = text('dist')
const research = text('dist-owner-research')
const manifest = JSON.parse(
  readFileSync('dist-owner-research/owner-research-manifest.json', 'utf8'),
)

for (const marker of [
  'owner_research_command',
  'Private research artifact',
  'existing-store-a',
  'topeka-owner-10a',
]) {
  if (normal.includes(marker))
    throw new Error(`Normal artifact contains research marker: ${marker}`)
  if (!research.includes(marker)) throw new Error(`Research artifact lacks marker: ${marker}`)
}
if (!research.includes('noindex, nofollow, noarchive'))
  throw new Error('Research artifact is missing the noindex contract.')
if (
  manifest.kind !== 'antique-trail-owner-research' ||
  manifest.audience !== 'synthetic' ||
  manifest.deploymentProtection !== 'required' ||
  !/^sha256:[0-9a-f]{64}$/.test(manifest.artifactBinding)
)
  throw new Error('Research artifact manifest is invalid.')

console.log('Owner research artifact isolation checks passed.')
