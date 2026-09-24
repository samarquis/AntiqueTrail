import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const input = JSON.parse(fs.readFileSync(process.env.LOCAL_SIGNUP_INPUT!, 'utf8'))
export default defineConfig({
  testDir: '.',
  testMatch: 'local-signup.spec.ts',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  outputDir: path.join(input.output, 'browser'),
  reporter: [['list'], [path.resolve('scripts/local-signup-reporter.mjs')]],
  use: {
    baseURL: input.origin,
    trace: 'off',
    screenshot: 'off',
    headless: true,
    actionTimeout: 15_000,
  },
})
