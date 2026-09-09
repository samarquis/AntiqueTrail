#!/usr/bin/env node
/* global process, console, AbortController, setTimeout, fetch, URL */
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawn } from 'node:child_process'
import {
  createLocalService,
  command,
  freePort,
  ROOT,
  stopChild,
} from './configured-shopper-local.mjs'
import { createRunDirectory, redact } from './configured-shopper-probe.mjs'
import { browserReport } from './configured-free-shopper-report.mjs'

const output = createRunDirectory(path.join(ROOT, 'artifacts'))
const report = {
  status: 'unavailable',
  sourceSha: '',
  cleanup: 'not-started',
  errors: [],
  evidenceClass: 'real-local-browser',
  ownerFeedback: 'not-collected',
}
const controller = new AbortController()
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
let service, server
try {
  report.sourceSha = (await command('git', ['rev-parse', 'HEAD'])).trim()
  if (process.env.ANTIQUE_TRAIL_LOCAL_URL)
    throw new Error('External endpoint selection is forbidden')
  const origin = `http://127.0.0.1:${await freePort()}`
  service = createLocalService({ signal: controller.signal, browserOrigin: origin })
  report.temporaryProject = service.run.directory
  console.log(`Starting run-owned services. Evidence: ${output.directory}`)
  const local = await service.start()
  const fixtureSql = fs.readFileSync(
    path.join(ROOT, 'scripts/configured-free-shopper-fixtures.sql'),
    'utf8',
  )
  const media = [
    ['blue-finch-curios-cover.webp', 'clockwork-cabinet.webp'],
    ['blue-finch-curios-gallery-cabinet.webp', 'clockwork-cabinet-gallery.webp'],
  ]
  const provenance = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'docs/evidence/free-private-assets/provenance.json'), 'utf8'),
  )
  const fixtureHash = crypto.createHash('sha256').update(local.fixtureIdentity).update(fixtureSql)
  for (const [source] of media) {
    const relative = `public/images/synthetic-stores/1280w/${source}`
    const bytes = fs.readFileSync(path.join(ROOT, relative))
    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    if (
      !provenance.assets.some(
        (asset) =>
          asset.path === relative &&
          asset.sha256 === digest &&
          asset.rightsStatus === 'declared_internal_synthetic',
      )
    )
      throw new Error('Browser fixture media lacks matching internal synthetic provenance')
    fixtureHash.update(relative).update(bytes)
  }
  await service.sql(fixtureSql)
  local.fixtureIdentity = fixtureHash.digest('hex')
  for (const key of [
    'sourceSha',
    'sourceDirty',
    'schemaIdentity',
    'functionIdentity',
    'fixtureIdentity',
    'configIdentity',
    'endpoint',
    'projectId',
  ])
    report[key] = local[key]
  report.browserOrigin = origin
  const secretFile = path.join(local.directory, 'browser-input.json')
  fs.writeFileSync(secretFile, JSON.stringify({ ...local, output: output.directory }), {
    mode: 0o600,
    flag: 'wx',
  })
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: local.endpoint,
    VITE_SUPABASE_ANON_KEY: local.anonKey,
    VITE_REVIEW_HARNESS: 'false',
    GITHUB_PAGES: 'false',
    VITE_COMMERCIAL_RESEARCH_REVIEW: 'false',
    VITE_PARTNER_EMAIL_PROVIDER_ENABLED: 'false',
    VITE_PARTNER_MEDIA_PROVIDER_ENABLED: 'false',
    VITE_BROWSE_MAP_ENABLED: 'false',
    CONFIGURED_SHOPPER_INPUT: secretFile,
    CONFIGURED_SHOPPER_OUTPUT: output.directory,
  }
  const build = path.join(local.directory, 'browser-dist')
  await command(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', build], {
    env,
    signal: controller.signal,
  })
  const mediaDirectory = path.join(build, 'assets/synthetic/stores')
  fs.mkdirSync(mediaDirectory, { recursive: true })
  for (const [source, destination] of media)
    fs.copyFileSync(
      path.join(ROOT, 'public/images/synthetic-stores/1280w', source),
      path.join(mediaDirectory, destination),
    )
  server = spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      build,
      '--host',
      '127.0.0.1',
      '--port',
      new URL(origin).port,
      '--strictPort',
    ],
    { cwd: ROOT, env, windowsHide: true, stdio: 'ignore' },
  )
  server.on('error', () => {})
  let ready = false
  for (let n = 0; n < 60; n++) {
    controller.signal.throwIfAborted()
    try {
      if ((await fetch(origin)).ok) {
        ready = true
        break
      }
    } catch {
      /* readiness */
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Configured preview unavailable')
  console.log(`Configured browser ready: ${origin}`)
  if (process.argv.includes('--inspect'))
    await new Promise((resolve) => setTimeout(resolve, 60_000))
  try {
    await command(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'e2e/configured-free-shopper-playwright.config.ts',
      ],
      { env, timeout: 900_000, signal: controller.signal },
    )
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.errors.push(redact(error.message))
  }
  const resultPath = path.join(output.directory, 'playwright.json')
  if (!fs.existsSync(resultPath)) {
    report.status = 'unavailable'
    report.errors.push('Missing Playwright report')
  } else {
    const results = browserReport(fs.readFileSync(resultPath, 'utf8'))
    report.stats = results.stats
    report.checks = results.checks
    if (results.status !== 'passed') report.status = 'failed'
  }
} catch (error) {
  report.status = 'failed'
  report.errors.push(redact(error.message))
} finally {
  await stopChild(server)
  if (service) {
    try {
      fs.rmSync(path.join(service.run.directory, 'browser-input.json'), { force: true })
    } catch (error) {
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
    try {
      report.cleanup = await service.cleanup()
    } catch (error) {
      report.cleanup = 'failed'
      report.status = 'failed'
      report.errors.push(redact(error.message))
    }
  }
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', interrupt)
  fs.writeFileSync(
    path.join(output.directory, 'report.json'),
    JSON.stringify(redact(report), null, 2),
  )
}
console.log(`${report.status}: ${output.directory}`)
process.exitCode = report.status === 'passed' ? 0 : 1
