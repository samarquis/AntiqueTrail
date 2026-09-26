import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { URL, fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const test = fileURLToPath(
  new URL('../src/features/auth/registrationCleanupLocal.test.ts', import.meta.url),
)
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--reporter=verbose', '--silent=false', test],
  {
    cwd: root,
    env: { ...process.env, RUN_LOCAL_REGISTRATION_CLEANUP: '1' },
    stdio: 'inherit',
  },
)

if (result.error) throw result.error
process.exitCode = result.status ?? 1
