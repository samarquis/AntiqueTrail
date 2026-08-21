import { createHash } from 'node:crypto'
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SHA256 = /^[a-f0-9]{64}$/
const SOURCE_SHA = /^[a-f0-9]{40}$/
const REVIEW_ONLY_MARKERS = ['Synthetic Review Harness', 'review-shopper-a', 'reviewAs=']

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function inventory(root) {
  const files = []

  async function visit(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))

    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(directory, entry.name)
      const stats = await lstat(absolute)
      if (stats.isSymbolicLink()) throw new Error(`Symlinks are not release files: ${relative}`)
      if (stats.isDirectory()) {
        await visit(absolute, relative)
      } else if (stats.isFile()) {
        const contents = await readFile(absolute)
        files.push({ path: relative, size: stats.size, sha256: sha256(contents) })
      } else {
        throw new Error(`Unsupported release entry: ${relative}`)
      }
    }
  }

  await visit(root)
  if (files.length === 0) throw new Error('Release directory is empty')
  return files
}

const AUTH_ROUTES = ['/auth/callback*', '/auth/register*', '/auth/verify*', '/auth/recovery*']
const VERCEL_AUTH_ROUTES = [
  '/auth/callback/:path*',
  '/auth/register/:path*',
  '/auth/verify/:path*',
  '/auth/recovery/:path*',
]

function assertPagesAuthHeaders(headersText) {
  for (const route of AUTH_ROUTES) {
    const start = headersText.indexOf(route)
    const block =
      start < 0
        ? ''
        : headersText.slice(
            start,
            headersText.indexOf('\n\n', start) < 0 ? undefined : headersText.indexOf('\n\n', start),
          )
    if (
      !/Cache-Control:\s*private,\s*no-store/iu.test(block) ||
      !/Referrer-Policy:\s*no-referrer/iu.test(block)
    )
      throw new Error(`Production artifact lacks private no-store auth headers: ${route}`)
  }
}

function assertVercelAuthHeaders(config) {
  const entries = Array.isArray(config?.headers) ? config.headers : []
  for (const route of VERCEL_AUTH_ROUTES) {
    const block = entries.find((item) => item?.source === route)?.headers ?? []
    const value = (key) =>
      block.find((item) => typeof item?.key === 'string' && item.key.toLowerCase() === key)
        ?.value ?? ''
    if (
      !/private,\s*no-store/iu.test(value('cache-control')) ||
      !/^no-referrer$/iu.test(value('referrer-policy'))
    )
      throw new Error(`Production artifact lacks private no-store auth headers: ${route}`)
  }
}

export async function assertProductionArtifact(root, kind = 'pages') {
  const files = await inventory(root)
  for (const file of files) {
    const contents = await readFile(path.join(root, ...file.path.split('/')), 'utf8')
    const marker = REVIEW_ONLY_MARKERS.find((value) => contents.includes(value))
    if (marker) throw new Error(`Production artifact contains review-only marker: ${marker}`)
  }
  if (kind === 'vercel') {
    let config
    try {
      config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'))
    } catch {
      throw new Error('Vercel build output lacks a readable config.json')
    }
    assertVercelAuthHeaders(config)
    return
  }
  if (kind !== 'pages') throw new Error(`Unsupported artifact kind: ${kind}`)
  assertPagesAuthHeaders(await readFile(path.join(root, '_headers'), 'utf8').catch(() => ''))
}

function treeDigest(files) {
  return sha256(files.map((file) => `${file.sha256}  ${file.size}  ${file.path}\n`).join(''))
}

function requireValue(options, name, pattern) {
  const value = options[name]
  if (!value || (pattern && !pattern.test(value))) throw new Error(`Invalid or missing --${name}`)
  return value
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    if (!flag?.startsWith('--') || args[index + 1] === undefined) {
      throw new Error(`Expected --name value, received ${flag ?? '<nothing>'}`)
    }
    options[flag.slice(2)] = args[index + 1]
  }
  return options
}

export async function createRelease(options) {
  const dist = path.resolve(requireValue(options, 'dist'))
  const out = path.resolve(requireValue(options, 'out'))
  const sourceSha = requireValue(options, 'source-sha', SOURCE_SHA)
  const repository = requireValue(options, 'repository')
  const nodeVersion = requireValue(options, 'node-version')
  const npmVersion = requireValue(options, 'npm-version')
  const runnerOs = requireValue(options, 'runner-os')
  const runnerArch = requireValue(options, 'runner-arch')
  const lockfile = path.resolve(requireValue(options, 'lockfile'))
  const outStats = await lstat(out).catch(() => null)
  if (outStats) throw new Error(`Output already exists: ${out}`)
  const kind = options.kind ?? 'pages'

  await assertProductionArtifact(dist, kind)
  const files = await inventory(dist)
  const manifest = {
    schemaVersion: 1,
    artifactDigest: treeDigest(files),
    sourceSha,
    repository,
    buildEnvironment: {
      nodeVersion,
      npmVersion,
      runnerOs,
      runnerArch,
      runnerImage: 'ubuntu-latest',
    },
    lockfile: { path: path.basename(lockfile), sha256: sha256(await readFile(lockfile)) },
    files,
  }

  await mkdir(out, { recursive: false })
  await cp(dist, path.join(out, 'dist'), { recursive: true, errorOnExist: true })
  await writeFile(
    path.join(out, 'artifact-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

export async function verifyRelease(options) {
  const bundle = path.resolve(requireValue(options, 'bundle'))
  const expectedDigest = requireValue(options, 'expected-digest', SHA256)
  const expectedSourceSha = requireValue(options, 'expected-source-sha', SOURCE_SHA)
  const manifest = JSON.parse(await readFile(path.join(bundle, 'artifact-manifest.json'), 'utf8'))
  await assertProductionArtifact(path.join(bundle, 'dist'), options.kind ?? 'pages')
  const actualFiles = await inventory(path.join(bundle, 'dist'))
  const actualDigest = treeDigest(actualFiles)

  if (manifest.schemaVersion !== 1) throw new Error('Unsupported artifact manifest schema')
  if (manifest.artifactDigest !== expectedDigest || actualDigest !== expectedDigest) {
    throw new Error('Artifact digest does not match the expected digest')
  }
  if (manifest.sourceSha !== expectedSourceSha) throw new Error('Source SHA does not match')
  if (canonicalJson(manifest.files) !== canonicalJson(actualFiles)) {
    throw new Error('Artifact file inventory does not match its manifest')
  }
  return manifest
}

export async function createReceipt(options) {
  const bundle = path.resolve(requireValue(options, 'bundle'))
  const providerFile = path.resolve(requireValue(options, 'provider-file'))
  const out = path.resolve(requireValue(options, 'out'))
  const expectedDigest = requireValue(options, 'expected-digest', SHA256)
  const expectedSourceSha = requireValue(options, 'expected-source-sha', SOURCE_SHA)
  const manifest = await verifyRelease({
    bundle,
    kind: options.kind,
    'expected-digest': expectedDigest,
    'expected-source-sha': expectedSourceSha,
  })
  const provider = JSON.parse(await readFile(providerFile, 'utf8'))
  const requiredProviderFields = [
    'deploymentId',
    'deploymentUrl',
    'canonicalHostname',
    'projectName',
    'branch',
    'environment',
    'cliVersion',
    'mode',
    'reasonCode',
    'sourceRunId',
    'deployedAt',
    'deploymentAccessStatus',
    'canonicalAccessStatus',
  ]
  for (const field of requiredProviderFields) requireValue(provider, field)
  if (!['promotion', 'rollback'].includes(provider.mode)) throw new Error('Invalid deployment mode')

  const body = { schemaVersion: 1, artifact: manifest, deployment: provider }
  const receipt = { ...body, receiptDigest: sha256(canonicalJson(body)) }
  await writeFile(out, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
  return receipt
}

async function main() {
  const [command, ...args] = process.argv.slice(2)
  const options = parseOptions(args)
  let result
  if (command === 'create') result = await createRelease(options)
  else if (command === 'verify') result = await verifyRelease(options)
  else if (command === 'receipt') result = await createReceipt(options)
  else throw new Error('Usage: release-artifact.mjs create|verify|receipt --name value ...')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
