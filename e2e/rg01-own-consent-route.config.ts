import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'rg01-own-consent-route.spec.ts',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://127.0.0.1:42300', trace: 'on-first-retry' },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 42300',
    url: 'http://127.0.0.1:42300',
    reuseExistingServer: false,
    env: { ...process.env, VITE_REVIEW_HARNESS: 'true' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } },
    },
  ],
})
