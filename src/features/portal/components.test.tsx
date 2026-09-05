import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GENERIC_PORTAL_ERROR,
  MEDIA_GATE_MESSAGE,
  PortalMediaCapError,
  copyHoursDay,
  derivePortalFreshness,
  sanitizeDiagnostics,
  validateOfficialLink,
  validateHours,
  validateUpdateDraft,
} from './portalClient'
import {
  PortalControlledChangesPage,
  PortalHomePage,
  PortalManagedFieldsPage,
  PortalMediaReviewPage,
  PortalSupportPage,
  PortalUpdatesPage,
} from './components'
import type { PortalMediaResubmitInput } from './types'
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
    managedFields: {
      phone: '785-555-0123',
      website: 'https://oak.example.invalid',
      description: 'An approved Oak Antiques description.',
    },
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
    getMediaCapability: vi.fn(async () => ({ enabled: false, source: 'server' as const })),
    getMediaCapacity: vi.fn(async () => ({
      currentTier: 'free' as const,
      approvedCount: 1,
      cap: 5,
    })),
    uploadOfficialMedia: vi.fn(async () => ({
      uploadId: '11111111-1111-4111-8111-111111111111',
      state: 'awaiting_review' as const,
    })),
    listMediaUploads: vi.fn(async () => ({ uploads: [] })),
    resubmitMedia: vi.fn(async () => ({
      newUploadId: '11111111-1111-4111-8111-111111111111',
      state: 'awaiting_review' as const,
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

  it('groups verified status, provenance, and an empty controlled-change state without a redundant action', async () => {
    render(
      <MemoryRouter>
        <PortalHomePage client={client()} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /oak antiques/i })).toBeInTheDocument()
    const status = screen.getByRole('region', { name: /store status/i })
    expect(status).toHaveTextContent(/public listing.*active/i)
    expect(status).toHaveTextContent(/store timezone.*america\/chicago/i)
    expect(status).toHaveTextContent(/hours verification.*verified/i)
    expect(status).toHaveTextContent(/owner confirmation.*august 1, 2026/i)
    expect(status).toHaveTextContent(/nothing pending is public/i)
    expect(within(status).queryByRole('link', { name: /update hours/i })).not.toBeInTheDocument()
    expect(within(status).getByRole('link', { name: /preview public listing/i })).toHaveClass(
      'button--secondary',
    )
    expect(screen.getByText(new RegExp(MEDIA_GATE_MESSAGE))).toBeInTheDocument()
    expect(
      screen.queryByText(/traffic analytics|shopper ratings|private notes/i),
    ).not.toBeInTheDocument()
  })

  it('keeps overdue-hours guidance and its action with the non-public pending summary', async () => {
    render(
      <MemoryRouter>
        <PortalHomePage
          client={client({
            getHome: vi.fn(async () => ({
              store: {
                id: 'store-1',
                name: 'Oak Antiques',
                listingState: 'active' as const,
                timeZone: 'America/Chicago',
              },
              freshness: { state: 'overdue' as const, label: 'Hours need review' },
              provenance: {
                sourceLabel: 'Owner confirmation',
                verifiedBy: 'Synthetic Admin',
                verifiedAt: '2026-08-01',
                ownerConfirmed: false,
              },
              pendingChanges: [
                {
                  id: 'change-1',
                  field: 'address' as const,
                  requestedValue: '1 Main Street',
                  state: 'pending' as const,
                  submittedAt: '2026-08-02',
                },
              ],
            })),
          })}
        />
      </MemoryRouter>,
    )

    const status = await screen.findByRole('region', { name: /store status/i })
    expect(within(status).getByRole('complementary')).toHaveTextContent(/review hours/i)
    expect(within(status).getByRole('link', { name: /update hours/i })).toHaveAttribute(
      'href',
      '/store-portal/hours',
    )
    expect(status).toHaveTextContent(/1 controlled change is waiting.*not public/i)
    expect(status).toHaveTextContent(/address: pending/i)
  })

  it('keeps the Home loading and unavailable states free of a fabricated status summary', async () => {
    const never = new Promise<never>(() => undefined)
    const { rerender } = render(
      <MemoryRouter>
        <PortalHomePage client={client({ getHome: vi.fn(() => never) })} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/loading store portal/i)
    expect(screen.queryByRole('region', { name: /store status/i })).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <PortalHomePage client={client({ getHome: vi.fn(async () => Promise.reject()) })} />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update this store portal/i)
    expect(screen.queryByRole('region', { name: /store status/i })).not.toBeInTheDocument()
  })

  it('hydrates Store Information before enabling a partial managed-field publish', async () => {
    const user = userEvent.setup()
    const saveManagedFields = vi.fn(async () => client().getHome())
    render(
      <MemoryRouter>
        <PortalManagedFieldsPage client={client({ saveManagedFields })} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/loading store portal/i)
    const phone = await screen.findByLabelText(/^phone$/i)
    expect(phone).toHaveValue('785-555-0123')
    expect(screen.getByLabelText(/^website$/i)).toHaveValue('https://oak.example.invalid')
    await user.clear(phone)
    await user.type(phone, '785-555-0199')
    await user.click(screen.getByRole('button', { name: /publish managed fields/i }))

    expect(saveManagedFields).toHaveBeenCalledWith({
      phone: '785-555-0199',
      website: 'https://oak.example.invalid',
      description: 'An approved Oak Antiques description.',
    })
    expect(await screen.findByRole('status')).toHaveTextContent(/published immediately/i)
  })

  it('keeps Store Information fields hidden when the scoped read fails', async () => {
    render(
      <MemoryRouter>
        <PortalManagedFieldsPage
          client={client({ getHome: vi.fn(async () => Promise.reject()) })}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update this store portal/i)
    expect(screen.queryByLabelText(/^phone$/i)).not.toBeInTheDocument()
  })

  it('makes Store Information and Pending Changes discoverable from Portal pages', async () => {
    render(
      <MemoryRouter>
        <PortalHomePage client={client()} />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /store information/i })).toHaveAttribute(
      'href',
      '/store-portal/info',
    )
    expect(screen.getByRole('link', { name: /pending changes/i })).toHaveAttribute(
      'href',
      '/store-portal/changes',
    )
    expect(screen.getByRole('link', { name: /official photos/i })).toHaveAttribute(
      'href',
      '/store-portal/photos',
    )
  })

  it('puts authorized official-photo history on its dedicated review destination', async () => {
    render(
      <MemoryRouter>
        <PortalMediaReviewPage
          client={client({
            listMediaUploads: vi.fn(async () => ({
              uploads: [
                {
                  uploadId: '33333333-3333-4333-8333-333333333333',
                  kind: 'gallery' as const,
                  state: 'rejected' as const,
                  altText: 'Front entrance',
                  submittedAt: '2026-08-30T00:00:00Z',
                  rejectionReason: 'Image quality insufficient for storefront',
                },
              ],
            })),
          })}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: 'Official photos' })).toBeInTheDocument()
    expect(screen.getByText('Placement: Gallery photo', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Submitted August 30, 2026/i)).toBeInTheDocument()
    expect(screen.getByText('Private image preview unavailable')).toBeInTheDocument()
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

  it('keeps official media fail closed until the server capability opens', async () => {
    render(
      <MemoryRouter>
        <PortalControlledChangesPage client={client()} />
      </MemoryRouter>,
    )
    expect(await screen.findByText(new RegExp(MEDIA_GATE_MESSAGE))).toBeInTheDocument()
    expect(screen.queryByLabelText(/official image file/i)).not.toBeInTheDocument()
  })

  it('keeps authorized rejected-photo history readable while M-01 is blocked', async () => {
    render(
      <MemoryRouter>
        <PortalControlledChangesPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: false, source: 'server' as const })),
            listMediaUploads: vi.fn(async () => ({
              uploads: [
                {
                  uploadId: '33333333-3333-4333-8333-333333333333',
                  kind: 'gallery' as const,
                  state: 'rejected' as const,
                  altText: 'Front entrance',
                  submittedAt: '2026-08-30T00:00:00Z',
                  rejectionReason: 'Image quality insufficient for storefront',
                },
              ],
            })),
          })}
        />
      </MemoryRouter>,
    )

    expect(
      await screen.findByText(/image quality insufficient for storefront/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /resubmit corrected image/i }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByText(new RegExp(MEDIA_GATE_MESSAGE)).length).toBeGreaterThan(0)
  })

  it('announces a successful text publish in the live region', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PortalUpdatesPage client={client()} />
      </MemoryRouter>,
    )
    await user.type(await screen.findByLabelText(/headline/i), 'New finds this week')
    await user.type(screen.getByLabelText(/details/i), 'Walnut tables arrived.')
    await user.click(screen.getByRole('button', { name: /publish text update/i }))

    expect(await screen.findByText('Text update published.')).toHaveAttribute('role', 'status')
    expect(screen.getByText('New finds this week')).toBeInTheDocument()
  })

  it('uploads official media through M-01 and leaves publication pending review', async () => {
    const user = userEvent.setup()
    const uploadOfficialMedia = vi.fn(async () => ({
      uploadId: '11111111-1111-4111-8111-111111111111',
      state: 'awaiting_review' as const,
    }))
    render(
      <MemoryRouter>
        <PortalControlledChangesPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: true, source: 'server' as const })),
            uploadOfficialMedia,
          })}
        />
      </MemoryRouter>,
    )
    const file = new File([new Uint8Array(32)], 'store.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText(/official image file/i), file)
    await user.type(screen.getByLabelText(/alternative text/i), 'Front entrance of Oak Antiques')
    await user.click(screen.getByLabelText(/confirm.*rights/i))
    const submitButton = screen.getByRole('button', { name: /submit image for review/i })
    fireEvent.submit(submitButton.closest('form')!)

    expect(uploadOfficialMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        kind: 'gallery',
        altText: 'Front entrance of Oak Antiques',
        file,
        rightsConfirmed: true,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/processed derivative.*review/i)
  })

  it.each([
    ['free', 5, '4 of 5 gallery places available.'],
    ['gallery', 15, '14 of 15 gallery places available.'],
    ['full_gallery', null, 'no plan-count cap. Operational limits still apply.'],
  ] as const)('shows server capacity for %s while M-01 is off', async (currentTier, cap, copy) => {
    render(
      <MemoryRouter>
        <PortalMediaReviewPage
          client={client({
            getMediaCapacity: vi.fn(async () => ({ currentTier, cap, approvedCount: 1 })),
          })}
        />
      </MemoryRouter>,
    )
    expect(await screen.findByText(new RegExp(copy.replaceAll('.', '\\.')))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Resubmit corrected image' }),
    ).not.toBeInTheDocument()
  })

  it('offers retry when current capacity is unavailable', async () => {
    const getMediaCapacity = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValue({ currentTier: 'free', cap: 5, approvedCount: 1 })
    render(
      <MemoryRouter>
        <PortalMediaReviewPage client={client({ getMediaCapacity })} />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading history' }))
    expect(await screen.findByText(/4 of 5 gallery places available/)).toBeInTheDocument()
  })

  it('locks correction selection and fields until the pending submission settles', async () => {
    const user = userEvent.setup()
    let complete!: () => void
    const resubmitMedia = vi.fn(
      () =>
        new Promise<{ newUploadId: string; state: 'awaiting_review' }>((resolve) => {
          complete = () => resolve({ newUploadId: 'replacement', state: 'awaiting_review' })
        }),
    )
    render(
      <MemoryRouter>
        <PortalMediaReviewPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: true, source: 'server' as const })),
            listMediaUploads: vi.fn(async () => ({
              uploads: [1, 2].map((id) => ({
                uploadId: String(id),
                kind: 'gallery' as const,
                state: 'rejected' as const,
                altText: `Photo ${id}`,
                submittedAt: '2026-09-01T00:00:00Z',
                rejectionReason: 'Blurry',
              })),
            })),
            resubmitMedia,
          })}
        />
      </MemoryRouter>,
    )
    await user.click(
      (await screen.findAllByRole('button', { name: 'Resubmit corrected image' }))[0],
    )
    await user.upload(
      screen.getByLabelText('Corrected image file'),
      new File([new Uint8Array(32)], 'replacement.png', { type: 'image/png' }),
    )
    await user.click(screen.getByLabelText(/rights.*corrected image/i))
    fireEvent.submit(
      screen.getByRole('button', { name: 'Submit corrected image' }).closest('form')!,
    )
    for (const button of screen.getAllByRole('button', { name: 'Resubmit corrected image' }))
      expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText('Corrected image file')).toBeDisabled()
    expect(screen.getByLabelText('Alternative text for corrected image')).toBeDisabled()
    expect(screen.getByLabelText(/rights.*corrected image/i)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Alternative text for corrected image')).toHaveValue('Photo 1')
    complete()
    expect(
      await screen.findByText('Replacement submitted and is awaiting Administrator review.'),
    ).toBeInTheDocument()
  })

  it('shows the verbatim rejection reason and resubmits without client store authority', async () => {
    const user = userEvent.setup()
    const resubmitMedia = vi.fn(async (input: PortalMediaResubmitInput) => ({
      newUploadId: input.originalUploadId,
      state: 'awaiting_review' as const,
    }))
    const rejectedUpload = {
      uploadId: '33333333-3333-4333-8333-333333333333',
      kind: 'gallery' as const,
      state: 'rejected' as const,
      altText: 'Front entrance',
      submittedAt: '2026-08-30T00:00:00Z',
      rejectionReason: 'Image quality insufficient for storefront',
    }
    render(
      <MemoryRouter>
        <PortalControlledChangesPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: true, source: 'server' as const })),
            listMediaUploads: vi.fn(async () => ({ uploads: [rejectedUpload] })),
            resubmitMedia,
          })}
        />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/Image quality insufficient for storefront/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Needs changes / Rejected')).toHaveClass('portal-media-state--rejected')
    expect(screen.queryByText(MEDIA_GATE_MESSAGE)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resubmit corrected image' })).not.toHaveClass(
      'button--secondary',
    )
    await user.click(screen.getByRole('button', { name: /resubmit corrected image/i }))
    expect(await screen.findByLabelText(/alternative text for corrected image/i)).toHaveValue(
      'Front entrance',
    )
    const file = new File([new Uint8Array(16)], 'replacement.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/corrected image file/i), file)
    await user.click(screen.getByLabelText(/rights.*corrected image/i))
    fireEvent.submit(
      screen.getByRole('button', { name: 'Submit corrected image' }).closest('form')!,
    )

    expect(resubmitMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        originalUploadId: '33333333-3333-4333-8333-333333333333',
        file,
        altText: 'Front entrance',
        rightsConfirmed: true,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      }),
    )
    expect(resubmitMedia.mock.calls[0][0]).not.toHaveProperty('storeId')
    expect(resubmitMedia.mock.calls[0][0]).not.toHaveProperty('kind')
    expect(
      await screen.findByText('Replacement submitted and is awaiting Administrator review.'),
    ).toHaveAttribute('role', 'status')
  })

  it('reuses the same idempotency key when a corrected-image retry keeps the draft unchanged', async () => {
    const user = userEvent.setup()
    const resubmitMedia = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        newUploadId: '11111111-1111-4111-8111-111111111111',
        state: 'awaiting_review' as const,
      })
    render(
      <MemoryRouter>
        <PortalControlledChangesPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: true, source: 'server' as const })),
            listMediaUploads: vi.fn(async () => ({
              uploads: [
                {
                  uploadId: '33333333-3333-4333-8333-333333333333',
                  kind: 'gallery' as const,
                  state: 'rejected' as const,
                  altText: 'Front entrance',
                  submittedAt: '2026-08-30T00:00:00Z',
                  rejectionReason: 'Image quality insufficient for storefront',
                },
              ],
            })),
            resubmitMedia,
          })}
        />
      </MemoryRouter>,
    )

    await user.click(await screen.findByRole('button', { name: /resubmit corrected image/i }))
    await user.upload(
      screen.getByLabelText(/corrected image file/i),
      new File([new Uint8Array(16)], 'replacement.png', { type: 'image/png' }),
    )
    await user.click(screen.getByLabelText(/rights.*corrected image/i))
    const form = screen.getByRole('button', { name: 'Submit corrected image' }).closest('form')!
    fireEvent.submit(form)
    await screen.findByRole('alert')
    fireEvent.submit(form)

    await screen.findByRole('status')
    expect(resubmitMedia).toHaveBeenCalledTimes(2)
    expect(resubmitMedia.mock.calls[1][0].idempotencyKey).toBe(
      resubmitMedia.mock.calls[0][0].idempotencyKey,
    )
  })

  it('keeps the approved media-cap guidance actionable instead of flattening it to a portal error', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <PortalControlledChangesPage
          client={client({
            getMediaCapability: vi.fn(async () => ({ enabled: true, source: 'server' as const })),
            listMediaUploads: vi.fn(async () => ({
              uploads: [
                {
                  uploadId: '33333333-3333-4333-8333-333333333333',
                  kind: 'gallery' as const,
                  altText: 'Old exterior',
                  state: 'rejected' as const,
                  rejectionReason: 'Image quality insufficient for storefront',
                  submittedAt: '2026-08-03',
                },
              ],
            })),
            resubmitMedia: vi.fn(async () => {
              throw new PortalMediaCapError(
                'Gallery capacity is reached. Upgrade to add more photos.',
              )
            }),
          })}
        />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'Resubmit corrected image' }))
    await user.upload(
      screen.getByLabelText('Corrected image file'),
      new File([new Uint8Array(16)], 'replacement.png', { type: 'image/png' }),
    )
    const altText = screen.getByLabelText('Alternative text for corrected image')
    await user.clear(altText)
    await user.type(altText, 'Corrected exterior')
    fireEvent.click(screen.getByLabelText(/rights to publish this corrected image/i))
    fireEvent.submit(
      screen.getByRole('button', { name: 'Submit corrected image' }).closest('form')!,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gallery capacity is reached. Upgrade to add more photos.',
    )
    expect(screen.queryByText(GENERIC_PORTAL_ERROR)).not.toBeInTheDocument()
  })
})
