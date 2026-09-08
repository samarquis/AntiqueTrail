export type OwnConsentState = 'not_consented' | 'consented' | 'withdrawn'

export interface OwnConsentAvailable {
  kind: 'available'
  collectionActive: true
  consentState: OwnConsentState
  consentedAt: string | null
  withdrawnAt: string | null
}

export interface OwnConsentUnavailable {
  kind: 'unavailable'
  collectionActive: boolean
}

export type OwnConsentStatus = OwnConsentAvailable | OwnConsentUnavailable

export const GENERIC_OWN_CONSENT_ERROR =
  'RG-01 participation is unavailable. No consent change was saved.'

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(GENERIC_OWN_CONSENT_ERROR)
  return value as Record<string, unknown>
}

function nullableIso(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error(GENERIC_OWN_CONSENT_ERROR)
  return value
}

export function parseOwnConsentStatus(value: unknown): OwnConsentStatus {
  const record = exactObject(value)
  const keys = Object.keys(record).sort()
  if (record.status === 'unavailable') {
    if (
      keys.join(',') !== 'collectionActive,status' ||
      typeof record.collectionActive !== 'boolean'
    )
      throw new Error(GENERIC_OWN_CONSENT_ERROR)
    return { kind: 'unavailable', collectionActive: record.collectionActive }
  }
  if (
    record.status !== 'available' ||
    keys.join(',') !== 'collectionActive,consentState,consentedAt,status,withdrawnAt' ||
    record.collectionActive !== true ||
    !['not_consented', 'consented', 'withdrawn'].includes(String(record.consentState))
  )
    throw new Error(GENERIC_OWN_CONSENT_ERROR)
  return {
    kind: 'available',
    collectionActive: true,
    consentState: record.consentState as OwnConsentState,
    consentedAt: nullableIso(record.consentedAt),
    withdrawnAt: nullableIso(record.withdrawnAt),
  }
}

export function createOwnConsentClient(rpc: Rpc) {
  const read = async () => parseOwnConsentStatus(await rpc('rg01_get_own_consent', {}))
  return {
    getStatus: read,
    async setConsent(consent: boolean) {
      if (typeof consent !== 'boolean') throw new Error(GENERIC_OWN_CONSENT_ERROR)
      await rpc('rg01_set_own_consent', { p_consent: consent })
      return read()
    },
  }
}

export type OwnConsentClient = ReturnType<typeof createOwnConsentClient>

export const unavailableOwnConsentClient: OwnConsentClient = createOwnConsentClient(async () => {
  throw new Error(GENERIC_OWN_CONSENT_ERROR)
})
