import QRCode from 'qrcode'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import process from 'node:process'

export const previewOrigin = 'https://antique-trail.example'
const destinations = { shopper: '/stores?area=topeka-ks', owner: '/for-stores' }

// Public print production is deliberately limited to private, untracked fixtures.
// Real domains, source codes and distribution require the Package 10B gate (#56).
export function validateQrDestination(kind, value, origin = previewOrigin) {
  const base = new URL(origin)
  const url = new URL(value)
  if (
    base.protocol !== 'https:' ||
    base.origin !== origin ||
    url.origin !== origin ||
    url.username ||
    url.password
  )
    throw new Error('Invalid QR origin')
  if (kind === 'shopper' || kind === 'owner') {
    if (value !== origin + destinations[kind]) throw new Error('Invalid public QR destination')
  } else if (kind === 'invitation') {
    if (
      !['/partner/join', '/readiness/join'].includes(url.pathname) ||
      url.search ||
      !/^#token=[A-Za-z0-9_-]{16,256}$/.test(url.hash)
    )
      throw new Error('Invalid secure invitation destination')
  } else throw new Error('Invalid QR class')
  return value
}

export async function renderPromotionCard(kind) {
  if (kind !== 'shopper' && kind !== 'owner')
    throw new Error('Secure invitations must use the approved invitation issuer')
  const destination = validateQrDestination(kind, previewOrigin + destinations[kind])
  const qr = await QRCode.toDataURL(destination, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 600,
  })
  const label = kind === 'shopper' ? 'Shop antique stores' : 'Add your store'
  const promise =
    kind === 'shopper'
      ? 'Find Topeka antique stores, see when information was verified, and build a practical day before stores close.'
      : 'Help antique shoppers find your store—and make it part of the trip.'
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${label} — private print preview</title>
<style>@page{size:letter;margin:.75in}*{box-sizing:border-box}body{margin:auto;padding:24px;max-width:720px;background:white;color:black;font:20px/1.5 Arial,sans-serif}h1{font-size:36px;line-height:1.2}p{overflow-wrap:anywhere}.status{border:3px solid black;padding:12px;font-weight:bold}img{display:block;width:2in;height:2in;max-width:100%;object-fit:contain}a{color:black;text-decoration:underline}@media print{body{padding:0;font-size:16pt}h1{font-size:28pt}.status{font-size:16pt}}</style>
<main><p class="status">Do Not Distribute — synthetic destination; private test only</p><p>Antique Trail</p><h1>${label}</h1><p>${promise}</p>${kind === 'owner' ? '<p>Free plan available · No sales commission · Keep key store details current</p><p>For eligible antique/vintage stores in Topeka, Kansas.</p>' : ''}<img src="${qr}" alt="${label}: QR code to the printed address below"><p><a href="${destination}">${destination}</a></p><p>This preview is not evidence of store participation or permission to print, post, or distribute.</p></main></html>`
}

export async function writePromotionPreviews(directory) {
  await mkdir(directory, { recursive: true })
  for (const kind of ['shopper', 'owner'])
    await writeFile(resolve(directory, `${kind}.html`), await renderPromotionCard(kind), 'utf8')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await writePromotionPreviews(resolve('docs/evidence/issue-173/print'))
