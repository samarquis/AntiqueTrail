import type {
  BugIntake,
  ReadinessPrerequisite,
  ReadinessReceipt,
  SyntheticTestAccount,
} from './types'

export const GENERIC_READINESS_BLOCKED =
  'External testing is not ready. The required review remains blocked.'
export const EXTERNAL_CAPABILITIES = {
  publicAccess: false,
  promotion: false,
  ownerOutreach: false,
  realStoreImport: false,
  externalProviders: false,
  preciseLocation: false,
  responseCaching: false,
} as const

export function validateTestAccounts(accounts: SyntheticTestAccount[]): boolean {
  const ids = new Set(accounts.map((account) => account.pseudonymousId))
  const roles = new Set(accounts.map((account) => account.role))
  return (
    accounts.length >= 2 &&
    ids.size === accounts.length &&
    roles.has('TestUserA') &&
    roles.has('TestUserB') &&
    accounts.every(
      (account) =>
        account.syntheticOnly &&
        account.separateDevice &&
        account.verifiedEmail &&
        account.age18Attested,
    )
  )
}

export function readinessBlockers(prerequisites: ReadinessPrerequisite[]): ReadinessPrerequisite[] {
  return prerequisites.filter((item) => item.result !== 'pass' || !item.artifactHash)
}

export function canPrepareReceipt(prerequisites: ReadinessPrerequisite[]): boolean {
  return (
    readinessBlockers(prerequisites).length === 0 &&
    Object.values(EXTERNAL_CAPABILITIES).every((enabled) => enabled === false)
  )
}

export function createReadinessReceipt(prerequisites: ReadinessPrerequisite[]): ReadinessReceipt {
  const blockers = readinessBlockers(prerequisites)
  if (blockers.length > 0)
    return {
      state: 'blocked',
      prerequisiteDigest: digest(prerequisites),
      artifactHashes: prerequisites.flatMap((item) =>
        item.artifactHash ? [item.artifactHash] : [],
      ),
      promotionEnabled: false,
      ownerOutreachEnabled: false,
    }
  return {
    state: 'running',
    prerequisiteDigest: digest(prerequisites),
    artifactHashes: prerequisites.flatMap((item) => (item.artifactHash ? [item.artifactHash] : [])),
    promotionEnabled: false,
    ownerOutreachEnabled: false,
  }
}

export function recordBug(
  input: Omit<BugIntake, 'containsPreciseLocation' | 'containsRawEmail'> & { summary: string },
): BugIntake {
  if (/https?:\/\/|@|\b\d{1,3}(?:\.\d{1,3}){3}\b/i.test(input.summary))
    throw new Error('bug_payload_redaction_required')
  return { ...input, containsPreciseLocation: false, containsRawEmail: false }
}

export function canSignReadiness(
  receipt: ReadinessReceipt,
  actor: 'ProductOwner' | 'Administrator',
): boolean {
  return (
    actor === 'ProductOwner' &&
    receipt.state === 'running' &&
    receipt.promotionEnabled === false &&
    receipt.ownerOutreachEnabled === false
  )
}

export function productionPromotionAllowed(): false {
  return false
}
function digest(prerequisites: ReadinessPrerequisite[]): string {
  return `sha256:${prerequisites.map((item) => `${item.id}:${item.result}:${item.artifactHash ?? 'missing'}`).join('|')}`
}
