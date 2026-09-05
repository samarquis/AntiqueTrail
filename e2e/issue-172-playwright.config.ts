import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'issue-172-for-stores.spec.ts',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4179',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } },
    },
  ],
})
