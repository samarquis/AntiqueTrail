import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MEDIA_GATE_MESSAGE,
  copyHoursDay,
  derivePortalFreshness,
  sanitizeDiagnostics,
  validateOfficialLink,
  validateHours,
  validateUpdateDraft,
} from './portalClient'
import { PortalHomePage, PortalSupportPage } from './components'
import type { PortalClient, PortalHours, SupportTicket } from './types'

function hours(): PortalHours {
  return {
    timeZone: 'America/Chicago',
    version: 1,
    weekly: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
      (label, index) => ({
        weekday: index + 1,
        label,
        isClosed: index === 6,
        intervals: index === 6 ? [] : [{ opensAt: '10:00', closesAt: '17:00' }],
      }),
    ),
    holidays: [],
  }
}

function ticket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'support-1',
    category: 'bug',
    subject: 'Cannot save hours',
    body: 'The save button did not complete.',
    state: 'in_review',
    createdAt: '2026-08-03T00:00:00Z',
    updatedAt: '2026-08-03T00:00:00Z',
    diagnostics: [],
    screenshotAttached: false,
    replies: [],
    ...overrides,
  }
}

function client(overrides: Partial<PortalClient> = {}): PortalClient {
  const home = {
    store: {
      id: 'store-1',
      name: 'Oak Antiques',
      listingState: 'active' as const,
      timeZone: 'America/Chicago',
    },
    freshness: { state: 'verified' as const, label: 'Verified', verifiedAt: '2026-08-01' },
    provenance: {
      sourceLabel: 'Owner confirmation',
      verifiedBy: 'Synthetic Admin',
      verifiedAt: '2026-08-01',
      ownerConfirmed: true,
    },
    pendingChanges: [],
  }
  return {
    getHome: vi.fn(async () => home),
    getHours: vi.fn(async () => hours()),
    saveHours: vi.fn(async (value) => value),
    saveManagedFields: vi.fn(async () => home),
    submitControlledChange: vi.fn(async () => ({
      id: 'change-1',
      field: 'name' as const,
      requestedValue: 'Oak',
      state: 'pending' as const,
      submittedAt: '2026-08-03',
    })),
    listUpdates: vi.fn(async () => []),
    createUpdate: vi.fn(async (draft) => ({ ...draft, id: 'update-1', state: 'live' as const })),
    archiveUpdate: vi.fn(async (id) => ({
      id,
      type: 'new_finds' as const,
      headline: 'Finds',
      details: 'Details',
      state: 'archived' as const,
    })),
    restoreUpdate: vi.fn(async (id) => ({
      id,
      type: 'new_finds' as const,
      headline: 'Finds',
      details: 'Details',
      state: 'live' as const,
    })),
    listOfficialLinks: vi.fn(async () => []),
    saveOfficialLink: vi.fn(async (link) => link),
    removeOfficialLink: vi.fn(async () => undefined),
    listSupportTickets: vi.fn(async () => [ticket()]),
    createSupportTicket: vi.fn(async (draft) => ({ ...ticket(), ...draft })),
    replySupportTicket: vi.fn(async (id, body) =>
      ticket({ id, replies: [{ id: 'reply-1', author: 'owner', body, createdAt: '2026-08-03' }] }),
    ),
    confirmSupportResolution: vi.fn(async (id) => ticket({ id, state: 'resolved' })),
    reopenSupportTicket: vi.fn(async (id) => ticket({ id, state: 'reopened' })),
    previewPublicListing: vi.fn(async () => ({
      storeName: 'Oak Antiques',
      listingState: 'active' as const,
      liveFields: {},
      pendingChanges: [],
      freshness: home.freshness,
    })),
    getDiagnostics: vi.fn(async () =>
      sanitizeDiagnostics({ browser: 'Chrome', route: '/store-portal/support?token=hidden' }),
    ),
    ...overrides,
  }
}

describe('provider-neutral Store Portal boundary', () => {
  afterEach(() => cleanup())

  it('derives freshness windows and validates bounded hours', () => {
    expect(derivePortalFreshness('2026-01-01', new Date('2026-07-01')).state).toBe('overdue')
    expect(derivePortalFreshness('2025-01-01', new Date('2026-08-03')).state).toBe('stale')
    expect(validateHours(hours())).toEqual([])
    const invalid = hours()
    invalid.weekly[0].intervals = [{ opensAt: '17:00', closesAt: '10:00' }]
    expect(validateHours(invalid).join(' ')).toMatch(/end after/i)
  })

  it('copies one weekly day without changing labels or mutating the source', () => {
    const original = hours()
    const copied = copyHoursDay(original, 1, [2])
    expect(copied.weekly[1].intervals).toEqual(original.weekly[0].intervals)
    expect(copied.weekly[1].label).toBe('Tuesday')
    expect(original.weekly[1].intervals[0].opensAt).toBe('10:00')
  })

  it('rejects shorteners and unrelated social hosts while normalizing official links', () => {
    expect(
      validateOfficialLink('facebook', 'https://www.facebook.com/oak?utm_source=test'),
    ).toEqual({ ok: true, normalizedUrl: 'https://facebook.com/oak' })
    expect(validateOfficialLink('instagram', 'https://bit.ly/oak')).toMatchObject({ ok: false })
    expect(validateOfficialLink('instagram', 'https://example.com/oak')).toMatchObject({
      ok: false,
    })
  })

  it('keeps media and screenshot work visibly gated and supports bounded diagnostics', async () => {
    const user = userEvent.setup()
    const portalClient = client()
    render(
      <MemoryRouter>
        <PortalSupportPage client={portalClient} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(new RegExp(MEDIA_GATE_MESSAGE))).toBeInTheDocument()
    await user.click(screen.getByLabelText(/include allowlisted diagnostics/i))
    expect(await screen.findByText(/current screen/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /screenshot/i })).not.toBeInTheDocument()
  })

  it('renders scoped home status without shopper-private or analytics sections', async () => {
    render(
      <MemoryRouter>
        <PortalHomePage client={client()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /oak antiques/i })).toBeInTheDocument()
    expect(screen.getAllByText(/owner confirmation/i).length).toBeGreaterThan(0)
    expect(
      screen.queryByText(/traffic analytics|shopper ratings|private notes/i),
    ).not.toBeInTheDocument()
  })

  it('blocks image-bearing update drafts before any client call', () => {
    expect(
      validateUpdateDraft({
        type: 'announcement',
        headline: 'News',
        details: 'Details',
        imageRequested: true,
      }),
    ).toContain(MEDIA_GATE_MESSAGE)
    expect(validateUpdateDraft({ type: 'sale', headline: 'Sale', details: 'Details' })).toContain(
      'Sales require an end date.',
    )
  })
})
