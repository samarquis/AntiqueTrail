import {
  createStoreApplicationClient,
  createStoreApplicationAdminClient,
  parseApplicationDraft,
  type StoreApplication,
} from '../features/partners/storeApplications'
const area = '00000000-0000-4000-8000-000000000001'
const category = '17100000-0000-4000-8000-000000000004'
const applicationId = '17100000-0000-4000-8000-000000000005'
const storeId = '10000000-0000-4000-8000-000000000001'
export function storeApplicationReviewClients(state: string) {
  let current: StoreApplication | null = null
  const draft = {
    name: 'Synthetic Maple Antiques',
    address: '171 Fictional Street',
    areaId: area,
    categoryId: category,
    summary: 'Antiques and vintage pieces.',
    description: 'A synthetic independent antique store.',
    phone: '',
    website: '',
    ownerConfirmed: true,
    hours: Array.from({ length: 7 }, (_, day) => ({
      day: day + 1,
      closed: false,
      opens: '09:00',
      closes: '17:00',
    })),
  }
  function initial(): StoreApplication {
    return {
      applicationId,
      state: 'draft',
      version: 1,
      draft,
      matches: [],
      categoryLabel: 'Antiques',
      matchedStoreId: null,
      storeId: null,
      claimId: null,
    }
  }
  const invoke = async (operation: string, payload: Readonly<Record<string, unknown>>) => {
    if (state === 'error') throw new Error('Synthetic failure')
    if (operation === 'options')
      return {
        areas: [{ id: area, label: 'Topeka' }],
        categories: [{ id: category, label: 'Antiques' }],
      }
    if (operation === 'status') {
      if (payload.applicationId && payload.applicationId !== applicationId) return null
      return current
    }
    if (operation === 'search')
      return {
        searchId: applicationId,
        matches:
          state === 'blocked'
            ? [{ storeId, name: 'Blue Finch Curios', address: '100 Fictional Street' }]
            : [],
      }
    if (operation === 'read') {
      if (payload.applicationId !== applicationId) throw new Error('Unavailable')
      current ??= { ...initial(), state: 'submitted' }
      return current
    }
    if (operation === 'start') {
      current = { ...initial(), draft: parseApplicationDraft(payload.draft) }
      return current
    }
    if (
      !current ||
      payload.applicationId !== current.applicationId ||
      payload.version !== current.version
    )
      throw new Error('Stale')
    if (state === 'permission-denied' && operation === 'save') throw new Error('Write denied')
    current = { ...current, version: current.version + 1 }
    if (operation === 'save') current.draft = parseApplicationDraft(payload.draft)
    if (operation === 'submit') {
      current.state = state === 'blocked' ? 'duplicate_review' : 'submitted'
      if (state === 'blocked') {
        current.matchedStoreId = storeId
        current.matches = [{ storeId, name: 'Blue Finch Curios', address: '100 Fictional Street' }]
      }
    }
    if (operation === 'withdraw' || operation === 'convert') {
      current.state = 'withdrawn'
      current.draft = null
      if (operation === 'convert') current.claimId = applicationId
    }
    if (operation === 'verify') current.state = 'verification_pending'
    if (operation === 'approve') {
      current.state = 'approved'
      current.storeId = storeId
      current.draft = null
    }
    if (operation === 'changes') current.state = 'changes_requested'
    if (operation === 'reject') {
      current.state = 'rejected'
      current.draft = null
    }
    return current
  }
  return {
    storeApplications: createStoreApplicationClient(invoke),
    storeApplicationAdmin: createStoreApplicationAdminClient(invoke),
  }
}
