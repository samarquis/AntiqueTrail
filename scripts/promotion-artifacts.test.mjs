import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import {
  previewOrigin,
  renderPromotionCard,
  validateQrDestination,
} from './promotion-artifacts.mjs'

test('both printed QR images decode to the exact labeled plain-URL fallback', async () => {
  for (const kind of ['shopper', 'owner']) {
    const html = await renderPromotionCard(kind)
    const data = /src="data:image\/png;base64,([^"]+)"/.exec(html)?.[1]
    assert.ok(data)
    const png = PNG.sync.read(Buffer.from(data, 'base64'))
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
    assert.ok(decoded)
    assert.equal(validateQrDestination(kind, decoded.data), decoded.data)
    assert.ok(html.includes(`>${decoded.data}</a>`))
    assert.ok(html.includes('Do Not Distribute'))
    assert.ok(html.includes('font-size:16pt'))
    // The rendered PNG has a white four-module quiet zone and black/white pixels only.
    assert.equal(png.data[0], 255)
    for (let i = 0; i < png.data.length; i += 4) {
      assert.ok(png.data[i] === 0 || png.data[i] === 255)
      assert.equal(png.data[i], png.data[i + 1])
      assert.equal(png.data[i], png.data[i + 2])
    }
  }
})

test('public classes reject repurposing, token, source, origin and canonicalization tricks', () => {
  for (const path of [
    '/for-stores#token=abcdefghijklmnop',
    '/for-stores?src=account123',
    '/for-stores?email=a',
    '/stores?area=topeka-ks',
    '/for-stores/',
    '/%66or-stores',
  ])
    assert.throws(() => validateQrDestination('owner', previewOrigin + path))
  for (const url of [
    'http://antique-trail.example/for-stores',
    'https://user@antique-trail.example/for-stores',
    'https://evil.example/for-stores',
  ])
    assert.throws(() => validateQrDestination('owner', url))
})

test('approved invitation class stays distinct and cannot be printed as public promotion', async () => {
  for (const path of ['/partner/join', '/readiness/join']) {
    const url = previewOrigin + path + '#token=abcdefghijklmnop'
    assert.equal(validateQrDestination('invitation', url), url)
    assert.throws(() => validateQrDestination('owner', url))
    assert.throws(() => validateQrDestination('invitation', url.replace('#', '?src=public#')))
  }
  await assert.rejects(renderPromotionCard('invitation'))
  assert.throws(() =>
    validateQrDestination('invitation', previewOrigin + '/for-stores#token=abcdefghijklmnop'),
  )
})
