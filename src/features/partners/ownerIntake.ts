export type OwnerIntakeKind = 'existing_claim' | 'add_store'
export type OwnerIntakeState = 'ready' | 'draft' | 'submitted'

export interface OwnerIntakeDraft {
  fixture: 'existing-store-a' | 'new-store-a'
  relationship: 'owner' | 'manager'
  ownerFactsConfirmed: boolean
  reviewedFactsUnderstood: boolean
}

export interface OwnerIntakeSnapshot {
  runId: string
  audience: 'synthetic'
  kind: OwnerIntakeKind | null
  state: OwnerIntakeState
  draft: OwnerIntakeDraft | null
  updatedAt: string | null
}

export type OwnerIntakeOperation = 'start' | 'save' | 'resume' | 'submit' | 'status'

export interface OwnerIntakeTransport {
  invoke(
    operation: OwnerIntakeOperation,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<OwnerIntakeSnapshot>
}

export interface OwnerIntakeClient {
  start(kind: OwnerIntakeKind): Promise<OwnerIntakeSnapshot>
  save(draft: OwnerIntakeDraft): Promise<OwnerIntakeSnapshot>
  resume(): Promise<OwnerIntakeSnapshot>
  submit(): Promise<OwnerIntakeSnapshot>
  status(): Promise<OwnerIntakeSnapshot>
}

/** Shared client transaction used by the isolated research and future Package 10B wrappers. */
export function createOwnerIntakeClient(transport: OwnerIntakeTransport): OwnerIntakeClient {
  return {
    start: (kind) => transport.invoke('start', { kind }),
    save: (draft) => transport.invoke('save', { draft }),
    resume: () => transport.invoke('resume', {}),
    submit: () => transport.invoke('submit', {}),
    status: () => transport.invoke('status', {}),
  }
}
