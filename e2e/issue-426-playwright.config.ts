import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'issue-426-owner-cancellation.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:4196', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4196 --strictPort',
    url: 'http://127.0.0.1:4196',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 740 } },
    },
  ],
})
