import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:5982'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'market-at-macvicar.preview.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5982 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
