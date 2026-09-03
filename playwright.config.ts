import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['review-harness.spec.ts', 'ui05-auth-shopper.spec.ts'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Keep local and hosted retry behavior aligned.
  retries: 2,
  timeout: 60_000,
  workers: 2,
  reporter: process.env.CI ? 'github' : 'list',
  // Vite compiles the full module graph on the first navigation after the
  // per-run server boot; the default 5s expect timeout is too short for that
  // cold transform, which flakes the first tests in a run.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    // The browser contract suite uses deterministic review identities and
    // state fixtures. Start Vite in review mode so those fixtures are present
    // in CI as well as local runs.
    command: 'npm run dev:review -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    // Never reuse a server started in normal mode; review fixtures must match
    // the command above for deterministic local and CI runs.
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
