import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const input = JSON.parse(fs.readFileSync(process.env.CONFIGURED_ADMIN_SCOPE_INPUT!, 'utf8'))
export default defineConfig({
  testDir: '.',
  testMatch: 'configured-admin-scope.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 12_000 },
  outputDir: path.join(input.output, 'browser'),
  reporter: [['list'], ['json', { outputFile: path.join(input.output, 'playwright.json') }]],
  use: {
    baseURL: input.origin,
    trace: 'retain-on-failure',
    screenshot: 'on',
    headless: true,
    actionTimeout: 15_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
})
