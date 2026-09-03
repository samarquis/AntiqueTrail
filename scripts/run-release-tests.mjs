import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

const scriptsDirectory = fileURLToPath(new URL('.', import.meta.url))
const testFiles = readdirSync(scriptsDirectory, { recursive: true })
  .filter((file) => file.endsWith('.test.mjs'))
  .map((file) => fileURLToPath(new URL(file.replaceAll('\\', '/'), import.meta.url)))

if (testFiles.length === 0) {
  throw new Error('No release test files were found.')
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
