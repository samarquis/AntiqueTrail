import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'persona-partner-acceptance.spec.ts',
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:43220',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 43220',
    url: 'http://127.0.0.1:43220/review',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
})
