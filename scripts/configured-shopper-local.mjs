/* global process, Buffer, URL, fetch, AbortSignal, setTimeout, clearTimeout */
import { dockerLoopbackProxy } from './configured-shopper-docker.mjs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const CLI_VERSION = '2.115.0'
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
    const timer = setTimeout(() => child.kill(), timeout)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else {
        let summary = ''
        try {
          const parsed = JSON.parse(stdout)
          summary = JSON.stringify(parsed.error ?? parsed.message ?? '')
        } catch {
          /* Only structured error output is included. */
        }
        reject(
          new Error(`${path.basename(file)} exited ${code}: ${summary} ${stderr.slice(-2000)}`),
        )
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
function nativeCliBinary(modules) {
  const manifest = path.join(modules, 'supabase/package.json')
  const platform = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform]
  const binary = path.join(
    modules,
    `@supabase/cli-${platform}-${process.arch}/bin/supabase${process.platform === 'win32' ? '.exe' : ''}`,
  )
  if (!fs.existsSync(manifest) || !fs.existsSync(binary)) return
  try {
    if (JSON.parse(fs.readFileSync(manifest, 'utf8')).version === CLI_VERSION) return binary
  } catch {
    // A partial cache entry is not a supported CLI candidate; retain the npx fallback.
  }
}
function cachedCliBinary() {
  const cache =
    process.env.npm_config_cache ??
    (process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'npm-cache')
      : undefined)
  if (!cache) return
  const npx = path.join(cache, '_npx')
  if (!fs.existsSync(npx)) return
  for (const entry of fs.readdirSync(npx).sort()) {
    const binary = nativeCliBinary(path.join(npx, entry, 'node_modules'))
    if (binary) return binary
  }
}
async function resolveCliBinary(signal) {
  const cached = cachedCliBinary()
  if (cached) return cached
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
  for (const entry of search.trim().split(path.delimiter)) {
    if (path.basename(entry) !== '.bin') continue
    const binary = nativeCliBinary(path.dirname(entry))
    if (binary) return binary
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
export async function loopbackRequest(
  base,
  route,
  { key, token = key, body, method = 'POST', schema, origin, fetcher = fetch, signal } = {},
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
    !/^\/(auth\/v1\/(admin\/users|token\?grant_type=password|health)|rest\/v1\/rpc\/[a-z_]+|functions\/v1\/public-catalog)$/.test(
      route,
    )
  )
    throw new Error('Unexpected local request route')
  const response = await fetcher(`${url.origin}${route}`, {
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
  const data = await response.json()
  if (!response.ok) {
    // Whitelist server diagnostic fields; never echo arbitrary request/response bodies.
    const code = String(data?.error?.code ?? data?.code ?? response.status)
      .replace(/[^A-Za-z0-9_]/g, '')
      .slice(0, 80)
    const message = String(data?.message ?? '')
      .replace(/[^A-Za-z0-9_ .]/g, '')
      .slice(0, 160)
    throw new Error(`HTTP ${response.status} ${code} ${message}`)
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
export function createLocalService({ signal, resumeDirectory, browserOrigin } = {}) {
  if (browserOrigin && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(browserOrigin))
    throw new Error('Browser origin must use literal loopback')
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
    fs.copyFileSync(path.join(ROOT, 'supabase/seed.sql'), path.join(directory, 'supabase/seed.sql'))
    const ports = new Set()
    while (ports.size < 5) ports.add(await freePort())
    const [api, db, shadow, mail, inspector] = [...ports]
    run.endpoint = `http://127.0.0.1:${api}`
    run.origin = browserOrigin ?? 'http://127.0.0.1:4173'
    let config = fs
      .readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/^project_id = .*$/m, `project_id = "${projectId}"`)
    config = config
      .replace('[api]', `[api]\nport = ${api}`)
      .replace('[db]', `[db]\nport = ${db}\nshadow_port = ${shadow}`)
      .replace('[inbucket]', `[inbucket]\nport = ${mail}`)
      .replace('[studio]\nenabled = true', '[studio]\nenabled = false')
    config += `\n[edge_runtime]\nenabled = true\ninspector_port = ${inspector}\n`
    fs.writeFileSync(path.join(directory, 'supabase/config.toml'), config)
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
    proxy = await dockerLoopbackProxy(run)
    networkCreated = true
    await runCommand('docker', [
      'network',
      'create',
      '--label',
      `antique.probe=${id}`,
      '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
      projectId,
    ])
    networkCreated = true
    await cli(
      [
        'start',
        '--workdir',
        directory,
        '--network-id',
        projectId,
        '--exclude',
        'studio,postgres-meta,realtime,imgproxy,logflare,vector,supavisor',
      ],
      { env: proxy.env, signal },
    )
    await verifyContainers()
    const status = JSON.parse(await cli(['status', '--workdir', directory, '-o', 'json']))
    run.anonKey = status.ANON_KEY
    if (!run.anonKey || !status.SERVICE_ROLE_KEY || !status.JWT_SECRET)
      throw new Error('Local service credentials unavailable')
    // This is a server-only catalog service credential, never a shopper identity.
    const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const unsigned = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ role: 'public_catalog_gateway', iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 })}`
    const gateway = `${unsigned}.${crypto.createHmac('sha256', status.JWT_SECRET).update(unsigned).digest('base64url')}`
    fs.writeFileSync(
      path.join(directory, 'supabase/functions/.env'),
      `PUBLIC_CATALOG_GATEWAY_JWT=${gateway}\nPUBLIC_CATALOG_RATE_SALT=${crypto.randomBytes(32).toString('hex')}\nPUBLIC_APP_ORIGIN=${run.origin}\n`,
      { mode: 0o600 },
    )
    // Match the CI test role and grants, confined to this uniquely owned database.
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
    run.users = []
    for (const alias of ['shopper-a', 'shopper-b']) {
      signal?.throwIfAborted()
      const email = `${alias}-${id}@probe.invalid`,
        password = crypto.randomBytes(32).toString('base64url')
      const user = await request('/auth/v1/admin/users', {
        key: run.anonKey,
        token: status.SERVICE_ROLE_KEY,
        body: { email, password, email_confirm: true },
      })
      if (!/^[a-f0-9-]{36}$/.test(user.id)) throw new Error('Malformed local identity')
      await sql(
        `insert into app_private.profiles(user_id,age_18_attested_at) values ('${user.id}',now()) on conflict(user_id) do update set age_18_attested_at=excluded.age_18_attested_at; insert into app_private.role_grants(subject_user_id,role,state) values ('${user.id}','shopper','active');`,
      )
      const session = await request('/auth/v1/token?grant_type=password', {
        key: run.anonKey,
        body: { email, password },
      })
      const actor = { id: user.id, token: session.access_token, email, password }
      if (session.user?.id !== user.id || !actor.token)
        throw new Error('Password grant did not establish the expected identity')
      const registered = await request('/rest/v1/rpc/register_current_session', {
        key: run.anonKey,
        token: actor.token,
        schema: 'app_public',
        body: { access_token_expires_at: session.expires_at * 1000 },
      })
      if (registered !== true) throw new Error('Application session registration failed')
      run.users.push(actor)
    }
    // A separate CLI process owns the Edge runtime; capture no potentially secret output.
    const args = ['functions', 'serve', '--workdir', directory, '--network-id', projectId]
    serving = spawn(await cliBinary(), args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: 'ignore',
      env: proxy.env,
    })
    serving.on('error', () => {})
    for (let attempt = 0; attempt < 10; attempt++) {
      signal?.throwIfAborted()
      try {
        const result = await request('/functions/v1/public-catalog', {
          key: run.anonKey,
          token: run.users[0].token,
          origin: run.origin,
          body: { operation: 'list', args: { p_q: null, p_category: null, p_area: null } },
        })
        if (Array.isArray(result.data)) break
      } catch {
        /* Readiness only; actual commands record their own result. */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
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
        await cli(['stop', '--workdir', directory, '--project-id', projectId, '--no-backup'])
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
        if (networkId) await command('docker', ['network', 'rm', projectId])
      }
      cleaned = true
    } finally {
      await stopChild(serving)
      if (proxy) await proxy.close()
      const owned = validateOwner(run)
      fs.rmSync(path.join(owned, 'supabase/functions/.env'), { force: true })
      if (cleaned) fs.rmSync(owned, { recursive: true })
    }
    return 'removed'
  }
  return { run, start, cleanup, sql, request }
}
