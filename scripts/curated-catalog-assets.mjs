import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const HASH = /^[a-f0-9]{64}$/
const ROOT_KEYS = [
  'schemaVersion',
  'storeSlug',
  'galleryWallSha256',
  'sourceRightsManifestSha256',
  'assets',
]
const ASSET_KEYS = [
  'kind',
  'order',
  'sha256',
  'bytes',
  'width',
  'height',
  'chunks',
  'path',
  'alt',
  'caption',
  'rightsLabel',
  'sourcePhotoId',
]
const FLAGS = ['curated-scope', 'curated-manifest', 'curated-input', 'curated-manifest-sha256']
const WITHDRAWAL_FLAG = 'curated-withdrawn-sha256'
const PREFIX = '/curated/macvicar/v1/'
const MAX_BYTES = 8 * 1024 * 1024
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (message) => {
  throw new Error(message)
}

function exactKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    fail('Invalid curated metadata keys')
}

function plainText(value, maximum) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maximum &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character === '<' || character === '>',
    ) &&
    !/[a-z]:[\\/]|[\\/](?:users|home|quarantine|private)[\\/]/i.test(value)
  )
}

export function validateCuratedAssets(assets) {
  if (!Array.isArray(assets) || assets.length !== 51)
    fail('Curated selection must contain exactly 51 assets')
  const hashes = new Set(),
    sources = new Set()
  let total = 0
  for (const [index, asset] of assets.entries()) {
    exactKeys(asset, ASSET_KEYS)
    if (asset.order !== index || asset.kind !== (index === 0 ? 'cover' : 'gallery'))
      fail('Invalid curated cover/gallery order')
    if (
      typeof asset.sha256 !== 'string' ||
      !HASH.test(asset.sha256) ||
      hashes.has(asset.sha256) ||
      typeof asset.sourcePhotoId !== 'string' ||
      !/^[1-9][0-9]{0,31}$/.test(asset.sourcePhotoId) ||
      sources.has(asset.sourcePhotoId)
    )
      fail('Invalid or duplicate curated identity')
    if (
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 30 ||
      asset.bytes > MAX_BYTES ||
      ![asset.width, asset.height].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 4096,
      )
    )
      fail('Invalid curated byte or dimension bounds')
    if (
      asset.path !== `${PREFIX}${asset.sha256}.webp` ||
      !Array.isArray(asset.chunks) ||
      asset.chunks.length !== 1 ||
      asset.chunks[0] !== 'VP8'
    )
      fail('Invalid curated output path or image chunks')
    if (
      !plainText(asset.alt, 512) ||
      !plainText(asset.caption, 1024) ||
      asset.rightsLabel !== 'Store owner-authorized photo'
    )
      fail('Invalid curated public text')
    hashes.add(asset.sha256)
    sources.add(asset.sourcePhotoId)
    total += asset.bytes
  }
  if (total > 64 * 1024 * 1024) fail('Curated selection exceeds byte limit')
  return assets
}

export function validateCuratedManifest(manifest) {
  exactKeys(manifest, ROOT_KEYS)
  if (
    manifest.schemaVersion !== 1 ||
    manifest.storeSlug !== 'the-market-at-macvicar' ||
    ![manifest.galleryWallSha256, manifest.sourceRightsManifestSha256].every(
      (value) => typeof value === 'string' && HASH.test(value),
    )
  )
    fail('Invalid curated manifest identity')
  validateCuratedAssets(manifest.assets)
  return manifest
}

// Fixed approved derivatives are simple still-image VP8 WebP, with no metadata chunks.
export function inspectCuratedWebP(bytes) {
  if (
    bytes.length < 30 ||
    bytes.length > MAX_BYTES ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  )
    fail('Invalid curated RIFF image size')
  if (bytes.toString('ascii', 12, 16) !== 'VP8 ')
    fail('Curated image contains unapproved metadata or animation')
  const size = bytes.readUInt32LE(16)
  if (size < 10 || 20 + size + (size % 2) !== bytes.length || (size % 2 && bytes.at(-1) !== 0))
    fail('Invalid curated WebP chunk bounds')
  const frame = bytes.subarray(20, 20 + size)
  const tag = frame.readUIntLE(0, 3)
  if (
    (tag & 1) !== 0 ||
    (tag & 16) === 0 ||
    tag >> 5 > size - 10 ||
    frame.toString('hex', 3, 6) !== '9d012a'
  )
    fail('Invalid curated VP8 frame')
  const width = frame.readUInt16LE(6) & 0x3fff,
    height = frame.readUInt16LE(8) & 0x3fff
  if (width < 1 || height < 1 || width > 4096 || height > 4096)
    fail('Invalid curated image dimensions')
  return { width, height, chunks: ['VP8'] }
}

function sameFile(before, after) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every((key) => before[key] === after[key])
}

async function regularDirectory(directory) {
  const stats = await lstat(directory)
  const resolved = await realpath(directory)
  const normalize = (value) => (process.platform === 'win32' ? value.toLowerCase() : value)
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    normalize(resolved) !== normalize(path.resolve(directory))
  )
    fail('Curated directory must not contain symlinks')
}

async function readStable(filename, maximum) {
  const before = await lstat(filename, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maximum))
    fail('Curated input must be a bounded regular file')
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (!sameFile(before, await handle.stat({ bigint: true })))
      fail('Curated input changed during read')
    const bytes = await handle.readFile()
    if (
      bytes.length > maximum ||
      !sameFile(before, await handle.stat({ bigint: true })) ||
      !sameFile(before, await lstat(filename, { bigint: true }))
    )
      fail('Curated input changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

function curatedRoot(root, kind) {
  return path.join(root, kind === 'vercel' ? 'static' : '', 'curated')
}

function validateWithdrawnSha256(values, assets) {
  const approved = new Set(assets.map((asset) => asset.sha256))
  if (
    !Array.isArray(values) ||
    values.length > 51 ||
    new Set(values).size !== values.length ||
    values.some(
      (value) => typeof value !== 'string' || !HASH.test(value) || !approved.has(value),
    ) ||
    values.some((value, index) => index > 0 && value < values[index - 1])
  )
    fail('Invalid curated withdrawal set')
  return values
}

function parseWithdrawnSha256(value, assets) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') fail('Invalid curated withdrawal option')
  return validateWithdrawnSha256(value === '' ? [] : value.split(',').sort(), assets)
}

export async function importCuratedCatalog(options, outputRoot, kind) {
  const supplied = Object.keys(options).filter((flag) => flag.startsWith('curated-'))
  const existing = await lstat(curatedRoot(outputRoot, kind)).catch((error) =>
    error.code === 'ENOENT' ? null : Promise.reject(error),
  )
  if (existing) fail('Unexpected curated output before import')
  if (supplied.length === 0) return undefined
  if (
    supplied.some((flag) => !FLAGS.includes(flag) && flag !== WITHDRAWAL_FLAG) ||
    FLAGS.some((flag) => typeof options[flag] !== 'string' || !options[flag]) ||
    options['curated-scope'] !== 'macvicar' ||
    !HASH.test(options['curated-manifest-sha256'])
  )
    fail('Complete valid curated option group required')
  try {
    const manifestBytes = await readStable(path.resolve(options['curated-manifest']), 256 * 1024)
    if (digest(manifestBytes) !== options['curated-manifest-sha256'])
      fail('Curated manifest digest does not match')
    let manifest
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'))
    } catch {
      fail('Invalid curated manifest JSON')
    }
    validateCuratedManifest(manifest)
    const withdrawnSha256 = parseWithdrawnSha256(options[WITHDRAWAL_FLAG], manifest.assets) ?? []
    const withdrawn = new Set(withdrawnSha256)
    const input = path.resolve(options['curated-input'])
    await regularDirectory(input)
    const entries = await readdir(input, { withFileTypes: true })
    const leaves = new Set(manifest.assets.map((asset) => `${asset.sourcePhotoId}.webp`))
    if (
      entries.length !== 51 ||
      entries.some((entry) => !entry.isFile() || !leaves.has(entry.name))
    )
      fail('Missing, extra or nonregular curated input')
    const selected = []
    for (const asset of manifest.assets) {
      const bytes = await readStable(path.join(input, `${asset.sourcePhotoId}.webp`), MAX_BYTES)
      const image = inspectCuratedWebP(bytes)
      if (
        bytes.length !== asset.bytes ||
        digest(bytes) !== asset.sha256 ||
        image.width !== asset.width ||
        image.height !== asset.height
      )
        fail('Curated asset hash, size or dimensions do not match')
      if (!withdrawn.has(asset.sha256)) selected.push({ asset, bytes })
    }
    await regularDirectory(outputRoot)
    if (kind === 'vercel') await regularDirectory(path.join(outputRoot, 'static'))
    const destination = path.join(curatedRoot(outputRoot, kind), 'macvicar', 'v1')
    await mkdir(destination, { recursive: true })
    for (const { asset, bytes } of selected)
      await writeFile(path.join(destination, `${asset.sha256}.webp`), bytes, { flag: 'wx' })
    return {
      storeSlug: manifest.storeSlug,
      manifestSha256: options['curated-manifest-sha256'],
      assets: manifest.assets,
      ...(withdrawnSha256.length ? { withdrawnSha256 } : {}),
    }
  } catch (error) {
    if (/^(?:Invalid|Curated|Missing|Complete|Unexpected)/.test(error.message)) throw error
    fail('Curated input read or output write failed')
  }
}

export function verifyCuratedCatalog(
  files,
  kind,
  binding,
  expectedManifestSha256,
  expectedWithdrawnSha256,
) {
  const curatedFiles = files.filter((file) => /^(?:static\/)?curated\//.test(file.path))
  if (!binding) {
    if (
      curatedFiles.length ||
      expectedManifestSha256 !== undefined ||
      expectedWithdrawnSha256 !== undefined
    )
      fail('Missing curated admission metadata; unsafe withdrawal rollback')
    return
  }
  if (typeof expectedManifestSha256 !== 'string' || !HASH.test(expectedManifestSha256))
    fail('Missing or invalid expected curated manifest digest')
  exactKeys(binding, [
    'storeSlug',
    'manifestSha256',
    'assets',
    ...(Object.hasOwn(binding, 'withdrawnSha256') ? ['withdrawnSha256'] : []),
  ])
  if (
    binding.storeSlug !== 'the-market-at-macvicar' ||
    binding.manifestSha256 !== expectedManifestSha256
  )
    fail('Curated manifest digest does not match expected admission')
  validateCuratedAssets(binding.assets)
  const withdrawnSha256 = validateWithdrawnSha256(
    Object.hasOwn(binding, 'withdrawnSha256') ? binding.withdrawnSha256 : [],
    binding.assets,
  )
  const expectedWithdrawn = parseWithdrawnSha256(expectedWithdrawnSha256, binding.assets)
  if (withdrawnSha256.length && expectedWithdrawn === undefined)
    fail('Missing expected curated withdrawal set')
  if (
    expectedWithdrawn !== undefined &&
    (expectedWithdrawn.length !== withdrawnSha256.length ||
      expectedWithdrawn.some((value, index) => value !== withdrawnSha256[index]))
  )
    fail('Curated withdrawal set does not match current admission')
  const withdrawn = new Set(withdrawnSha256)
  const selected = new Map(
    binding.assets
      .filter((asset) => !withdrawn.has(asset.sha256))
      .map((asset) => [
        `${kind === 'vercel' ? 'static' : ''}${asset.path}`.replace(/^\//, ''),
        asset,
      ]),
  )
  if (
    curatedFiles.length !== selected.size ||
    curatedFiles.some((file) => {
      const asset = selected.get(file.path)
      return !asset || asset.sha256 !== file.sha256 || asset.bytes !== file.size
    })
  )
    fail('Curated output coverage does not match approved selection')
}
