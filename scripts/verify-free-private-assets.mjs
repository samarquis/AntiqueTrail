#!/usr/bin/env node
/* global Buffer, console, process */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function readRasterDimensions(filePath) {
  const bytes = fs.readFileSync(filePath)
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    const chunk = bytes.subarray(12, 16).toString()
    if (chunk === 'VP8X')
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      }
    if (chunk === 'VP8 ')
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }
  return null
}

export function verifyManifest(
  root,
  manifestPath = path.join(root, 'docs/evidence/free-private-assets/provenance.json'),
) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const errors = []
  const unknownRights = []
  for (const asset of manifest.assets ?? []) {
    const filePath = path.join(root, asset.path)
    if (!fs.existsSync(filePath)) {
      errors.push('missing asset: ' + asset.path)
      continue
    }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
    if (actualHash !== asset.sha256) errors.push('hash mismatch: ' + asset.path)
    if (!fs.existsSync(path.join(root, asset.source)))
      errors.push('missing source evidence: ' + asset.source + ' (for ' + asset.path + ')')
    if (asset.derivativeParent && !fs.existsSync(path.join(root, asset.derivativeParent)))
      errors.push(
        'missing derivative parent: ' + asset.derivativeParent + ' (for ' + asset.path + ')',
      )
    if (asset.dimensions) {
      const dimensions = readRasterDimensions(filePath)
      const actual = dimensions ? dimensions.width + 'x' + dimensions.height : null
      if (actual !== asset.dimensions)
        errors.push(
          'dimension mismatch: ' +
            asset.path +
            ' expected ' +
            asset.dimensions +
            ', got ' +
            (actual ?? 'unreadable'),
        )
    }
    if (asset.rightsStatus === 'unknown') unknownRights.push(asset.path)
    if (asset.syntheticRestriction && !asset.syntheticRestriction.includes('Internal Alpha'))
      errors.push('synthetic restriction mismatch: ' + asset.path)
    if (asset.path.includes('/synthetic-stores/') && !asset.syntheticRestriction)
      errors.push('missing synthetic restriction: ' + asset.path)
  }
  return { errors, unknownRights }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'docs/evidence/free-private-assets/provenance.json'), 'utf8'),
  )
  const result = verifyManifest(root)
  console.log(
    JSON.stringify(
      {
        checked: manifest.assets.length,
        errors: result.errors,
        unknownRights: result.unknownRights.length,
      },
      null,
      2,
    ),
  )
  if (result.errors.length) process.exitCode = 1
}
