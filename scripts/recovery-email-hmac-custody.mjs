import { generateCatalogCustodySource } from './catalog-custody-recovery.mjs'

// Compile a fixed-purpose handler from the reviewed factory; no runtime selector.
export async function generateRecoveryEmailHmacCustodySource(config) {
  let source = await generateCatalogCustodySource(config)
  for (const [before, after] of [
    [
      "['PUBLIC_CATALOG_GATEWAY_JWT', 'PUBLIC_CATALOG_RATE_SALT']",
      "['RECOVERY_EMAIL_HMAC_SECRET']",
    ],
    ["'x-catalog-custody-nonce'", "'x-recovery-email-hmac-custody-nonce'"],
    ['schemaVersion: 1,', "schemaVersion: 1,\n    purpose: 'recovery-email-hmac-custody',"],
  ]) {
    if (source.split(before).length !== 2) throw new Error('Invalid custody source shape')
    source = source.replace(before, after)
  }
  return source
}
