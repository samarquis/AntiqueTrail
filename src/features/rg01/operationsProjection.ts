export type RG01RunState = 'collecting' | 'frozen' | 'signed' | 'rejected'
export type RG01PurgeStatus = 'not_due' | 'due' | 'overdue' | 'purged'
export type RG01ReceiptStatus = 'none' | 'signed' | 'rejected'
export type RG01SupersessionStatus = 'none' | 'supersedes' | 'superseded'

export const RG01_METRIC_CODES = [
  'first_trip_shoppers',
  'second_trip_shoppers',
  'active_listings',
  'current_listings',
  'flyer_locations',
  'open_critical_defects',
  'new_support_cases',
  'qualifying_trips',
  'claim_approved',
  'claim_rejected',
  'claim_abusive',
] as const

export type RG01MetricCode = (typeof RG01_METRIC_CODES)[number]

export interface RG01RunProjection {
  runId: string
  state: RG01RunState
  windowStart: string
  windowEnd: string
  sourceCutoff: string | null
  currentSource: boolean
  manifestDigest: string | null
  blockers: readonly string[]
  metrics: Readonly<Partial<Record<RG01MetricCode, number>>>
  receiptId: string | null
  receiptStatus: RG01ReceiptStatus
  supersedesReceiptId: string | null
  supersessionStatus: RG01SupersessionStatus
  linkagePurgeDueAt: string | null
  purgeStatus: RG01PurgeStatus
  linkagePurged: boolean
}

export interface RG01OperationalProjection {
  collectionEnabled: boolean
  permissions: {
    prepare: boolean
    freeze: boolean
    sign: boolean
  }
  run: RG01RunProjection | null
  runs: readonly RG01RunProjection[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const DIGEST = /^[0-9a-f]{64}$/u
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/u
const RUN_STATES = new Set<RG01RunState>(['collecting', 'frozen', 'signed', 'rejected'])
const PURGE_STATUSES = new Set<RG01PurgeStatus>(['not_due', 'due', 'overdue', 'purged'])
const RECEIPT_STATUSES = new Set<RG01ReceiptStatus>(['none', 'signed', 'rejected'])
const SUPERSESSION_STATUSES = new Set<RG01SupersessionStatus>(['none', 'supersedes', 'superseded'])

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown, pattern?: RegExp): string | null {
  if (value === null || value === undefined) return null
  return typeof value === 'string' && (!pattern || pattern.test(value)) ? value : null
}

function requiredString(value: unknown, pattern?: RegExp): string | null {
  return typeof value === 'string' && (!pattern || pattern.test(value)) ? value : null
}

function run(value: unknown): RG01RunProjection | null {
  const input = record(value)
  if (!input) return null
  const runId = requiredString(input.runId, UUID)
  const state = input.state
  const windowStart = requiredString(input.windowStart, ISO_DATE)
  const windowEnd = requiredString(input.windowEnd, ISO_DATE)
  const sourceCutoff = optionalString(input.sourceCutoff, ISO_DATE)
  const manifestDigest = optionalString(input.manifestDigest, DIGEST)
  const blockers = input.blockers
  const metrics = record(input.metrics)
  const receiptStatus = input.receiptStatus
  const supersessionStatus = input.supersessionStatus
  const purgeStatus = input.purgeStatus
  if (
    !runId ||
    typeof state !== 'string' ||
    !RUN_STATES.has(state as RG01RunState) ||
    !windowStart ||
    !windowEnd ||
    typeof input.currentSource !== 'boolean' ||
    (input.manifestDigest !== null && input.manifestDigest !== undefined && !manifestDigest) ||
    !Array.isArray(blockers) ||
    blockers.some((item) => typeof item !== 'string' || item.length > 120) ||
    !metrics ||
    (typeof input.receiptId !== 'string' && input.receiptId !== null) ||
    (input.receiptId !== null && !UUID.test(String(input.receiptId))) ||
    typeof receiptStatus !== 'string' ||
    !RECEIPT_STATUSES.has(receiptStatus as RG01ReceiptStatus) ||
    (typeof input.supersedesReceiptId !== 'string' && input.supersedesReceiptId !== null) ||
    (input.supersedesReceiptId !== null && !UUID.test(String(input.supersedesReceiptId))) ||
    typeof supersessionStatus !== 'string' ||
    !SUPERSESSION_STATUSES.has(supersessionStatus as RG01SupersessionStatus) ||
    typeof purgeStatus !== 'string' ||
    !PURGE_STATUSES.has(purgeStatus as RG01PurgeStatus) ||
    typeof input.linkagePurged !== 'boolean'
  )
    return null

  const safeMetrics: Partial<Record<RG01MetricCode, number>> = {}
  for (const code of RG01_METRIC_CODES) {
    const metric = metrics[code]
    if (metric !== undefined) {
      if (typeof metric !== 'number' || !Number.isSafeInteger(metric) || metric < 0) return null
      safeMetrics[code] = metric
    }
  }
  return {
    runId,
    state: state as RG01RunState,
    windowStart,
    windowEnd,
    sourceCutoff,
    currentSource: input.currentSource,
    manifestDigest,
    blockers: blockers as string[],
    metrics: safeMetrics,
    receiptId: input.receiptId as string | null,
    receiptStatus: receiptStatus as RG01ReceiptStatus,
    supersedesReceiptId: input.supersedesReceiptId as string | null,
    supersessionStatus: supersessionStatus as RG01SupersessionStatus,
    linkagePurgeDueAt: optionalString(input.linkagePurgeDueAt, ISO_DATE),
    purgeStatus: purgeStatus as RG01PurgeStatus,
    linkagePurged: input.linkagePurged,
  }
}

export function projectRG01Status(value: unknown): RG01OperationalProjection {
  const input = record(value)
  const permissions = record(input?.permissions)
  const runs = input?.runs
  const projectedRuns = Array.isArray(runs) ? runs.map(run).filter(Boolean) : []
  const projectedRun = input?.run === null || input?.run === undefined ? null : run(input.run)
  if (
    !input ||
    typeof input.collectionEnabled !== 'boolean' ||
    !permissions ||
    typeof permissions.prepare !== 'boolean' ||
    typeof permissions.freeze !== 'boolean' ||
    typeof permissions.sign !== 'boolean' ||
    !Array.isArray(runs) ||
    projectedRuns.length !== runs.length ||
    (input.run !== null && input.run !== undefined && !projectedRun)
  )
    throw new Error('RG-01 evidence is unavailable.')
  return {
    collectionEnabled: input.collectionEnabled,
    permissions: {
      prepare: permissions.prepare,
      freeze: permissions.freeze,
      sign: permissions.sign,
    },
    run: projectedRun,
    runs: projectedRuns as RG01RunProjection[],
  }
}
