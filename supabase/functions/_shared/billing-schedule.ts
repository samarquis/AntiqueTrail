type Fields = Record<string, unknown>

function fields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Stripe unsets omitted phase parameters. Reject unknown nonempty fields instead
// of silently dropping an existing customer's billing settings during a rewrite.
const phaseFields = new Set([
  'add_invoice_items',
  'application_fee_percent',
  'automatic_tax',
  'billing_cycle_anchor',
  'collection_method',
  'currency',
  'default_payment_method',
  'default_tax_rates',
  'description',
  'discounts',
  'end_date',
  'invoice_settings',
  'items',
  'metadata',
  'on_behalf_of',
  'proration_behavior',
  'start_date',
  'transfer_data',
  'trial_end',
])
const itemFields = new Set([
  'price',
  'quantity',
  'tax_rates',
  'discounts',
  'metadata',
  'billing_thresholds',
])

function writablePhase(value: unknown): Fields | null {
  if (!fields(value) || !Array.isArray(value.items) || value.items.length !== 1) return null
  if (Object.entries(value).some(([key, item]) => item !== null && !phaseFields.has(key)))
    return null
  const item: unknown = value.items[0]
  if (!fields(item) || typeof item.price !== 'string' || item.quantity !== 1) return null
  // The legacy plan field duplicates price in the pinned provider response.
  if (item.plan != null && item.plan !== item.price) return null
  if (
    Object.entries(item).some(
      ([key, entry]) => entry !== null && key !== 'plan' && !itemFields.has(key),
    )
  )
    return null
  const copy = structuredClone(value)
  const writableItem = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'plan'))
  copy.items = [writableItem]
  return copy
}

function encode(value: unknown, prefix: string, result: Record<string, string>): boolean {
  if (value === null || value === undefined) return true
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    result[prefix] = String(value)
    return true
  }
  if (Array.isArray(value)) {
    if (value.length === 0) result[prefix] = ''
    return value.every((entry, index) => encode(entry, `${prefix}[${index}]`, result))
  }
  if (!fields(value)) return false
  return Object.entries(value).every(
    ([key, entry]) => /^[A-Za-z0-9_]+$/.test(key) && encode(entry, `${prefix}[${key}]`, result),
  )
}

/** Build a schedule mutation without changing any unrequested future phase. */
export function scheduleChangeForm(
  schedule: unknown,
  change: {
    kind: 'upgrade' | 'restore' | 'downgrade' | 'cancel'
    priceId?: string
    periodEnd: number
    changeId: string
  },
): Record<string, string> | null {
  if (
    !fields(schedule) ||
    schedule.status !== 'active' ||
    !fields(schedule.current_phase) ||
    !Array.isArray(schedule.phases) ||
    !['release', 'cancel'].includes(String(schedule.end_behavior)) ||
    !Number.isSafeInteger(change.periodEnd) ||
    (change.kind !== 'cancel' && !/^price_[A-Za-z0-9]{8,120}$/.test(change.priceId ?? ''))
  )
    return null
  const start = schedule.current_phase.start_date
  if (typeof start !== 'number') return null
  const phases: Fields[] = []
  for (const value of schedule.phases) {
    if (
      !fields(value) ||
      typeof value.start_date !== 'number' ||
      typeof value.end_date !== 'number'
    )
      return null
    if (value.end_date <= start) continue
    const phase = writablePhase(value)
    if (!phase) return null
    phases.push(phase)
  }
  const current = phases[0]
  if (
    !current ||
    current.start_date !== start ||
    typeof current.end_date !== 'number' ||
    change.periodEnd <= start
  )
    return null
  let endBehavior = String(schedule.end_behavior)
  if (change.kind === 'upgrade' || change.kind === 'restore') {
    const items = current.items
    if (!Array.isArray(items) || !fields(items[0])) return null
    items[0].price = change.priceId
    current.metadata = {
      ...(fields(current.metadata) ? current.metadata : {}),
      paid_change_id: change.changeId,
    }
  } else {
    // A newly confirmed downgrade/cancellation explicitly replaces future intent.
    current.end_date = change.periodEnd
    phases.splice(1)
    if (change.kind === 'cancel') endBehavior = 'cancel'
    else {
      const future = structuredClone(current)
      delete future.end_date
      delete future.trial_end
      delete future.add_invoice_items
      delete future.billing_cycle_anchor
      future.start_date = change.periodEnd
      future.iterations = 1
      const futureItems = future.items
      if (!Array.isArray(futureItems) || !fields(futureItems[0])) return null
      futureItems[0].price = change.priceId
      future.proration_behavior = 'none'
      future.metadata = {
        ...(fields(future.metadata) ? future.metadata : {}),
        paid_change_id: change.changeId,
      }
      phases.push(future)
      endBehavior = 'release'
    }
  }
  const form: Record<string, string> = {
    end_behavior: endBehavior,
    proration_behavior: change.kind === 'upgrade' ? 'create_prorations' : 'none',
    'metadata[paid_change_id]': change.changeId,
  }
  return encode(phases, 'phases', form) ? form : null
}
