import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { get } from 'node:http'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const evidenceDirectory = path.join(root, 'docs', 'evidence', 'ui-03')

async function reservePort() {
  const server = createServer()
  server.unref()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not reserve a Vite port')
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

async function waitForApp(url, process, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Vite exited before the review app was ready (code ${process.exitCode})`)
    }

    try {
      const response = await new Promise((resolve, reject) => {
        const request = get(url, (incoming) => {
          const chunks = []
          incoming.on('data', (chunk) => chunks.push(chunk))
          incoming.on('end', () =>
            resolve({
              body: Buffer.concat(chunks).toString('utf8'),
              status: incoming.statusCode,
            }),
          )
        })
        request.on('error', reject)
      })
      if (response.status === 200 && response.body.includes('Antique Trail')) return
      lastError = new Error(`Unexpected response from ${url}: HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(200)
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'unknown error'}`)
}

async function stopProcess(process) {
  if (process.exitCode !== null) return
  process.kill('SIGTERM')
  await Promise.race([once(process, 'exit'), delay(5_000)])
  if (process.exitCode === null) process.kill('SIGKILL')
}

async function expectCount(locator, expected, label) {
  const count = await locator.count()
  if (count !== expected) throw new Error(`Expected ${expected} ${label}, found ${count}`)
}

async function loadAndVerifyImages(locator, expected, label) {
  await expectCount(locator, expected, label)
  const sources = []

  for (let index = 0; index < expected; index += 1) {
    const image = locator.nth(index)
    await image.scrollIntoViewIfNeeded()
    await image.waitFor({ state: 'visible' })
    await image.evaluate(async (element) => {
      if (element.tagName !== 'IMG') throw new Error('Expected an HTMLImageElement')
      if (!element.complete) {
        await new Promise((resolve) => {
          element.addEventListener('load', resolve, { once: true })
          element.addEventListener('error', resolve, { once: true })
        })
      }
    })
    const result = await image.evaluate((element) => ({
      alt: element.alt,
      currentSrc: element.currentSrc,
      naturalHeight: element.naturalHeight,
      naturalWidth: element.naturalWidth,
    }))
    if (result.naturalWidth <= 0 || result.naturalHeight <= 0) {
      throw new Error(`${label} ${index + 1} did not decode: ${JSON.stringify(result)}`)
    }
    sources.push(result.currentSrc)
  }

  return sources
}

async function captureBrowse(browser, baseURL, name, viewport) {
  const page = await browser.newPage({ viewport })
  try {
    await page.goto(`${baseURL}/stores`, { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('heading', { level: 2, name: '12 stores to explore' })
      .waitFor({ state: 'visible' })
    const cards = page.locator('.catalog-card')
    await cards.nth(11).waitFor({ state: 'visible' })
    await expectCount(cards, 12, 'store cards')
    const sources = await loadAndVerifyImages(
      page.locator('.catalog-card .catalog-card__image'),
      12,
      'store cover images',
    )
    if (new Set(sources).size !== 12) {
      throw new Error(`Expected 12 distinct store cover sources, found ${new Set(sources).size}`)
    }
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    await page.screenshot({
      path: path.join(evidenceDirectory, `browse-${name}.png`),
      fullPage: true,
    })
    return {
      file: `browse-${name}.png`,
      height: await page.evaluate(() => globalThis.document.body.scrollHeight),
    }
  } finally {
    await page.close()
  }
}

async function captureGallery(browser, baseURL) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    await page.goto(`${baseURL}/stores/blue-finch-curios`, { waitUntil: 'domcontentloaded' })
    await page
      .getByRole('heading', { level: 1, name: 'Blue Finch Curios' })
      .waitFor({ state: 'visible' })
    const choices = page.locator('.store-gallery__choices button')
    await choices.nth(3).waitFor({ state: 'visible' })
    await expectCount(choices, 4, 'Blue Finch gallery choices')
    await loadAndVerifyImages(page.locator('.store-gallery img'), 5, 'Blue Finch gallery images')

    for (let index = 0; index < 4; index += 1) {
      await choices.nth(index).click()
      const selected = choices.nth(index)
      if ((await selected.getAttribute('aria-pressed')) !== 'true') {
        throw new Error(`Blue Finch gallery choice ${index + 1} was not selectable`)
      }
      await loadAndVerifyImages(
        page.locator('.store-gallery__hero img'),
        1,
        'selected gallery image',
      )
    }

    await choices.first().click()
    await page.locator('.store-gallery').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(evidenceDirectory, 'blue-finch-gallery-desktop.png'),
      fullPage: true,
    })
    return {
      file: 'blue-finch-gallery-desktop.png',
      height: await page.evaluate(() => globalThis.document.body.scrollHeight),
    }
  } finally {
    await page.close()
  }
}

const port = await reservePort()
const baseURL = `http://127.0.0.1:${port}`
const vite = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
)
let viteOutput = ''
vite.stdout.on('data', (chunk) => (viteOutput += chunk))
vite.stderr.on('data', (chunk) => (viteOutput += chunk))

let browser
try {
  await waitForApp(`${baseURL}/stores`, vite)
  browser = await chromium.launch()
  const results = []
  results.push(await captureBrowse(browser, baseURL, 'desktop', { width: 1440, height: 1000 }))
  results.push(await captureBrowse(browser, baseURL, 'tablet', { width: 768, height: 1024 }))
  results.push(await captureBrowse(browser, baseURL, 'mobile', { width: 390, height: 844 }))
  results.push(await captureGallery(browser, baseURL))
  process.stdout.write(`${JSON.stringify({ baseURL, captures: results }, null, 2)}\n`)
} catch (error) {
  if (viteOutput) process.stderr.write(`${viteOutput.trim()}\n`)
  throw error
} finally {
  await browser?.close()
  await stopProcess(vite)
}
