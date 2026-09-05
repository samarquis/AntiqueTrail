export const APPLICATION_ERROR = 'This store application is unavailable. Please try again.'

export interface StoreApplicationDraft {
  name: string
  address: string
  areaId: string
  categoryId: string
  summary: string
  description: string
  phone: string
  website: string
  ownerConfirmed: boolean
  hours: Array<{ day: number; closed: boolean; opens: string; closes: string }>
}
export type ApplicationState =
  | 'draft'
  | 'submitted'
  | 'verification_pending'
  | 'changes_requested'
  | 'duplicate_review'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
export interface StoreApplication {
  applicationId: string
  state: ApplicationState
  version: number
  draft: StoreApplicationDraft | null
  categoryLabel: string | null
  matches: ApplicationSearch['matches']
  matchedStoreId: string | null
  storeId: string | null
  claimId: string | null
}
type Choice = { id: string; label: string }
export interface ApplicationSearch {
  searchId: string
  matches: Array<{ storeId: string; name: string; address: string }>
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(APPLICATION_ERROR)
  return Object.fromEntries(Object.entries(value))
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error(APPLICATION_ERROR)
  return value
}
function id(value: unknown): string {
  const result = text(value)
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result))
    throw new Error(APPLICATION_ERROR)
  return result
}
function nullableId(value: unknown): string | null {
  return value === null ? null : id(value)
}
function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error(APPLICATION_ERROR)
  return value.map(parse)
}
function state(value: unknown): ApplicationState {
  switch (value) {
    case 'draft':
    case 'submitted':
    case 'verification_pending':
    case 'changes_requested':
    case 'duplicate_review':
    case 'approved':
    case 'rejected':
    case 'withdrawn':
      return value
    default:
      throw new Error(APPLICATION_ERROR)
  }
}
export function parseApplicationDraft(value: unknown): StoreApplicationDraft {
  const d = object(value)
  if (typeof d.ownerConfirmed !== 'boolean') throw new Error(APPLICATION_ERROR)
  return {
    name: text(d.name),
    address: text(d.address),
    areaId: id(d.areaId),
    categoryId: text(d.categoryId),
    summary: text(d.summary),
    description: text(d.description),
    phone: text(d.phone),
    website: text(d.website),
    ownerConfirmed: d.ownerConfirmed,
    hours: list(d.hours, (value) => {
      const h = object(value)
      if (
        typeof h.day !== 'number' ||
        !Number.isInteger(h.day) ||
        h.day < 1 ||
        h.day > 7 ||
        typeof h.closed !== 'boolean'
      )
        throw new Error(APPLICATION_ERROR)
      return { day: h.day, closed: h.closed, opens: text(h.opens), closes: text(h.closes) }
    }),
  }
}
function application(value: unknown): StoreApplication {
  const a = object(value)
  if (typeof a.version !== 'number' || !Number.isSafeInteger(a.version) || a.version < 1)
    throw new Error(APPLICATION_ERROR)
  const parsed = {
    applicationId: id(a.applicationId),
    state: state(a.state),
    version: a.version,
    draft: a.draft === null ? null : parseApplicationDraft(a.draft),
    matches: list(a.matches, (value) => {
      const match = object(value)
      return { storeId: id(match.storeId), name: text(match.name), address: text(match.address) }
    }),
    categoryLabel: a.categoryLabel === null ? null : text(a.categoryLabel),
    matchedStoreId: nullableId(a.matchedStoreId),
    storeId: nullableId(a.storeId),
    claimId: nullableId(a.claimId),
  }
  if (!['approved', 'rejected', 'withdrawn'].includes(parsed.state) && !parsed.draft)
    throw new Error(APPLICATION_ERROR)
  return parsed
}

export function createStoreApplicationClient(
  invoke: (operation: string, payload: Readonly<Record<string, unknown>>) => Promise<unknown>,
) {
  async function call(operation: string, payload: Readonly<Record<string, unknown>> = {}) {
    try {
      return await invoke(operation, payload)
    } catch {
      throw new Error(APPLICATION_ERROR)
    }
  }
  return {
    async options(): Promise<{ areas: Choice[]; categories: Choice[] }> {
      const result = object(await call('options'))
      const choice = (value: unknown) => {
        const row = object(value)
        return { id: id(row.id), label: text(row.label) }
      }
      return { areas: list(result.areas, choice), categories: list(result.categories, choice) }
    },
    async search(draft: StoreApplicationDraft): Promise<ApplicationSearch> {
      const result = object(await call('search', { draft }))
      return {
        searchId: id(result.searchId),
        matches: list(result.matches, (value) => {
          const match = object(value)
          return {
            storeId: id(match.storeId),
            name: text(match.name),
            address: text(match.address),
          }
        }),
      }
    },
    async start(draft: StoreApplicationDraft, searchId: string) {
      return application(await call('start', { draft, searchId }))
    },
    async status(applicationId?: string) {
      const result = await call('status', { applicationId })
      return result === null ? null : application(result)
    },
    async save(current: StoreApplication, draft: StoreApplicationDraft) {
      return application(
        await call('save', {
          applicationId: current.applicationId,
          version: current.version,
          draft,
        }),
      )
    },
    async signal(current: StoreApplication, channelClass: string, evidenceReference: string) {
      return application(
        await call('signal', {
          applicationId: current.applicationId,
          version: current.version,
          channelClass,
          evidenceReference,
        }),
      )
    },
    async submit(current: StoreApplication) {
      return application(
        await call('submit', { applicationId: current.applicationId, version: current.version }),
      )
    },
    async withdraw(current: StoreApplication) {
      return application(
        await call('withdraw', { applicationId: current.applicationId, version: current.version }),
      )
    },
    async convert(current: StoreApplication, storeId: string) {
      return application(
        await call('convert', {
          applicationId: current.applicationId,
          version: current.version,
          storeId,
          confirmed: true,
        }),
      )
    },
  }
}
export type StoreApplicationClient = ReturnType<typeof createStoreApplicationClient>
export const unavailableStoreApplicationClient = createStoreApplicationClient(async () => {
  throw new Error(APPLICATION_ERROR)
})

export type ApplicationAdminOperation =
  | 'verify_signal'
  | 'verify'
  | 'approve'
  | 'changes'
  | 'reject'
export function createStoreApplicationAdminClient(
  invoke: (operation: string, payload: Readonly<Record<string, unknown>>) => Promise<unknown>,
) {
  return {
    async read(applicationId: string) {
      try {
        return application(await invoke('read', { applicationId }))
      } catch {
        throw new Error(APPLICATION_ERROR)
      }
    },
    async command(
      operation: ApplicationAdminOperation,
      current: StoreApplication,
      details: Readonly<Record<string, unknown>>,
    ) {
      try {
        return application(
          await invoke(operation, {
            ...details,
            applicationId: current.applicationId,
            version: current.version,
          }),
        )
      } catch {
        throw new Error(APPLICATION_ERROR)
      }
    },
  }
}
export type StoreApplicationAdminClient = ReturnType<typeof createStoreApplicationAdminClient>
export const unavailableStoreApplicationAdminClient = createStoreApplicationAdminClient(
  async () => {
    throw new Error(APPLICATION_ERROR)
  },
)
