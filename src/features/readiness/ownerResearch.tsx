import { useEffect, useState, type FormEvent } from 'react'
import {
  OwnerAcquisitionContent,
  createOwnerIntakeClient,
  type OwnerIntakeClient,
  type OwnerIntakeDraft,
  type OwnerIntakeKind,
  type OwnerIntakeOperation,
  type OwnerIntakeSnapshot,
} from '../partners'

export const GENERIC_OWNER_RESEARCH_DENIAL =
  'This research experience is unavailable. Contact the person who invited you.'

export interface OwnerResearchRpcTransport {
  rpc(
    name: 'owner_research_command',
    args: Readonly<Record<string, unknown>>,
  ): Promise<{ data: unknown; error: unknown }>
}

export function createOwnerResearchClient(
  transport: OwnerResearchRpcTransport,
  binding: { artifactDigest: string; cohortKey: string },
): OwnerIntakeClient {
  if (
    !/^sha256:[0-9a-f]{64}$/.test(binding.artifactDigest) ||
    !/^[a-z0-9-]{3,40}$/.test(binding.cohortKey)
  )
    throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)

  return createOwnerIntakeClient({
    async invoke(operation: OwnerIntakeOperation, payload: Readonly<Record<string, unknown>>) {
      try {
        const result = await transport.rpc('owner_research_command', {
          p_operation: operation,
          p_artifact_digest: binding.artifactDigest,
          p_cohort_key: binding.cohortKey,
          p_payload: payload,
        })
        if (result.error || !result.data) throw new Error()
        return result.data as OwnerIntakeSnapshot
      } catch {
        throw new Error(GENERIC_OWNER_RESEARCH_DENIAL)
      }
    },
  })
}

const blankDraft = (kind: OwnerIntakeKind): OwnerIntakeDraft => ({
  fixture: kind === 'existing_claim' ? 'existing-store-a' : 'new-store-a',
  relationship: 'owner',
  ownerFactsConfirmed: false,
  reviewedFactsUnderstood: false,
})

export function OwnerResearchPage({
  client,
  authenticate,
  canonicalSiteUrl,
}: {
  client: OwnerIntakeClient
  authenticate?: (email: string, password: string) => Promise<void>
  canonicalSiteUrl?: string
}) {
  const [snapshot, setSnapshot] = useState<OwnerIntakeSnapshot | null>(null)
  const [draft, setDraft] = useState<OwnerIntakeDraft | null>(null)
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState('Checking this private research invitation…')
  const [denied, setDenied] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [selectedKind, setSelectedKind] = useState<OwnerIntakeKind>('existing_claim')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const run = async (action: () => Promise<OwnerIntakeSnapshot>, success: string) => {
    setPending(true)
    try {
      const next = await action()
      setSnapshot(next)
      setDraft(next.draft)
      setDenied(false)
      setMessage(success)
    } catch {
      setSnapshot(null)
      setDraft(null)
      setDenied(true)
      setMessage(GENERIC_OWNER_RESEARCH_DENIAL)
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    void run(() => client.resume(), 'Private Synthetic research access confirmed.')
  }, [client])

  const start = (kind: OwnerIntakeKind) => {
    setDraft(blankDraft(kind))
    void run(() => client.start(kind), 'Synthetic draft started.')
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    if (draft) void run(() => client.save(draft), 'Synthetic draft saved.')
  }

  const verifyInvitation = async (event: FormEvent) => {
    event.preventDefault()
    if (!authenticate) return
    setPending(true)
    try {
      await authenticate(email, password)
      await run(() => client.resume(), 'Private Synthetic research access confirmed.')
    } catch {
      setDenied(true)
      setMessage(GENERIC_OWNER_RESEARCH_DENIAL)
      setPending(false)
    }
  }

  const intakeAction = denied ? null : (
    <div className="owner-research__actions" aria-labelledby="research-action-heading">
      <h3 id="research-action-heading">Try the private Synthetic flow</h3>
      {!snapshot?.kind ? (
        choosing ? (
          <fieldset>
            <legend>Is the Synthetic store already listed?</legend>
            <label>
              <input
                type="radio"
                name="research-kind"
                checked={selectedKind === 'existing_claim'}
                onChange={() => setSelectedKind('existing_claim')}
              />
              Yes, claim the listed Synthetic store
            </label>
            <label>
              <input
                type="radio"
                name="research-kind"
                checked={selectedKind === 'add_store'}
                onChange={() => setSelectedKind('add_store')}
              />
              No, add the missing Synthetic store
            </label>
            <button
              className="button"
              type="button"
              disabled={pending}
              onClick={() => start(selectedKind)}
            >
              Continue with this Synthetic scenario
            </button>
          </fieldset>
        ) : (
          <button
            className="button"
            type="button"
            disabled={pending}
            onClick={() => setChoosing(true)}
          >
            Add or claim my store
          </button>
        )
      ) : (
        <form onSubmit={save}>
          <p>
            Scenario:{' '}
            <strong>
              {snapshot.kind === 'existing_claim' ? 'existing store claim' : 'add missing store'}
            </strong>
          </p>
          <label>
            Your relationship
            <select
              value={draft?.relationship ?? 'owner'}
              disabled={pending || snapshot.state === 'submitted'}
              onChange={(event) =>
                setDraft(
                  (value) =>
                    value && { ...value, relationship: event.target.value as 'owner' | 'manager' },
                )
              }
            >
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft?.ownerFactsConfirmed ?? false}
              disabled={pending || snapshot.state === 'submitted'}
              onChange={(event) =>
                setDraft(
                  (value) => value && { ...value, ownerFactsConfirmed: event.target.checked },
                )
              }
            />
            I understand which Synthetic facts the owner can manage.
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft?.reviewedFactsUnderstood ?? false}
              disabled={pending || snapshot.state === 'submitted'}
              onChange={(event) =>
                setDraft(
                  (value) => value && { ...value, reviewedFactsUnderstood: event.target.checked },
                )
              }
            />
            I understand that sensitive facts and photos require review.
          </label>
          {snapshot.state !== 'submitted' && (
            <div className="owner-research__choice">
              <button className="button button--secondary" type="submit" disabled={pending}>
                Save draft
              </button>
              <button
                className="button"
                type="button"
                disabled={pending || !draft?.ownerFactsConfirmed || !draft.reviewedFactsUnderstood}
                onClick={() =>
                  void run(async () => {
                    if (draft) await client.save(draft)
                    return client.submit()
                  }, 'Synthetic application submitted for research. No store or access was created.')
                }
              >
                Submit Synthetic application
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )

  return (
    <main id="main-content" className="owner-research-shell">
      <p className="owner-research-label">Private research artifact · Synthetic data only</p>
      <p role={denied ? 'alert' : 'status'} aria-live="polite">
        {message}
      </p>
      {denied && authenticate && (
        <form className="owner-research__admission" onSubmit={verifyInvitation}>
          <h1>Verify your private invitation</h1>
          <label>
            Account email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={pending}>
            Verify invitation
          </button>
        </form>
      )}
      {!denied && snapshot && (
        <OwnerAcquisitionContent
          action={intakeAction}
          canonicalSiteUrl={canonicalSiteUrl ?? 'https://antique-trail-pages.pages.dev'}
        />
      )}
    </main>
  )
}
