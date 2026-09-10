import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'configured-trip-partner.spec.ts',
  reporter: [
    ['json', { outputFile: process.env.CONFIGURED_TRIP_PARTNER_OUTPUT + '/playwright.json' }],
  ],
  use: { baseURL: process.env.CONFIGURED_TRIP_PARTNER_ORIGIN, trace: 'retain-on-failure' },
  timeout: 60_000,
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
})
