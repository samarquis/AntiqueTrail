/* global process, Buffer, URL, fetch, AbortSignal, setTimeout, clearTimeout */
import { dockerLoopbackProxy } from './configured-shopper-docker.mjs'
import { registrationEnvironment } from './local-signup-contract.mjs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CLI_VERSION = '2.115.0'
const readinessFailureMetadata = new WeakMap()
const readinessRequestMetadata = new WeakMap()
const commandFailureMetadata = new WeakMap()
const startupFailureMetadata = new WeakMap()
const startupSteps = new Set([
  'unknown',
  'source-copy',
  'port-config',
  'source-identity',
  'docker-proxy',
  'docker-network',
  'cli-resolution',
  'supabase-start',
  'container-verification',
  'supabase-status',
  'status-parse',
  'credential-check',
  'gateway-setup',
  'fixture-setup',
  'auth-health',
  'actor-create',
  'actor-profile',
  'actor-token',
  'actor-session',
  'edge-spawn',
  'edge-readiness',
  'complete',
])
const startupFailureCategories = new Set([
  'command_exit',
  'command_spawn',
  'command_timeout',
  'command_signal',
  'aborted',
  'fetchFailure',
  'responseParseFailure',
  'httpFailure',
  'invalidResponse',
  'readiness_exhausted',
  'identity_mismatch',
  'unknown',
])
const readinessFailureCategories = new Set([
  'fetchFailure',
  'responseParseFailure',
  'httpFailure',
  'invalidResponse',
  'readiness_exhausted',
])
const readinessSafeErrorCodes = new Set([
  'ALPHA_AUTH_REQUIRED',
  'CATALOG_UNAVAILABLE',
  'GATEWAY_UNAVAILABLE',
  'INVALID_OPERATION',
  'INVALID_REQUEST',
  'MAP_UNAVAILABLE',
  'RATE_LIMITED',
  'BOOT_ERROR',
  'WORKER_ERROR',
  'WORKER_LIMIT',
])
const readinessTransportCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
])

export function getReadinessFailureMetadata(error) {
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return null
  const metadata = readinessFailureMetadata.get(error)
  if (!metadata || !readinessFailureCategories.has(metadata.category)) return null
  return {
    category: metadata.category,
    status: isReadinessHttpStatus(metadata.status) ? metadata.status : null,
  }
}

function tagReadinessFailure(error, category, status, { safeErrorCode, transportCode } = {}) {
  if (error !== null && (typeof error === 'object' || typeof error === 'function'))
    readinessFailureMetadata.set(error, {
      category,
      status: isReadinessHttpStatus(status) ? status : null,
      safeErrorCode: readinessSafeErrorCodes.has(safeErrorCode) ? safeErrorCode : null,
      transportCode: readinessTransportCodes.has(transportCode) ? transportCode : null,
    })
}

export function runAtLocalStartupStep(run, step, operation) {
  run.startupStep = startupSteps.has(step) ? step : 'unknown'
  return operation()
}

export function tagLocalStartupFailure(error, category) {
  if (
    error !== null &&
    (typeof error === 'object' || typeof error === 'function') &&
    startupFailureCategories.has(category)
  )
    startupFailureMetadata.set(error, category)
}

export function captureLocalStartupFailure(run, error) {
  const objectLike = error !== null && (typeof error === 'object' || typeof error === 'function')
  const explicitCategory = objectLike ? startupFailureMetadata.get(error) : undefined
  const command = objectLike ? commandFailureMetadata.get(error) : undefined
  const readiness = objectLike ? readinessFailureMetadata.get(error) : undefined
  const candidate = explicitCategory ?? command?.category ?? readiness?.category
  const category = startupFailureCategories.has(candidate) ? candidate : 'unknown'
  const commandExitCode =
    category === 'command_exit' &&
    Number.isInteger(command?.commandExitCode) &&
    command.commandExitCode >= 1 &&
    command.commandExitCode <= 255
      ? command.commandExitCode
      : null
  return {
    step: startupSteps.has(run?.startupStep) ? run.startupStep : 'unknown',
    category,
    httpStatus: isReadinessHttpStatus(readiness?.status) ? readiness.status : null,
    safeErrorCode: readinessSafeErrorCodes.has(readiness?.safeErrorCode)
      ? readiness.safeErrorCode
      : null,
    transportCode: readinessTransportCodes.has(readiness?.transportCode)
      ? readiness.transportCode
      : null,
    commandExitCode,
  }
}

function responseErrorCode(data) {
  try {
    const nested = data?.error?.code
    const value = nested === undefined ? data?.code : nested
    return typeof value === 'string' && readinessSafeErrorCodes.has(value) ? value : null
  } catch {
    return null
  }
}

function fetchTransportCode(error) {
  try {
    const nested = error?.cause?.code
    const value = nested === undefined ? error?.code : nested
    return typeof value === 'string' && readinessTransportCodes.has(value) ? value : null
  } catch {
    return null
  }
}

function servingProcessEvidence(readServingProcessState) {
  try {
    const state = readServingProcessState()
    if (!state || typeof state !== 'object' || Array.isArray(state))
      return { servingState: 'unavailable', servingExitCode: null }
    const pid = state.pid
    const exitCode = state.exitCode
    const signalCode = state.signalCode
    if (!Number.isSafeInteger(pid) || pid <= 0)
      return { servingState: 'unavailable', servingExitCode: null }
    if (Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255)
      return { servingState: 'exited', servingExitCode: exitCode }
    if (typeof signalCode === 'string' && signalCode.length > 0)
      return { servingState: 'signaled', servingExitCode: null }
    if (exitCode === null && signalCode === null)
      return { servingState: 'running', servingExitCode: null }
  } catch {
    /* A diagnostic snapshot must never replace the readiness failure. */
  }
  return { servingState: 'unavailable', servingExitCode: null }
}

function isReadinessHttpStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599
}

export function localServiceExclusions(disableStorage = false) {
  if (typeof disableStorage !== 'boolean') throw new Error('Invalid local service options')
  return `studio,postgres-meta,realtime,imgproxy,logflare,vector,supavisor${disableStorage ? ',storage-api' : ''}`
}
export function localProjectConfig(source, ports, { signupJourney = false } = {}) {
  const values = [
    ports.api,
    ports.db,
    ports.shadow,
    ports.mail,
    ports.smtp,
    ports.pop3,
    ports.inspector,
  ]
  if (
    typeof signupJourney !== 'boolean' ||
    !/^probe-[a-f0-9]{24}$/.test(ports.projectId) ||
    !/^http:\/\/127\.0\.0\.1:\d+$/.test(ports.origin) ||
    values.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
    new Set(values).size !== values.length ||
    values.includes(Number(new URL(ports.origin).port))
  )
    throw new Error('Invalid isolated local project ports')
  let config = source
    .replace(/\r\n/g, '\n')
    .replace(/^project_id = .*$/m, `project_id = "${ports.projectId}"`)
  config = config
    .replace('[api]', `[api]\nport = ${ports.api}`)
    .replace('[db]', `[db]\nport = ${ports.db}\nshadow_port = ${ports.shadow}`)
    .replace(
      /^\[inbucket\]\n(?:^(?!\[).*(?:\n|$))*/m,
      `[local_smtp]\nenabled = true\nport = ${ports.mail}\nsmtp_port = ${ports.smtp}\npop3_port = ${ports.pop3}\n`,
    )
    .replace('[studio]\nenabled = true', '[studio]\nenabled = false')
    .replace(/^site_url = .*$/m, `site_url = "${ports.origin}"`)
    .replace(
      /^additional_redirect_urls = .*$/m,
      `additional_redirect_urls = ["${ports.origin}/auth/callback"]`,
    )
  if (signupJourney)
    config += [
      '',
      '[auth.email.template.confirmation]',
      'subject = "Confirm your Antique Trail account"',
      'content_path = "./supabase/templates/confirmation.html"',
      '',
    ].join('\n')
  return `${config}\n[edge_runtime]\nenabled = true\ninspector_port = ${ports.inspector}\n`
}
export async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  child.kill()
  await closed
}
export function command(
  file,
  args,
  { cwd = ROOT, input, timeout = 600_000, env = process.env, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      env,
      signal,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
      if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000)
    })
    child.stderr.on('data', (data) => {
      stderr += data
      if (stderr.length > 4_000_000) stderr = stderr.slice(-4_000_000)
    })
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeout)
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const category = timedOut ? 'command_timeout' : signal?.aborted ? 'aborted' : 'command_spawn'
      commandFailureMetadata.set(error, { category, commandExitCode: null })
      reject(error)
    })
    child.on('close', (code, signalCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (timedOut) {
        const error = new Error(`${path.basename(file)} timed out after ${timeout}ms`)
        commandFailureMetadata.set(error, { category: 'command_timeout', commandExitCode: null })
        reject(error)
        return
      }
      if (code === 0) resolve(stdout)
      else {
        let summary = ''
        try {
          const parsed = JSON.parse(stdout)
          summary = JSON.stringify(parsed.error ?? parsed.message ?? '')
        } catch {
          /* Only structured error output is included. */
        }
        const error = new Error(
          `${path.basename(file)} exited ${code}: ${summary} ${stderr.slice(-2000)}`,
        )
        const category = signal?.aborted
          ? 'aborted'
          : Number.isInteger(code) && code >= 1 && code <= 255
            ? 'command_exit'
            : typeof signalCode === 'string' && signalCode.length > 0
              ? 'command_signal'
              : 'unknown'
        commandFailureMetadata.set(error, {
          category,
          commandExitCode: category === 'command_exit' ? code : null,
        })
        reject(error)
      }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}
let binaryPromise
async function cliBinary(signal) {
  if (binaryPromise) return binaryPromise
  binaryPromise = resolveCliBinary(signal)
  return binaryPromise
}
async function resolveCliBinary(signal) {
  const npx = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js')
  const args = [
    '--yes',
    `--package=supabase@${CLI_VERSION}`,
    '--',
    'node',
    '-p',
    'process.env.PATH',
  ]
  const search = await command(
    process.platform === 'win32' ? process.execPath : 'npx',
    process.platform === 'win32' ? [npx, ...args] : args,
    { signal },
  )
  const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform]
  for (const entry of search.trim().split(path.delimiter)) {
    if (path.basename(entry) !== '.bin') continue
    const modules = path.dirname(entry)
    const manifest = path.join(modules, 'supabase/package.json')
    const binary = path.join(
      modules,
      `@supabase/cli-${platform}-${process.arch}/bin/supabase${process.platform === 'win32' ? '.exe' : ''}`,
    )
    if (
      fs.existsSync(manifest) &&
      JSON.parse(fs.readFileSync(manifest, 'utf8')).version === CLI_VERSION &&
      fs.existsSync(binary)
    )
      return binary
  }
  throw new Error('Pinned Supabase native CLI is unavailable')
}
async function cli(args, options) {
  return command(await cliBinary(options?.signal), args, options)
}
export function digestFiles(directory) {
  const hash = crypto.createHash('sha256')
  function visit(dir) {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile())
        hash
          .update(path.relative(directory, file).replaceAll('\\', '/'))
          .update(fs.readFileSync(file))
      else throw new Error('Fixture source must not contain links')
    }
  }
  visit(directory)
  return hash.digest('hex')
}
export function loopbackRequest(base, route, options = {}) {
  const metadata = {}
  const promise = performLoopbackRequest(base, route, options, metadata)
  readinessRequestMetadata.set(promise, metadata)
  return promise
}

async function performLoopbackRequest(
  base,
  route,
  { key, token = key, body, method = 'POST', schema, origin, fetcher = fetch, signal } = {},
  metadata,
) {
  const url = new URL(base)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Only a literal loopback origin is allowed')
  if (
    !/^\/(auth\/v1\/(admin\/users|token\?grant_type=password|health)|rest\/v1\/rpc\/[a-z_]+|functions\/v1\/(public-catalog|account-registration))$/.test(
      route,
    )
  )
    throw new Error('Unexpected local request route')
  let response
  try {
    response = await fetcher(`${url.origin}${route}`, {
      method,
      redirect: 'error',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(schema ? { 'Content-Profile': schema, 'Accept-Profile': schema } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    tagReadinessFailure(error, 'fetchFailure', null, { transportCode: fetchTransportCode(error) })
    throw error
  }
  const status = isReadinessHttpStatus(response?.status) ? response.status : undefined
  metadata.status = status
  let data
  try {
    data = await response.json()
  } catch (error) {
    tagReadinessFailure(error, 'responseParseFailure', status)
    throw error
  }
  const safeErrorCode = responseErrorCode(data)
  metadata.safeErrorCode = safeErrorCode
  if (!response.ok) {
    // Whitelist server diagnostic fields; never echo arbitrary request/response bodies.
    const code = String(data?.error?.code ?? data?.code ?? response.status)
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 80)
    const message = String(data?.message ?? '')
      .replace(/[^A-Za-z0-9_ .]/g, '')
      .slice(0, 160)
    const error = new Error(`HTTP ${response.status} ${code} ${message}`)
    tagReadinessFailure(error, 'httpFailure', status, { safeErrorCode })
    throw error
  }
  return data
}
export async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
export function validateOwner(run) {
  const root = fs.realpathSync(run.directory)
  const temp = fs.realpathSync(os.tmpdir())
  if (
    path.dirname(root) !== temp ||
    !path.basename(root).startsWith('antique-shopper-') ||
    fs.lstatSync(run.directory).isSymbolicLink()
  )
    throw new Error('Unsafe temporary project path')
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.owner.json'), 'utf8'))
  if (
    marker.id !== run.id ||
    marker.projectId !== run.projectId ||
    marker.directory !== root ||
    !/^probe-[a-f0-9]{24}$/.test(run.projectId)
  )
    throw new Error('Run ownership mismatch')
  const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  if (!config.startsWith(`project_id = "${run.projectId}"\n`))
    throw new Error('Project identity mismatch')
  return root
}
export async function waitForLocalServiceReadiness(
  run,
  request,
  signal,
  wait = () => new Promise((resolve) => setTimeout(resolve, 1000)),
  readServingProcessState = () => undefined,
) {
  let ready = false
  let attempts = 0
  const categoryCounts = {
    fetchFailure: 0,
    responseParseFailure: 0,
    httpFailure: 0,
    invalidResponse: 0,
    unclassifiedFailure: 0,
  }
  const httpStatusCounts = new Map()
  const failures = { first: null, firstHttp: null, last: null }
  function recordFailure(attempt, category, metadata) {
    if (!run.users.length) return
    const status = isReadinessHttpStatus(metadata?.status) ? metadata.status : null
    const firstHttp =
      failures.firstHttp === null &&
      (category === 'httpFailure' || category === 'responseParseFailure') &&
      status !== null
    const shouldSnapshot = failures.first === null || firstHttp || attempt === 60
    const serving = shouldSnapshot
      ? servingProcessEvidence(readServingProcessState)
      : { servingState: 'unavailable', servingExitCode: null }
    const record = {
      attempt,
      category,
      httpStatus: status,
      safeErrorCode: readinessSafeErrorCodes.has(metadata?.safeErrorCode)
        ? metadata.safeErrorCode
        : null,
      transportCode:
        category === 'fetchFailure' && readinessTransportCodes.has(metadata?.transportCode)
          ? metadata.transportCode
          : null,
      ...serving,
    }
    if (failures.first === null) failures.first = record
    if (firstHttp) failures.firstHttp = record
    failures.last = record
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    signal?.throwIfAborted()
    attempts++
    try {
      if (run.users.length) {
        const pending = request('/functions/v1/public-catalog', {
          key: run.anonKey,
          token: run.users[0].token,
          origin: run.origin,
          body: { operation: 'list', args: { p_q: null, p_category: null, p_area: null } },
        })
        const result = await pending
        if (result != null && Array.isArray(result.data)) {
          ready = true
          break
        }
        categoryCounts.invalidResponse++
        const status = readinessRequestMetadata.get(pending)?.status
        if (isReadinessHttpStatus(status))
          httpStatusCounts.set(status, (httpStatusCounts.get(status) ?? 0) + 1)
        recordFailure(attempts, 'invalidResponse', readinessRequestMetadata.get(pending))
      } else {
        const result = await request('/functions/v1/account-registration', {
          key: run.anonKey,
          token: run.anonKey,
          origin: run.origin,
          body: {},
        })
        if (result.state === 'blocked') {
          ready = true
          break
        }
        categoryCounts.invalidResponse++
      }
    } catch (error) {
      /* Readiness only; actual commands record their own result. */
      const metadata =
        error !== null && (typeof error === 'object' || typeof error === 'function')
          ? readinessFailureMetadata.get(error)
          : undefined
      const category = Object.hasOwn(categoryCounts, metadata?.category)
        ? metadata.category
        : 'unclassifiedFailure'
      categoryCounts[category]++
      const status = metadata?.status
      if (
        (category === 'httpFailure' || category === 'responseParseFailure') &&
        isReadinessHttpStatus(status)
      )
        httpStatusCounts.set(status, (httpStatusCounts.get(status) ?? 0) + 1)
      recordFailure(attempts, category, metadata)
    }
    await wait()
  }
  if (!ready) {
    if (run.users.length && !signal?.aborted) {
      const httpStatuses = [...httpStatusCounts]
        .sort(([left], [right]) => left - right)
        .map(([status, count]) => ({ status, count }))
      const diagnostic = {
        event: 'readiness-exhausted',
        probeKind: 'public-catalog',
        attempts,
        categoryCounts,
        httpStatusCounts: httpStatuses,
        failures,
      }
      // Fixed allowlists and three projected records keep this line below 4 KiB.
      try {
        process.stderr.write(`${JSON.stringify(diagnostic)}\n`)
      } catch {
        /* Diagnostics must not replace the fixed readiness failure. */
      }
    }
    const error = new Error(
      run.users.length
        ? 'Local catalog function did not become ready'
        : 'Local registration function did not become ready',
    )
    const [category] =
      Object.entries(categoryCounts)
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1])[0] ?? []
    if (run.users.length) tagReadinessFailure(error, 'readiness_exhausted')
    else if (readinessFailureCategories.has(category)) tagReadinessFailure(error, category)
    throw error
  }
}
export function createLocalService({
  signal,
  resumeDirectory,
  browserOrigin,
  disableStorage = false,
  signupJourney = false,
  createTestUsers = true,
  includeServiceRoleKey = false,
  partnerEnvironment,
} = {}) {
  if (browserOrigin && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(browserOrigin))
    throw new Error('Browser origin must use literal loopback')
  if (
    partnerEnvironment !== undefined &&
    (typeof partnerEnvironment?.emailHmacSecret !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(partnerEnvironment.emailHmacSecret) ||
      typeof partnerEnvironment?.evidenceHmacSecret !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(partnerEnvironment.evidenceHmacSecret))
  )
    throw new Error('Malformed local partner environment')
  const exclusions = localServiceExclusions(disableStorage)
  let run
  if (resumeDirectory) {
    const directory = path.resolve(resumeDirectory)
    run = JSON.parse(fs.readFileSync(path.join(directory, '.owner.json'), 'utf8'))
    if (run.directory !== directory) throw new Error('Run directory mismatch')
    validateOwner(run)
  } else {
    const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'antique-shopper-')))
    const id = crypto.randomUUID(),
      projectId = 'probe-' + id.replaceAll('-', '').slice(0, 24)
    run = { id, projectId, directory }
    fs.writeFileSync(path.join(directory, '.owner.json'), JSON.stringify(run), {
      flag: 'wx',
      mode: 0o600,
    })
    fs.mkdirSync(path.join(directory, 'supabase'))
    fs.writeFileSync(
      path.join(directory, 'supabase/config.toml'),
      'project_id = "' + projectId + '"\n',
    )
  }
  run.startupStep = 'unknown'
  const { id, projectId, directory } = run
  const runCommand = (file, args, options = {}) => command(file, args, { ...options, signal })
  let networkCreated = Boolean(resumeDirectory)
  let proxy
  let serving
  let cleaned = false
  const request = (route, options) => loopbackRequest(run.endpoint, route, { ...options, signal })
  const sql = async (input) => {
    validateOwner(run)
    const containers = await verifyContainers()
    if (!containers.some((c) => c.Name === '/supabase_db_' + projectId))
      throw new Error('Owned database is unavailable')
    return runCommand(
      'docker',
      [
        'exec',
        '-i',
        '-e',
        'PGPASSWORD=local-pgtap-only',
        `supabase_db_${projectId}`,
        'psql',
        '-U',
        'antique_trail_test_runner',
        '-h',
        '127.0.0.1',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
      ],
      { input },
    )
  }
  async function verifyContainers(checkBindings = true) {
    const ids = (
      await command('docker', [
        'ps',
        '-aq',
        '--filter',
        `label=com.supabase.cli.project=${projectId}`,
      ])
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (!ids.length) return []
    const containers = JSON.parse(await command('docker', ['inspect', ...ids]))
    for (const c of containers) {
      if (
        c.Config.Labels['com.supabase.cli.project'] !== projectId ||
        c.Config.Labels['com.supabase.cli.workdir'] !== directory
      )
        throw new Error('Container ownership mismatch')
      for (const bindings of Object.values(c.NetworkSettings.Ports ?? {}))
        for (const binding of bindings ?? [])
          if (checkBindings && binding.HostIp !== '127.0.0.1')
            throw new Error('Service is not bound to loopback')
    }
    return containers
  }
  async function start() {
    if (resumeDirectory) throw new Error('Recovery supports cleanup only')
    signal?.throwIfAborted()
    runAtLocalStartupStep(run, 'source-copy', () => {
      if (
        !fs
          .readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
          .includes(`supabase@${CLI_VERSION} start`)
      )
        throw new Error('Probe CLI pin differs from CI')
      run.cliVersion = CLI_VERSION
      for (const name of ['migrations', 'functions'])
        fs.cpSync(path.join(ROOT, 'supabase', name), path.join(directory, 'supabase', name), {
          recursive: true,
          filter: (file) => !['.env', '.temp'].includes(path.basename(file)),
        })
      if (signupJourney)
        fs.cpSync(
          path.join(ROOT, 'supabase', 'templates'),
          path.join(directory, 'supabase', 'templates'),
          { recursive: true },
        )
      fs.copyFileSync(
        path.join(ROOT, 'supabase/seed.sql'),
        path.join(directory, 'supabase/seed.sql'),
      )
    })
    let registrationSettings = ''
    let config
    await runAtLocalStartupStep(run, 'port-config', async () => {
      run.origin = browserOrigin ?? 'http://127.0.0.1:4173'
      const ports = new Set()
      const originPort = Number(new URL(run.origin).port)
      while (ports.size < 7) {
        const port = await freePort()
        if (port !== originPort) ports.add(port)
      }
      const [api, db, shadow, mail, smtp, pop3, inspector] = [...ports]
      run.endpoint = `http://127.0.0.1:${api}`
      run.mailEndpoint = `http://127.0.0.1:${mail}`
      registrationSettings = signupJourney
        ? registrationEnvironment({
            appOrigin: run.origin,
            supabaseOrigin: 'http://kong:8000',
            mailOrigin: run.mailEndpoint,
            secret: crypto.randomBytes(32).toString('hex'),
          })
        : ''
      config = localProjectConfig(
        fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8'),
        { projectId, api, db, shadow, mail, smtp, pop3, inspector, origin: run.origin },
        { signupJourney },
      )
      fs.writeFileSync(path.join(directory, 'supabase/config.toml'), config)
    })
    await runAtLocalStartupStep(run, 'source-identity', async () => {
      run.sourceSha = (await runCommand('git', ['rev-parse', 'HEAD'])).trim()
      run.sourceDirty = Boolean(
        (await runCommand('git', ['status', '--porcelain', '--untracked-files=no'])).trim(),
      )
      run.schemaIdentity = digestFiles(path.join(directory, 'supabase/migrations'))
      run.functionIdentity = digestFiles(path.join(directory, 'supabase/functions'))
      run.configIdentity = crypto.createHash('sha256').update(config).digest('hex')
      run.fixtureIdentity = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(ROOT, 'supabase/seed.sql')))
        .update(fs.readFileSync(path.join(ROOT, 'scripts/configured-shopper-fixtures.sql')))
        .digest('hex')
      validateOwner(run)
    })
    proxy = await runAtLocalStartupStep(run, 'docker-proxy', () => dockerLoopbackProxy(run))
    networkCreated = true
    await runAtLocalStartupStep(run, 'docker-network', () =>
      runCommand('docker', [
        'network',
        'create',
        '--label',
        `antique.probe=${id}`,
        '--opt',
        'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
        projectId,
      ]),
    )
    networkCreated = true
    const cliPath = await runAtLocalStartupStep(run, 'cli-resolution', () => cliBinary(signal))
    await runAtLocalStartupStep(run, 'supabase-start', async () => {
      if (signupJourney)
        fs.writeFileSync(
          path.join(directory, 'supabase/functions/.env'),
          `PUBLIC_APP_ORIGIN=${run.origin}\n${registrationSettings}\n`,
          { mode: 0o600 },
        )
      await command(
        cliPath,
        ['start', '--workdir', directory, '--network-id', projectId, '--exclude', exclusions],
        { env: proxy.env, signal, timeout: 1_200_000 },
      )
    })
    await runAtLocalStartupStep(run, 'container-verification', () => verifyContainers())
    const statusOutput = await runAtLocalStartupStep(run, 'supabase-status', () =>
      command(cliPath, ['status', '--workdir', directory, '-o', 'json'], {
        signal,
        timeout: 300_000,
      }),
    )
    const status = runAtLocalStartupStep(run, 'status-parse', () => JSON.parse(statusOutput))
    run.anonKey = status.ANON_KEY
    runAtLocalStartupStep(run, 'credential-check', () => {
      if (!run.anonKey || !status.SERVICE_ROLE_KEY || !status.JWT_SECRET)
        throw new Error('Local service credentials unavailable')
      if (includeServiceRoleKey) run.serviceRoleKey = status.SERVICE_ROLE_KEY
    })
    await runAtLocalStartupStep(run, 'gateway-setup', async () => {
      // This is a server-only catalog service credential, never a shopper identity.
      const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const unsigned = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ role: 'public_catalog_gateway', iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 })}`
      const gateway = `${unsigned}.${crypto.createHmac('sha256', status.JWT_SECRET).update(unsigned).digest('base64url')}`
      const functionEnv = [
        `PUBLIC_CATALOG_GATEWAY_JWT=${gateway}`,
        `PUBLIC_CATALOG_RATE_SALT=${crypto.randomBytes(32).toString('hex')}`,
        `APP_ORIGIN=${run.origin}`,
        `PUBLIC_APP_ORIGIN=${run.origin}`,
        ...(partnerEnvironment
          ? [
              'PARTNER_SYNTHETIC_ENABLED=true',
              `PARTNER_EMAIL_HMAC_SECRET=${partnerEnvironment.emailHmacSecret}`,
              'PARTNER_EMAIL_HMAC_KEY_VERSION=1',
              `PARTNER_EVIDENCE_HMAC_SECRET=${partnerEnvironment.evidenceHmacSecret}`,
            ]
          : []),
        ...(signupJourney ? [registrationSettings] : []),
      ].join('\n')
      fs.writeFileSync(path.join(directory, 'supabase/functions/.env'), `${functionEnv}\n`, {
        mode: 0o600,
      })
    })
    // Match the CI test role and grants, confined to this uniquely owned database.
    await runAtLocalStartupStep(run, 'fixture-setup', async () => {
      const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8')
      const grantSql = ci.match(/create extension if not exists pgtap[\s\S]*?reset role;/)?.[0]
      if (!grantSql) throw new Error('CI test role setup unavailable')
      await runCommand(
        'docker',
        [
          'exec',
          '-i',
          '-e',
          'PGPASSWORD=postgres',
          `supabase_db_${projectId}`,
          'psql',
          '-U',
          'supabase_admin',
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
        ],
        { input: grantSql },
      )
      await sql(fs.readFileSync(path.join(ROOT, 'scripts/configured-shopper-fixtures.sql'), 'utf8'))
      if (signupJourney)
        await sql(
          "update app_private.account_registration_config set mode='public',stage_receipt_id=null,version=version+1 where id=1;",
        )
    })
    run.users = []
    let authReady = false
    await runAtLocalStartupStep(run, 'auth-health', async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        signal?.throwIfAborted()
        try {
          await request('/auth/v1/health', { key: run.anonKey, method: 'GET' })
          authReady = true
          break
        } catch {
          /* GoTrue may still be applying its local schema migrations. */
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      if (!authReady) throw new Error('Local Auth did not become healthy')
    })
    for (const alias of createTestUsers ? ['shopper-a', 'shopper-b'] : []) {
      runAtLocalStartupStep(run, 'actor-create', () => signal?.throwIfAborted())
      const email = `${alias}-${id}@probe.invalid`,
        password = crypto.randomBytes(32).toString('base64url')
      const user = await runAtLocalStartupStep(run, 'actor-create', () =>
        request('/auth/v1/admin/users', {
          key: run.anonKey,
          token: status.SERVICE_ROLE_KEY,
          body: { email, password, email_confirm: true },
        }),
      )
      if (!/^[a-f0-9-]{36}$/.test(user.id)) throw new Error('Malformed local identity')
      await runAtLocalStartupStep(run, 'actor-profile', () =>
        sql(
          `insert into app_private.profiles(user_id,age_18_attested_at) values ('${user.id}',now()) on conflict(user_id) do update set age_18_attested_at=excluded.age_18_attested_at; insert into app_private.role_grants(subject_user_id,role,state) values ('${user.id}','shopper','active');`,
        ),
      )
      const session = await runAtLocalStartupStep(run, 'actor-token', () =>
        request('/auth/v1/token?grant_type=password', {
          key: run.anonKey,
          body: { email, password },
        }),
      )
      const actor = { id: user.id, token: session.access_token, email, password }
      if (session.user?.id !== user.id || !actor.token)
        throw new Error('Password grant did not establish the expected identity')
      const registered = await runAtLocalStartupStep(run, 'actor-session', () =>
        request('/rest/v1/rpc/register_current_session', {
          key: run.anonKey,
          token: actor.token,
          schema: 'app_public',
          body: { access_token_expires_at: session.expires_at * 1000 },
        }),
      )
      if (registered !== true) throw new Error('Application session registration failed')
      run.users.push(actor)
    }
    // A separate CLI process owns the Edge runtime; capture no potentially secret output.
    const args = ['functions', 'serve', '--workdir', directory, '--network-id', projectId]
    serving = runAtLocalStartupStep(run, 'edge-spawn', () =>
      spawn(cliPath, args, {
        cwd: ROOT,
        windowsHide: true,
        stdio: 'ignore',
        env: proxy.env,
      }),
    )
    serving.on('error', () => {})
    await runAtLocalStartupStep(run, 'edge-readiness', () =>
      waitForLocalServiceReadiness(run, request, signal, undefined, () => serving),
    )
    runAtLocalStartupStep(run, 'complete', () => {})
    return run
  }
  async function cleanup() {
    if (cleaned) return 'removed'
    try {
      validateOwner(run)
      await stopChild(serving)
      if (networkCreated) {
        const networkId = (
          await command('docker', ['network', 'ls', '-q', '--filter', 'name=^' + projectId + '$'])
        ).trim()
        if (networkId) {
          const network = JSON.parse(await command('docker', ['network', 'inspect', networkId]))[0]
          if (network.Name !== projectId || network.Labels?.['antique.probe'] !== id)
            throw new Error('Network ownership mismatch')
        }
        await verifyContainers(false)
        const volumeIds = (
          await command('docker', [
            'volume',
            'ls',
            '-q',
            '--filter',
            `label=com.supabase.cli.project=${projectId}`,
          ])
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean)
        if (volumeIds.length) {
          const volumes = JSON.parse(await command('docker', ['volume', 'inspect', ...volumeIds]))
          if (
            volumes.some(
              (v) =>
                v.Labels?.['com.supabase.cli.project'] !== projectId ||
                !v.Name.endsWith(`_${projectId}`),
            )
          )
            throw new Error('Volume ownership mismatch')
        }
        try {
          await cli(['stop', '--workdir', directory, '--project-id', projectId, '--no-backup'])
        } catch (error) {
          if (!String(error).includes('LegacyStopContainerPruneError')) throw error
          const ownedContainers = await verifyContainers(false)
          if (ownedContainers.length)
            await runCommand('docker', ['rm', '--force', ...ownedContainers.map((c) => c.Id)])
          if (volumeIds.length) await runCommand('docker', ['volume', 'rm', ...volumeIds])
        }
        if ((await verifyContainers(false)).length)
          throw new Error('Run containers remain after stop')
        if (
          (
            await command('docker', [
              'volume',
              'ls',
              '-q',
              '--filter',
              `label=com.supabase.cli.project=${projectId}`,
            ])
          ).trim()
        )
          throw new Error('Run volumes remain after stop')
        if (networkId) {
          await command('docker', ['network', 'rm', projectId])
          if (
            (
              await command('docker', [
                'network',
                'ls',
                '-q',
                '--filter',
                'name=^' + projectId + '$',
              ])
            ).trim()
          )
            throw new Error('Run network remains after stop')
        }
      }
      cleaned = true
    } finally {
      await stopChild(serving)
      if (proxy) await proxy.close()
      const owned = validateOwner(run)
      fs.rmSync(path.join(owned, 'supabase/functions/.env'), { force: true })
    }
    if (cleaned) {
      const owned = validateOwner(run)
      cleaned = false
      fs.rmSync(owned, { recursive: true })
      if (fs.existsSync(owned)) throw new Error('Run directory remains after cleanup')
      cleaned = true
    }
    return 'removed'
  }
  return { run, start, cleanup, sql, request }
}
