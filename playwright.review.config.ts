import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'catalog.spec.ts',
    'store-details.spec.ts',
    'review-harness.spec.ts',
    'ui05-auth-shopper.spec.ts',
    'ui06-candidate-flows.spec.ts',
    'ui07-trip-flows.spec.ts',
    'ui08-partner-portal.spec.ts',
    'ui09-admin-moderation.spec.ts',
    'ui10-full-spec.spec.ts',
    'theme.spec.ts',
    'issue-144-typography.spec.ts',
    'issue-143-media-overlay.spec.ts',
    'issue-147-catalog-metadata.spec.ts',
    'issue-175-commercial-research.spec.ts',
  ],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  // Dev-server readiness (index.html 200) precedes the lazy first-hit module
  // compile, so assertions must tolerate a multi-second cold start.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174/review',
    reuseExistingServer: false,
    env: { ...process.env, VITE_COMMERCIAL_RESEARCH_REVIEW: 'true' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
