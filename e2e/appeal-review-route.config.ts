import { defineConfig, devices } from '@playwright/test'
import base from '../playwright.config'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'appeal-review-route.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:42260' },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 42260',
    url: 'http://127.0.0.1:42260/appeal-review',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
