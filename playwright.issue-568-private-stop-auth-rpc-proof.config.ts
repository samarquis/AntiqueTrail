import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const origin = process.env.ISSUE_568_PRIVATE_STOP_ORIGIN
const rawReport = process.env.ISSUE_568_PRIVATE_STOP_RAW_REPORT

if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin) || !rawReport)
  throw new Error('Private-stop proof runtime is unavailable')

export default defineConfig({
  testDir: './e2e',
  testMatch: 'issue-568-private-stop-auth-rpc-proof.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['json', { outputFile: rawReport }]],
  outputDir: path.join(path.dirname(rawReport), 'playwright-output'),
  expect: { timeout: 15_000 },
  timeout: 90_000,
  use: {
    baseURL: origin,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } }],
})
