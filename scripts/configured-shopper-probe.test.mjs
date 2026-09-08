import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import process from 'node:process'
import test from 'node:test'
import {
  COMMANDS,
  redact,
  requireLoopbackUrl,
  runChecks,
  runProbe,
} from './configured-shopper-probe.mjs'
import { loopbackRequest, createLocalService, validateOwner } from './configured-shopper-local.mjs'
import { bindLoopback } from './configured-shopper-docker.mjs'
import { createExecutor } from './configured-shopper-executor.mjs'

function output(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-contract-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}
test('refuses remote origins, credentials, paths, alternate DNS, and target selection', async (t) => {
  assert.equal(requireLoopbackUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321')
  for (const url of [
    'https://example.com',
    'http://localhost:54321',
    'http://user:password@127.0.0.1',
    'http://127.0.0.1/path',
    'http://127.0.0.1?key=secret',
  ])
    assert.throws(() => requireLoopbackUrl(url))
  const report = await runProbe({ output: output(t), endpoint: 'http://127.0.0.1:54321' })
  assert.equal(report.status, 'unavailable')
  assert.equal(report.checks.length, COMMANDS.length)
})
test('all unavailable, missing, malformed, and partial results cannot pass', async (t) => {
  for (const result of [
    { status: 'unavailable', detail: 'Service missing' },
    undefined,
    { status: 'pass' },
    { status: 'unknown', detail: 'Bad' },
  ]) {
    const report = await runProbe({ output: output(t), execute: async () => result })
    assert.notEqual(report.status, 'passed')
    assert.equal(report.checks.length, 13)
  }
  const good = await runProbe({
    output: output(t),
    execute: async () => ({ status: 'pass', detail: 'Asserted' }),
  })
  assert.equal(good.status, 'passed')
})
test('continues independently after a command failure and redacts nested credentials', async () => {
  const report = await runChecks({
    commands: ['first', 'broken', 'last'],
    execute: async (name) => {
      if (name === 'broken')
        throw new Error(
          'Bearer eyJheader.payload.signature password=unusual email=fiction@probe.invalid',
        )
      return { status: 'pass', detail: name }
    },
  })
  assert.deepEqual(
    report.results.map((r) => r.status),
    ['pass', 'fail', 'pass'],
  )
  assert.doesNotMatch(JSON.stringify(report), /eyJheader|unusual|fiction@/)
  assert.deepEqual(
    redact({
      nested: { service_role_token: 'anything', password: 'another' },
      detail: 'bearer eyJabc.xyz.sig',
    }),
    {
      nested: { service_role_token: '[REDACTED]', password: '[REDACTED]' },
      detail: 'bearer [REDACTED]',
    },
  )
})
test('setup failure and cleanup failure are reported without false success', async (t) => {
  let cleaned = 0
  const report = await runProbe({
    output: output(t),
    serviceFactory: () => ({
      start: async () => {
        throw new Error('Setup failed')
      },
      cleanup: async () => {
        cleaned++
        throw new Error('Cleanup refused')
      },
    }),
  })
  assert.equal(cleaned, 1)
  assert.equal(report.status, 'failed')
  assert.equal(report.cleanup, 'failed')
  assert.equal(report.checks.length, 13)
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(report.directory, 'report.json'))).status,
    'failed',
  )
})
test('interruption still cleans the owned service and marks every command unavailable', async (t) => {
  let cleaned = false
  const report = await runProbe({
    output: output(t),
    serviceFactory: () => ({
      run: {},
      start: async () => {
        process.emit('SIGINT')
        return {}
      },
      cleanup: async () => {
        cleaned = true
        return 'removed'
      },
    }),
  })
  assert.equal(cleaned, true)
  assert.equal(report.status, 'unavailable')
  assert.ok(report.checks.every((c) => c.status === 'unavailable'))
})
test('HTTP transport rejects a real redirect without contacting the destination', async (t) => {
  let leaked = 0
  const server = http.createServer((req, res) => {
    if (req.url === '/destination') {
      leaked++
      res.end('{}')
    } else {
      res.writeHead(302, { Location: '/destination' })
      res.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  await assert.rejects(() =>
    loopbackRequest(`http://127.0.0.1:${server.address().port}`, '/rest/v1/rpc/get_trip', {
      key: 'local-only',
      body: {},
    }),
  )
  assert.equal(leaked, 0)
})
test('executor dispatches actual catalog envelope and rejects wrong independent readback', async () => {
  let observed
  const execute = createExecutor({
    run: { anonKey: 'local', users: [{ token: 'actor' }], origin: 'http://127.0.0.1:4173' },
    request: async (route, options) => {
      observed = { route, options }
      return { data: [{ id: 'wrong', name: 'Clockwork Cabinet' }] }
    },
    sql: async () => {
      throw new Error('Unexpected SQL')
    },
  })
  await assert.rejects(() => execute('catalog_details'), /Catalog must return/)
  assert.equal(observed.route, '/functions/v1/public-catalog')
  assert.deepEqual(observed.options.body, {
    operation: 'details',
    args: { p_slug: 'clockwork-cabinet' },
  })
  assert.equal(observed.options.token, 'actor')
})
test('Docker container creation binds all published ports and rejects foreign ownership', () => {
  const body = {
    Labels: { 'com.supabase.cli.project': 'probe-owned' },
    HostConfig: { PortBindings: { '5432/tcp': [{ HostIp: '', HostPort: '44000' }] } },
  }
  assert.equal(
    bindLoopback(body, 'probe-owned').HostConfig.PortBindings['5432/tcp'][0].HostIp,
    '127.0.0.1',
  )
  assert.throws(() => bindLoopback(body, 'another'), /Foreign/)
})
test('cleanup refuses modified markers and project configuration', async () => {
  const service = createLocalService(),
    { run } = service

  fs.writeFileSync(
    path.join(run.directory, 'supabase/config.toml'),
    `project_id = "${run.projectId}"\n`,
  )
  assert.equal(validateOwner(run), run.directory)
  const marker = fs.readFileSync(path.join(run.directory, '.owner.json'))
  fs.writeFileSync(
    path.join(run.directory, '.owner.json'),
    JSON.stringify({ ...run, id: 'foreign' }),
  )
  await assert.rejects(() => service.cleanup(), /ownership/)
  assert.ok(fs.existsSync(run.directory))
  fs.writeFileSync(path.join(run.directory, '.owner.json'), marker)
  fs.writeFileSync(
    path.join(run.directory, 'supabase/config.toml'),
    'project_id = "antique-trail"\n',
  )
  await assert.rejects(() => service.cleanup(), /identity/)
  fs.writeFileSync(
    path.join(run.directory, 'supabase/config.toml'),
    `project_id = "${run.projectId}"\n`,
  )
  assert.equal(await service.cleanup(), 'removed')
  assert.equal(await service.cleanup(), 'removed')
})

test(
  'Docker streaming headers arrive before the exit-status body',
  { timeout: 5000 },
  async (t) => {
    const { serveDockerProxy } = await import('./configured-shopper-docker.mjs')
    const root = output(t),
      id = `probe-${process.pid}-${Date.now()}`
    const upstreamSocket =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${id}-upstream`
        : path.join(root, 'upstream.sock')
    let response
    const upstream = http.createServer((_req, res) => {
      response = res
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.flushHeaders()
    })
    await new Promise((resolve) => upstream.listen(upstreamSocket, resolve))
    const proxy = await serveDockerProxy({ projectId: id, directory: root }, upstreamSocket)
    const socket =
      process.platform === 'win32' ? `\\\\.\\pipe\\${id}` : path.join(root, 'docker.sock')
    try {
      await new Promise((resolve, reject) => {
        const req = http.request(
          {
            socketPath: socket,
            path: '/v1.55/containers/fixture/wait',
            method: 'POST',
            agent: false,
          },
          (res) => {
            assert.equal(res.statusCode, 200)
            response.end('{"StatusCode":0}')
            res.resume()
            res.on('end', resolve)
          },
        )
        req.on('error', reject)
        req.end()
      })
    } finally {
      await proxy.close()
      await new Promise((resolve) => upstream.close(resolve))
    }
  },
)

test('setup cancellation aborts the actual subprocess before cleanup', async (t) => {
  const { command } = await import('./configured-shopper-local.mjs')
  const { setTimeout } = await import('node:timers')
  let cleanupCalled = false
  const report = await runProbe({
    output: output(t),
    serviceFactory: ({ signal }) => ({
      run: { projectId: 'cancelled-contract' },
      start: async () => {
        setTimeout(() => process.emit('SIGINT'), 50)
        await command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal })
        throw new Error('Aborted process unexpectedly continued')
      },
      cleanup: async () => {
        cleanupCalled = true
        return 'removed'
      },
    }),
  })
  assert.equal(cleanupCalled, true)
  assert.equal(report.status, 'unavailable')
  assert.equal(report.projectId, 'cancelled-contract')
})
test('failed recovery cleanup removes credentials and retains ownership for retry', async () => {
  const service = createLocalService(),
    { run } = service
  const envPath = path.join(run.directory, 'supabase/functions/.env')
  fs.mkdirSync(path.dirname(envPath))
  fs.writeFileSync(envPath, 'SECRET=local-test-only')
  const recovery = createLocalService({ resumeDirectory: run.directory })
  const original = process.env.PATH
  try {
    process.env.PATH = ''
    await assert.rejects(() => recovery.cleanup())
    assert.equal(fs.existsSync(envPath), false)
    assert.equal(fs.existsSync(path.join(run.directory, '.owner.json')), true)
  } finally {
    process.env.PATH = original
    await service.cleanup()
  }
})
