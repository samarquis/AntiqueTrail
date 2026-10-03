import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'issue-468-correction-draft.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4185',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4185',
    url: 'http://127.0.0.1:4185/stores',
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_PUBLIC_TEST_CATALOG_ONLY: 'true',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
