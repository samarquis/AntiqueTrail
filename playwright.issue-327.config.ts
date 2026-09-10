import { defineConfig, devices } from '@playwright/test'

// Isolated from the shared review runner so this diagnostic neither reuses nor
// changes another ticket's server, port, project selection, or report output.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'persona-photo-return.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/evidence/issue-327/latest-results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:43217',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:review -- --host 127.0.0.1 --port 43217',
    url: 'http://127.0.0.1:43217/review',
    reuseExistingServer: false,
    env: { ...process.env, VITE_COMMERCIAL_RESEARCH_REVIEW: 'true' },
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
})
