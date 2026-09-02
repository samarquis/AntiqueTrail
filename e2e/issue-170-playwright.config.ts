import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'issue-170-public-free-claim.spec.ts',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4177',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4177',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
