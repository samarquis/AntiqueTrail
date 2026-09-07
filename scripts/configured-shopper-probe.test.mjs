import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { COMMANDS, requireLoopbackUrl, runChecks, runProbe } from './configured-shopper-probe.mjs'

test('accepts loopback HTTP and refuses remote targets', () => {
  assert.equal(requireLoopbackUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321')
  assert.throws(() => requireLoopbackUrl('https://example.com'), /refuses non-loopback/)
})

test('continues after one command failure and keeps later results', async () => {
  const report = await runChecks({
    commands: ['first', 'broken', 'last'],
    sourceSha: 'sha',
    schemaIdentity: 'schema',
    execute: async (command) => {
      if (command === 'broken') throw new Error('database private token=eyJsecret')
      return { status: 'pass', detail: command }
    },
  })
  assert.deepEqual(
    report.results.map((result) => result.status),
    ['pass', 'fail', 'pass'],
  )
  assert.match(report.results[1].detail, /REDACTED/)
  assert.doesNotMatch(report.results[1].detail, /eyJsecret/)
})

test('records unavailable setup and run-owned cleanup without a false pass', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'configured-probe-'))
  const report = await runProbe({ output: root, endpoint: 'http://127.0.0.1:54321' })
  assert.equal(report.status, 'unavailable')
  assert.match(report.errors[0], /unavailable/)
  assert.equal(fs.existsSync(path.join(report.directory, '.owner')), true)
  assert.equal(fs.existsSync(path.join(report.directory, 'report.json')), true)
})

test('exposes the complete independent command set', () => {
  assert.deepEqual(COMMANDS, [
    'catalog_list',
    'catalog_details',
    'shopper_save_state',
    'shopper_list_saved',
    'create_trip',
    'get_trip',
    'rename_trip',
    'update_schedule',
    'add_stop',
    'remove_stop',
    'set_priority',
    'set_dwell',
    'reorder_stops',
  ])
})
