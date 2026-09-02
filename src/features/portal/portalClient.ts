import type {
  HolidayHours,
  HoursInterval,
  OfficialLinkPlatform,
  PortalAccessContext,
  PortalAccessFailure,
  PortalClient,
  PortalFreshness,
  PortalHours,
  PortalDiagnostic,
  StoreUpdateDraft,
  PortalControlledChangeDraft,
  PortalManagedFields,
  PortalMediaUploadInput,
  PortalMediaUploadReceipt,
  PortalMediaUploadHistory,
  PortalMediaKind,
  PortalMediaState,
  PortalMediaResubmitInput,
  PortalMediaResubmitReceipt,
  OfficialLink,
  SupportTicketDraft,
} from './types'

export const GENERIC_PORTAL_ERROR = "We couldn't update this store portal. Please try again."
export const PORTAL_ACCESS_ERROR = 'Store Portal access is unavailable for this account or session.'
export const MEDIA_GATE_MESSAGE =
  'Official images and screenshots are disabled until the M-01 media gate passes.'
export const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000

export class PortalMediaCapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PortalMediaCapError'
  }
}

type PortalRpcName =
  | 'portal_get_home'
  | 'portal_get_hours'
  | 'portal_save_hours'
  | 'portal_save_managed_fields'
  | 'portal_submit_controlled_change'
  | 'portal_list_updates'
  | 'portal_create_update'
  | 'portal_archive_update'
  | 'portal_restore_update'
  | 'portal_list_official_links'
  | 'portal_save_official_link'
  | 'portal_remove_official_link'
  | 'portal_list_support_tickets'
  | 'portal_create_support_ticket'
  | 'portal_reply_support_ticket'
  | 'portal_confirm_support_resolution'
  | 'portal_reopen_support_ticket'
  | 'portal_preview_public_listing'
  | 'media_get_capability'
  | 'portal_list_media_uploads'
  | 'portal_resubmit_media'

export interface PortalRpcTransport {
  rpc(
    name: PortalRpcName,
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export interface PortalMediaTransport {
  upload(input: PortalMediaUploadInput): Promise<PortalMediaUploadReceipt>
}

export function createPortalMediaHttpTransport(options: {
  endpoint: string
  apiKey: string
  getAccessToken: () => Promise<string>
  fetcher?: typeof fetch
}): PortalMediaTransport {
  const endpoint = new URL(options.endpoint)
  if (
    (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  )
    throw new Error(GENERIC_PORTAL_ERROR)
  const fetcher = options.fetcher ?? fetch
  return {
    async upload(input) {
      const accessToken = await options.getAccessToken()
      if (!accessToken) throw new Error(GENERIC_PORTAL_ERROR)
      const body = new FormData()
      body.set('image', input.file)
      body.set('altText', input.altText)
      body.set('idempotencyKey', input.idempotencyKey)
      if (input.originalUploadId) {
        body.set('originalUploadId', input.originalUploadId)
      } else {
        body.set('storeId', input.storeId)
        body.set('kind', input.kind)
      }
      body.set('rightsConfirmed', String(input.rightsConfirmed))
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, apikey: options.apiKey },
          body,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        })
        if (!response.headers.get('content-type')?.includes('application/json'))
          throw new Error(GENERIC_PORTAL_ERROR)
        const result = (await response.json()) as {
          error?: unknown
          message?: unknown
          uploadId?: unknown
          state?: unknown
        }
        if (!response.ok) {
          if (
            response.status === 409 &&
            result.error === 'media_cap_exceeded' &&
            typeof result.message === 'string' &&
            result.message.length > 0 &&
            result.message.length <= 240
          )
            throw new PortalMediaCapError(result.message)
          throw new Error(GENERIC_PORTAL_ERROR)
        }
        if (typeof result.uploadId !== 'string' || result.state !== 'awaiting_review')
          throw new Error(GENERIC_PORTAL_ERROR)
        return { uploadId: result.uploadId, state: result.state }
      } catch (error) {
        if (error instanceof PortalMediaCapError) throw error
        throw new Error(GENERIC_PORTAL_ERROR)
      }
    },
  }
}

export function createPortalClient(
  transport: PortalRpcTransport,
  diagnostics: () => PortalDiagnostic[] = () => [],
  media?: PortalMediaTransport,
): PortalClient {
  async function call<T>(
    name: PortalRpcName,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error || result.data === null || result.data === undefined)
        throw new Error(GENERIC_PORTAL_ERROR)
      return result.data as T
    } catch {
      throw new Error(GENERIC_PORTAL_ERROR)
    }
  }
  return {
    getHome: () => call('portal_get_home'),
    getHours: () => call('portal_get_hours'),
    saveHours: (hours) => call('portal_save_hours', { p_hours: hours }),
    saveManagedFields: (fields: PortalManagedFields) =>
      call('portal_save_managed_fields', { p_fields: fields }),
    submitControlledChange: (change: PortalControlledChangeDraft) =>
      call('portal_submit_controlled_change', { p_change: change }),
    getMediaCapability: () => call('media_get_capability'),
    uploadOfficialMedia: async (input) => {
      if (!media) throw new Error(GENERIC_PORTAL_ERROR)
      try {
        const receipt = await media.upload(input)
        if (
          receipt.state !== 'awaiting_review' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            receipt.uploadId,
          )
        )
          throw new Error(GENERIC_PORTAL_ERROR)
        return receipt
      } catch (error) {
        if (error instanceof PortalMediaCapError) throw error
        throw new Error(GENERIC_PORTAL_ERROR)
      }
    },
    listMediaUploads: async (): Promise<PortalMediaUploadHistory> => {
      try {
        return decodePortalMediaUploadHistory(await call<unknown>('portal_list_media_uploads'))
      } catch {
        throw new Error(GENERIC_PORTAL_ERROR)
      }
    },
    resubmitMedia: async (input: PortalMediaResubmitInput): Promise<PortalMediaResubmitReceipt> => {
      if (!media) throw new Error(GENERIC_PORTAL_ERROR)
      try {
        const receipt = await media.upload({
          storeId: input.originalUploadId,
          kind: 'gallery',
          altText: input.altText,
          file: input.file,
          rightsConfirmed: true,
          idempotencyKey: input.idempotencyKey,
          originalUploadId: input.originalUploadId,
        })
        if (
          receipt.state !== 'awaiting_review' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
            receipt.uploadId,
          )
        )
          throw new Error(GENERIC_PORTAL_ERROR)
        return { newUploadId: receipt.uploadId, state: receipt.state }
      } catch {
        throw new Error(GENERIC_PORTAL_ERROR)
      }
    },
    listUpdates: () => call('portal_list_updates'),
    createUpdate: (draft: StoreUpdateDraft) => call('portal_create_update', { p_update: draft }),
    archiveUpdate: (id) => call('portal_archive_update', { p_update_id: id }),
    restoreUpdate: (id) => call('portal_restore_update', { p_update_id: id }),
    listOfficialLinks: () => call('portal_list_official_links'),
    saveOfficialLink: (link: OfficialLink) => call('portal_save_official_link', { p_link: link }),
    removeOfficialLink: async (platform) => {
      await call('portal_remove_official_link', { p_platform: platform })
    },
    listSupportTickets: () => call('portal_list_support_tickets'),
    createSupportTicket: (draft: SupportTicketDraft) =>
      call('portal_create_support_ticket', { p_ticket: draft }),
    replySupportTicket: (ticketId, body) =>
      call('portal_reply_support_ticket', { p_ticket_id: ticketId, p_body: body }),
    confirmSupportResolution: (ticketId) =>
      call('portal_confirm_support_resolution', { p_ticket_id: ticketId }),
    reopenSupportTicket: (ticketId) =>
      call('portal_reopen_support_ticket', { p_ticket_id: ticketId }),
    previewPublicListing: () => call('portal_preview_public_listing'),
    getDiagnostics: async () => diagnostics(),
  }
}

const PORTAL_MEDIA_UPLOAD_KEYS = [
  'altText',
  'kind',
  'rejectionReason',
  'state',
  'submittedAt',
  'uploadId',
] as const

const PORTAL_MEDIA_STATES = new Set<PortalMediaState>([
  'awaiting_review',
  'approved_pending_publish',
  'published',
  'rejected',
  'purged',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function isPortalMediaKind(value: unknown): value is PortalMediaKind {
  return value === 'cover' || value === 'gallery'
}

function isPortalMediaState(value: unknown): value is PortalMediaState {
  return typeof value === 'string' && PORTAL_MEDIA_STATES.has(value as PortalMediaState)
}

export function decodePortalMediaUploadHistory(value: unknown): PortalMediaUploadHistory {
  if (!isRecord(value) || !hasExactKeys(value, ['uploads']) || !Array.isArray(value.uploads))
    throw new Error(GENERIC_PORTAL_ERROR)
  const uploads = value.uploads.map((upload) => {
    if (!isRecord(upload) || !hasExactKeys(upload, PORTAL_MEDIA_UPLOAD_KEYS))
      throw new Error(GENERIC_PORTAL_ERROR)
    if (
      typeof upload.uploadId !== 'string' ||
      !isPortalMediaKind(upload.kind) ||
      !isPortalMediaState(upload.state) ||
      typeof upload.altText !== 'string' ||
      typeof upload.submittedAt !== 'string' ||
      (upload.rejectionReason !== null && typeof upload.rejectionReason !== 'string')
    )
      throw new Error(GENERIC_PORTAL_ERROR)
    return {
      uploadId: upload.uploadId,
      kind: upload.kind,
      state: upload.state,
      altText: upload.altText,
      submittedAt: upload.submittedAt,
      rejectionReason: upload.rejectionReason,
    }
  })
  return { uploads }
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error(GENERIC_PORTAL_ERROR))
}

/** The app boundary intentionally has no provider or public-write implementation yet. */
export const unavailablePortalClient: PortalClient = {
  getHome: unavailable,
  getHours: unavailable,
  saveHours: unavailable,
  saveManagedFields: unavailable,
  submitControlledChange: unavailable,
  getMediaCapability: unavailable,
  uploadOfficialMedia: unavailable,
  listMediaUploads: unavailable,
  resubmitMedia: unavailable,
  listUpdates: unavailable,
  createUpdate: unavailable,
  archiveUpdate: unavailable,
  restoreUpdate: unavailable,
  listOfficialLinks: unavailable,
  saveOfficialLink: unavailable,
  removeOfficialLink: unavailable,
  listSupportTickets: unavailable,
  createSupportTicket: unavailable,
  replySupportTicket: unavailable,
  confirmSupportResolution: unavailable,
  reopenSupportTicket: unavailable,
  previewPublicListing: unavailable,
  getDiagnostics: unavailable,
}

const WEEKDAY_COUNT = 7
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/u
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

export function derivePortalFreshness(
  verifiedAt: string | null | undefined,
  now = new Date(),
): PortalFreshness {
  if (!verifiedAt) return { state: 'unknown', label: 'Verification date unavailable' }
  const verified = new Date(verifiedAt)
  if (Number.isNaN(verified.getTime()))
    return { state: 'unknown', label: 'Verification date unavailable' }
  const daysSinceVerification = Math.max(
    0,
    Math.floor((now.getTime() - verified.getTime()) / (24 * 60 * 60 * 1000)),
  )
  if (daysSinceVerification <= 180) {
    return { state: 'verified', label: 'Verified', verifiedAt, daysSinceVerification }
  }
  if (daysSinceVerification <= 365) {
    return { state: 'overdue', label: 'Verification overdue', verifiedAt, daysSinceVerification }
  }
  return { state: 'stale', label: 'Verification required', verifiedAt, daysSinceVerification }
}

function compareTimes(left: string, right: string): number {
  return left.localeCompare(right)
}

export function validateHours(hours: PortalHours): string[] {
  const errors: string[] = []
  if (!hours.timeZone.trim()) errors.push('Store timezone is required.')
  if (hours.weekly.length !== WEEKDAY_COUNT) errors.push('Provide one schedule for each weekday.')
  hours.weekly.forEach((day) => {
    if (day.isClosed && day.intervals.length > 0)
      errors.push(`${day.label} is closed and cannot have open intervals.`)
    if (day.intervals.length > 2) errors.push(`${day.label} can have at most two intervals.`)
    day.intervals.forEach((interval, index) => {
      if (!TIME_PATTERN.test(interval.opensAt) || !TIME_PATTERN.test(interval.closesAt)) {
        errors.push(`${day.label} interval ${index + 1} must use HH:MM times.`)
      } else if (compareTimes(interval.opensAt, interval.closesAt) >= 0) {
        errors.push(`${day.label} interval ${index + 1} must end after it starts.`)
      }
    })
  })
  hours.holidays.forEach((holiday) => errors.push(...validateHoliday(holiday)))
  if (hours.temporaryClosure) {
    const { startDate, endDate } = hours.temporaryClosure
    if (!DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate))
      errors.push('Temporary closure dates must use YYYY-MM-DD.')
    else if (startDate > endDate) errors.push('Temporary closure must end on or after it starts.')
  }
  return errors
}

function validateHoliday(holiday: HolidayHours): string[] {
  const errors: string[] = []
  if (!DATE_PATTERN.test(holiday.localDate)) errors.push('Holiday date must use YYYY-MM-DD.')
  if (!holiday.label.trim()) errors.push('Holiday label is required.')
  if (holiday.isClosed && holiday.intervals.length > 0)
    errors.push(`${holiday.label || 'Holiday'} is closed and cannot have open intervals.`)
  if (holiday.intervals.length > 2)
    errors.push(`${holiday.label || 'Holiday'} can have at most two intervals.`)
  holiday.intervals.forEach((interval, index) => {
    if (!TIME_PATTERN.test(interval.opensAt) || !TIME_PATTERN.test(interval.closesAt)) {
      errors.push(`${holiday.label || 'Holiday'} interval ${index + 1} must use HH:MM times.`)
    } else if (compareTimes(interval.opensAt, interval.closesAt) >= 0) {
      errors.push(`${holiday.label || 'Holiday'} interval ${index + 1} must end after it starts.`)
    }
  })
  return errors
}

export function copyHoursDay(
  hours: PortalHours,
  sourceWeekday: number,
  targetWeekdays?: number[],
): PortalHours {
  const source = hours.weekly.find((day) => day.weekday === sourceWeekday)
  if (!source) return hours
  const targets =
    targetWeekdays ?? hours.weekly.map((day) => day.weekday).filter((day) => day !== sourceWeekday)
  return {
    ...hours,
    weekly: hours.weekly.map((day) =>
      targets.includes(day.weekday)
        ? {
            ...source,
            weekday: day.weekday,
            label: day.label,
            intervals: source.intervals.map((item) => ({ ...item })),
          }
        : { ...day, intervals: day.intervals.map((item) => ({ ...item })) },
    ),
  }
}

const OFFICIAL_DOMAINS: Record<OfficialLinkPlatform, string[]> = {
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  youtube: ['youtube.com', 'youtu.be'],
  pinterest: ['pinterest.com'],
  tiktok: ['tiktok.com'],
}
const SHORTENER_DOMAINS = new Set([
  'bit.ly',
  'buff.ly',
  'goo.gl',
  'is.gd',
  'ow.ly',
  't.co',
  'tinyurl.com',
])

export function validateOfficialLink(
  platform: OfficialLinkPlatform,
  rawUrl: string,
): { ok: true; normalizedUrl: string } | { ok: false; reason: string } {
  const value = rawUrl.normalize('NFKC').trim()
  if (!value) return { ok: false, reason: 'Enter an official profile URL.' }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: 'Enter a complete official profile URL.' }
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./u, '')
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'Official links must use HTTPS.' }
  if (parsed.username || parsed.password)
    return { ok: false, reason: 'Official links cannot contain credentials.' }
  if (SHORTENER_DOMAINS.has(hostname))
    return { ok: false, reason: 'Shortened links are not accepted; paste the final profile URL.' }
  const supported = OFFICIAL_DOMAINS[platform].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
  if (!supported) return { ok: false, reason: `Use the official ${platform} domain.` }
  parsed.hostname = hostname
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/iu.test(key)) parsed.searchParams.delete(key)
  }
  parsed.hash = ''
  return { ok: true, normalizedUrl: parsed.toString() }
}

export function validateUpdateDraft(draft: StoreUpdateDraft): string[] {
  const errors: string[] = []
  if (!draft.headline.trim()) errors.push('Headline is required.')
  if (!draft.details.trim()) errors.push('Details are required.')
  if (draft.type === 'sale' && !draft.endDate) errors.push('Sales require an end date.')
  if (draft.endDate && !DATE_PATTERN.test(draft.endDate))
    errors.push('End date must use YYYY-MM-DD.')
  if (draft.imageRequested) errors.push(MEDIA_GATE_MESSAGE)
  return errors
}

const DIAGNOSTIC_KEYS: Array<PortalDiagnostic['key']> = [
  'browser',
  'operating_system',
  'app_version',
  'route',
  'connection',
]

export function sanitizeDiagnostics(
  input: Partial<Record<PortalDiagnostic['key'], string>>,
): PortalDiagnostic[] {
  const labels: Record<PortalDiagnostic['key'], string> = {
    browser: 'Browser',
    operating_system: 'Operating system',
    app_version: 'App version',
    route: 'Current screen',
    connection: 'Connection',
  }
  return DIAGNOSTIC_KEYS.flatMap((key) => {
    const raw = input[key]
    if (!raw) return []
    const value = raw
      .normalize('NFKC')
      .replace(/[?&#](?:token|code|secret|key)=[^&#\s]*/giu, '')
      .split('')
      .map((character) => {
        const code = character.codePointAt(0) ?? 0
        return code <= 0x1f || code === 0x7f ? ' ' : character
      })
      .join('')
      .trim()
      .slice(0, 120)
    return value ? [{ key, label: labels[key], value }] : []
  })
}

export function portalAccessFailure(
  access: PortalAccessContext | null,
  storeId: string,
  now = new Date(),
): PortalAccessFailure | null {
  if (!access) return 'no_session'
  if (!access.sessionOpen) return 'session_denied'
  if (access.revoked) return 'revoked'
  if (access.storeId !== storeId) return 'scope_missing'
  if (!access.mfaVerified) return 'mfa_required'
  if (!access.recentAuthAt) return 'recent_auth_required'
  const recentAuth = new Date(access.recentAuthAt)
  if (
    Number.isNaN(recentAuth.getTime()) ||
    now.getTime() - recentAuth.getTime() > RECENT_AUTH_WINDOW_MS
  )
    return 'recent_auth_required'
  return null
}

export function cloneIntervals(intervals: HoursInterval[]): HoursInterval[] {
  return intervals.map((interval) => ({ ...interval }))
}
