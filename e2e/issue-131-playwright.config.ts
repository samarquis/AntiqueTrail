import { defineConfig } from '@playwright/test'
import base from '../playwright.config'

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'issue-131-view-audit.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4181' },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4181',
    url: 'http://127.0.0.1:4181',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
