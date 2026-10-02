import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createLocalService, command } from './configured-shopper-local.mjs'

const service = createLocalService({ disableStorage: true })
const receipt = {
  sourceSha: (await command('git', ['rev-parse', 'HEAD'])).trim(),
  evidenceClass: 'real-local-database-fake-provider',
  status: 'unavailable',
  cleanup: 'not-started',
  projectId: service.run.projectId,
}
function expand(file) {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^\\ir\s+(.+)$/gm, (_, child) =>
      expand(path.resolve(path.dirname(file), child.trim())),
    )
}
try {
  process.stdout.write(`Run-owned local proof: ${service.run.projectId}\n`)
  await service.start()
  const result = await service.sql(expand('supabase/tests/0132_store_owner_access.sql'))
  process.stdout.write(result)
  assert(!/^not ok/m.test(result), 'Owner cancellation pgTAP failed')
  receipt.status = 'passed'
} catch (error) {
  receipt.status = 'failed'
  throw error
} finally {
  receipt.cleanup = await service.cleanup()
  fs.mkdirSync('artifacts/issue-426', { recursive: true })
  fs.writeFileSync('artifacts/issue-426/database.json', JSON.stringify(receipt, null, 2))
  process.stdout.write(`Proof ${receipt.status}; cleanup ${receipt.cleanup}\n`)
}
