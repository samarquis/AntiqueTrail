export type PortalListingState = 'active' | 'temporarily_closed' | 'permanently_closed'
export type PortalFreshnessState = 'verified' | 'overdue' | 'stale' | 'unknown'
export type PortalChangeState = 'pending' | 'changes_requested' | 'approved' | 'rejected'

export interface PortalFreshness {
  state: PortalFreshnessState
  label: string
  verifiedAt?: string
  daysSinceVerification?: number
}

export interface PortalProvenance {
  sourceLabel: string
  verifiedBy: string
  verifiedAt: string
  ownerConfirmed: boolean
}

export interface PortalPendingChange {
  id: string
  field:
    | 'name'
    | 'address'
    | 'coordinates'
    | 'ownership'
    | 'permanent_closure'
    | 'categories'
    | 'official_media'
  requestedValue: string
  state: PortalChangeState
  submittedAt: string
}

export interface PortalHomeSnapshot {
  store: {
    id: string
    name: string
    listingState: PortalListingState
    timeZone: string
  }
  freshness: PortalFreshness
  provenance: PortalProvenance
  pendingChanges: PortalPendingChange[]
}

export interface HoursInterval {
  opensAt: string
  closesAt: string
}

export interface WeeklyHoursDay {
  weekday: number
  label: string
  isClosed: boolean
  intervals: HoursInterval[]
}

export interface HolidayHours {
  localDate: string
  label: string
  isClosed: boolean
  intervals: HoursInterval[]
}

export interface TemporaryClosure {
  startDate: string
  endDate: string
  reason?: string
}

export interface PortalHours {
  timeZone: string
  weekly: WeeklyHoursDay[]
  holidays: HolidayHours[]
  temporaryClosure?: TemporaryClosure
  version: number
}

export interface PortalManagedFields {
  phone: string
  website: string
  description: string
  temporaryClosure?: TemporaryClosure
}

export type PortalControlledField = PortalPendingChange['field']

export interface PortalControlledChangeDraft {
  field: PortalControlledField
  requestedValue: string
  reason: string
}

export interface PortalMediaCapability {
  enabled: boolean
  source: 'server'
}

export type PortalMediaKind = 'cover' | 'gallery'

export interface PortalMediaUploadInput {
  storeId: string
  kind: PortalMediaKind
  altText: string
  file: File
  rightsConfirmed: true
  idempotencyKey: string
}

export interface PortalMediaUploadReceipt {
  uploadId: string
  state: 'awaiting_review'
}

export type StoreUpdateType = 'new_finds' | 'sale' | 'announcement' | 'store_news'
export type StoreUpdateState = 'live' | 'archived' | 'pending_review'

export interface StoreUpdateDraft {
  type: StoreUpdateType
  headline: string
  details: string
  vendorLabel?: string
  sourceUrl?: string
  endDate?: string
  imageRequested?: boolean
}

export interface StoreUpdate extends StoreUpdateDraft {
  id: string
  state: StoreUpdateState
  publishedAt?: string
  archivedAt?: string
}

export type OfficialLinkPlatform = 'facebook' | 'instagram' | 'youtube' | 'pinterest' | 'tiktok'

export interface OfficialLink {
  platform: OfficialLinkPlatform
  url: string
  verifiedAt?: string
}

export type SupportCategory =
  | 'bug'
  | 'confusing_workflow'
  | 'store_data_correction'
  | 'feature_idea'
  | 'security_privacy'
export type SupportState = 'submitted' | 'in_review' | 'waiting_on_you' | 'resolved' | 'reopened'

export interface PortalDiagnostic {
  key: 'browser' | 'operating_system' | 'app_version' | 'route' | 'connection'
  label: string
  value: string
}

export interface SupportReply {
  id: string
  author: 'owner' | 'support'
  body: string
  createdAt: string
}

export interface SupportTicket {
  id: string
  category: SupportCategory
  subject: string
  body: string
  state: SupportState
  createdAt: string
  updatedAt: string
  diagnostics: PortalDiagnostic[]
  screenshotAttached: false
  replies: SupportReply[]
  resolutionNote?: string
}

export interface SupportTicketDraft {
  category: SupportCategory
  subject: string
  body: string
  diagnostics: PortalDiagnostic[]
}

export interface PortalPreview {
  storeName: string
  listingState: PortalListingState
  liveFields: Record<string, string>
  pendingChanges: PortalPendingChange[]
  freshness: PortalFreshness
}

export interface PortalAccessContext {
  userId: string
  storeId: string
  mfaVerified: boolean
  recentAuthAt: string | null
  revoked: boolean
  sessionOpen: boolean
}

export type PortalAccessFailure =
  | 'no_session'
  | 'session_denied'
  | 'mfa_required'
  | 'recent_auth_required'
  | 'scope_missing'
  | 'revoked'

export interface PortalClient {
  getHome(): Promise<PortalHomeSnapshot>
  getHours(): Promise<PortalHours>
  saveHours(hours: PortalHours): Promise<PortalHours>
  saveManagedFields(fields: PortalManagedFields): Promise<PortalHomeSnapshot>
  submitControlledChange(change: PortalControlledChangeDraft): Promise<PortalPendingChange>
  getMediaCapability(): Promise<PortalMediaCapability>
  uploadOfficialMedia(input: PortalMediaUploadInput): Promise<PortalMediaUploadReceipt>
  listUpdates(): Promise<StoreUpdate[]>
  createUpdate(draft: StoreUpdateDraft): Promise<StoreUpdate>
  archiveUpdate(id: string): Promise<StoreUpdate>
  restoreUpdate(id: string): Promise<StoreUpdate>
  listOfficialLinks(): Promise<OfficialLink[]>
  saveOfficialLink(link: OfficialLink): Promise<OfficialLink>
  removeOfficialLink(platform: OfficialLinkPlatform): Promise<void>
  listSupportTickets(): Promise<SupportTicket[]>
  createSupportTicket(draft: SupportTicketDraft): Promise<SupportTicket>
  replySupportTicket(ticketId: string, body: string): Promise<SupportTicket>
  confirmSupportResolution(ticketId: string): Promise<SupportTicket>
  reopenSupportTicket(ticketId: string): Promise<SupportTicket>
  previewPublicListing(): Promise<PortalPreview>
  getDiagnostics(): Promise<PortalDiagnostic[]>
}
