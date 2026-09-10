/* globals console, process */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BLUE_FINCH_EXTRA_FILES,
  COVER_EXTRAS,
  DESIGNATED_SLUGS,
  EVALUATION_RECORDS_PER_STORE,
  FIXTURE_SCHEMA_VERSION,
  FIXTURE_SEED,
  RIGHTS_LABEL,
  coverFile,
  galleryRecordCount,
} from './fixture-wall-constants.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PRIVATE_CANARY =
  /object[_ -]?key|signed[_ -]?url|private[_ -]?key|token=|signature=|expires=|x-amz-|reviewer|moderation|provider response/iu

export function verifyFixtureMedia(reportRoot = root) {
  const errors = []
  const fixturesRoot = path.join(reportRoot, 'public', 'images', 'synthetic-fixtures')
  const catalogPath = path.join(reportRoot, 'src', 'features', 'catalog', 'fixtureMedia.json')
  const provenancePath = path.join(
    reportRoot,
    'docs',
    'evidence',
    'fixture-eval',
    'provenance.json',
  )
  let catalog
  let provenance
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  } catch {
    errors.push('Missing or invalid fixtureMedia.json')
    return { errors, fileDigest: null }
  }
  try {
    provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
  } catch {
    errors.push('Missing or invalid fixture-eval/provenance.json')
  }
  if (catalog.schemaVersion !== FIXTURE_SCHEMA_VERSION)
    errors.push(`schemaVersion mismatch: ${catalog.schemaVersion} !== ${FIXTURE_SCHEMA_VERSION}`)
  if (catalog.seed !== FIXTURE_SEED) errors.push(`seed mismatch`)
  if (!Array.isArray(catalog.records)) errors.push('records must be an array')
  const bySlug = new Map()
  for (const record of catalog.records ?? []) {
    if (!bySlug.has(record.slug)) bySlug.set(record.slug, [])
    bySlug.get(record.slug).push(record)
  }
  for (const slug of DESIGNATED_SLUGS) {
    const expectedCount = galleryRecordCount(slug)
    const records = bySlug.get(slug) ?? []
    if (records.length !== expectedCount)
      errors.push(`gallery count mismatch for ${slug}: ${records.length} !== ${expectedCount}`)
    for (const record of records) {
      if (record.slug !== slug) errors.push(`record slug mismatch: ${record.slug}`)
      if (!record.file) errors.push(`missing file in record for ${slug}`)
      const filePath = path.join(fixturesRoot, slug, record.file ?? '')
      if (!fs.existsSync(filePath)) {
        errors.push(`missing asset: ${filePath}`)
        continue
      }
      const content = fs.readFileSync(filePath, 'utf8')
      if (!content.startsWith('<?xml')) errors.push(`svg missing xml declaration: ${filePath}`)
      if (!content.includes('width="1280"') || !content.includes('height="960"'))
        errors.push(`svg missing expected dimensions: ${filePath}`)
      if (PRIVATE_CANARY.test(content)) errors.push(`private content leak: ${filePath}`)
      if (record.width !== 1280 || record.height !== 960)
        errors.push(`record dimensions mismatch: ${filePath}`)
      if (!record.alt || record.alt.length < 40) errors.push(`alt too short: ${filePath}`)
      if (!record.caption) errors.push(`missing caption: ${filePath}`)
      if (!record.caption?.includes(`${EVALUATION_RECORDS_PER_STORE}`))
        errors.push(`caption missing photo total: ${filePath}`)
      if (record.rightsLabel !== RIGHTS_LABEL) errors.push(`rightsLabel mismatch: ${filePath}`)
      if (!record.k || record.k < 2 || record.k > EVALUATION_RECORDS_PER_STORE)
        errors.push(`k out of range: ${filePath}`)
    }
    const alts = (records ?? []).map((record) => record.alt)
    const captions = (records ?? []).map((record) => record.caption)
    const srcs = (records ?? []).map((record) => `${record.slug}/${record.file}`)
    if (new Set(alts).size !== alts.length) errors.push(`duplicate alt in ${slug}`)
    if (new Set(captions).size !== captions.length) errors.push(`duplicate caption in ${slug}`)
    if (new Set(srcs).size !== srcs.length) errors.push(`duplicate src in ${slug}`)
    const coverPath = path.join(
      reportRoot,
      'public',
      'images',
      'synthetic-stores',
      '1280w',
      coverFile(slug),
    )
    if (!fs.existsSync(coverPath)) errors.push(`missing cover asset for ${slug}`)
    const extraFiles = slug === 'blue-finch-curios' ? BLUE_FINCH_EXTRA_FILES : []
    for (const file of extraFiles) {
      const filePath = path.join(reportRoot, 'public', 'images', 'synthetic-stores', '1280w', file)
      if (!fs.existsSync(filePath)) errors.push(`missing extra asset: ${filePath}`)
    }
  }
  const totalMediaPerStore = Object.fromEntries(
    DESIGNATED_SLUGS.map((slug) => [
      slug,
      1 + (COVER_EXTRAS[slug] ?? 0) + galleryRecordCount(slug),
    ]),
  )
  for (const [slug, count] of Object.entries(totalMediaPerStore)) {
    if (count !== EVALUATION_RECORDS_PER_STORE)
      errors.push(
        `total media count for ${slug} is ${count}, expected ${EVALUATION_RECORDS_PER_STORE}`,
      )
  }
  const relativeAssets = (catalog.records ?? [])
    .map((record) => `images/synthetic-fixtures/${record.slug}/${record.file}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  const fileDigest = crypto.createHash('sha256').update(relativeAssets.join('\n')).digest('hex')
  if (provenance?.fileInventoryDigest && provenance.fileInventoryDigest !== fileDigest)
    errors.push(`provenance digest mismatch: ${provenance.fileInventoryDigest} !== ${fileDigest}`)
  return { errors, fileDigest }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyFixtureMedia()
  console.log(JSON.stringify({ errors: result.errors, fileDigest: result.fileDigest }, null, 2))
  if (result.errors.length) process.exitCode = 1
}
