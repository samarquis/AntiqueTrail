import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'issue-415-public-status.spec.ts',
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, VITE_COMMERCIAL_RESEARCH_REVIEW: 'true' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
