import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const inputPath = process.env.CONFIGURED_OWNER_MEDIA_INPUT
if (!inputPath) throw new Error('CONFIGURED_OWNER_MEDIA_INPUT is required')
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as { origin: string; output: string }

export default defineConfig({
  testDir: '.',
  testMatch: 'issue-580-owner-media-replacement.spec.ts',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  outputDir: path.join(input.output, 'browser'),
  reporter: [['list'], ['json', { outputFile: path.join(input.output, 'playwright.json') }]],
  use: {
    baseURL: input.origin,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    headless: true,
    actionTimeout: 15_000,
    viewport: { width: 1440, height: 1000 },
  },
})
