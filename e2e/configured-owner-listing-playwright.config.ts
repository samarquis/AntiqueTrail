import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const inputPath = process.env.CONFIGURED_OWNER_LISTING_INPUT
if (!inputPath) throw new Error('CONFIGURED_OWNER_LISTING_INPUT is required')
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { origin: string; output: string }
const origin = new URL(input.origin)
if (
  origin.protocol !== 'http:' ||
  origin.hostname !== '127.0.0.1' ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash
)
  throw new Error('Owner listing Playwright accepts literal loopback origins only')

export default defineConfig({
  testDir: '.',
  testMatch: 'configured-owner-listing.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
  expect: { timeout: 12_000 },
  retries: 0,
  outputDir: path.join(input.output, 'browser'),
  reporter: [['list'], ['json', { outputFile: path.join(input.output, 'playwright.json') }]],
  use: {
    baseURL: input.origin,
    browserName: 'chromium',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    headless: true,
    actionTimeout: 15_000,
  },
})
