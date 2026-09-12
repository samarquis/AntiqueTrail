import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  // The dedicated suffix keeps this real-backend diagnostic out of the shared
  // fixture suite without changing the repository Playwright configuration.
  testMatch: 'configured-trip-partner.e2e.ts',
  reporter: [
    ['json', { outputFile: process.env.CONFIGURED_TRIP_PARTNER_OUTPUT + '/playwright.json' }],
  ],
  use: { baseURL: process.env.CONFIGURED_TRIP_PARTNER_ORIGIN, trace: 'retain-on-failure' },
  workers: 1,
  timeout: 60_000,
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
})
