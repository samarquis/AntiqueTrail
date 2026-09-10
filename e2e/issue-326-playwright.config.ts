import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'persona-admin-recovery.spec.ts',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:41826', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 41826',
    url: 'http://127.0.0.1:41826/review',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
})
