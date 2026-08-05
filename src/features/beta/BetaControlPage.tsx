import { useCallback, useEffect, useState } from 'react'
import {
  GENERIC_BETA_ERROR,
  type BetaGateChallenge,
  type DurableBetaClient,
  type DurableBetaState,
} from './betaClient'

export function BetaControlPage({
  cohortId,
  client,
}: {
  cohortId: string
  client: DurableBetaClient
}) {
  const [state, setState] = useState<DurableBetaState | null>(null)
  const [challenge, setChallenge] = useState<BetaGateChallenge | null>(null)
  const [decision, setDecision] = useState<'pass' | 'reject' | null>(null)
  const [storeId, setStoreId] = useState('')
  const [representativeId, setRepresentativeId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    setError(false)
    return client
      .getState(cohortId)
      .then(setState)
      .catch(() => setError(true))
  }, [client, cohortId])
  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<unknown>, message: string) {
    setPending(true)
    setError(false)
    try {
      await action()
      setNotice(message)
      await load()
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function requestGate(nextDecision: 'pass' | 'reject') {
    if (!state) return
    setPending(true)
    setError(false)
    try {
      setChallenge(
        await client.requestGateDecision({
          cohortId,
          ordinal: state.currentOrdinal,
          decision: nextDecision,
        }),
      )
      setDecision(nextDecision)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="beta-control-heading">
        <p className="eyebrow">Controlled Private Beta</p>
        <h1 id="beta-control-heading">Sequential beta control</h1>
        <p>
          Expansion is server-owned, never automatic, and remains limited to three exact approved
          stores. Public capabilities stay off.
        </p>
        <p>
          Store 1 requires exactly two verified shopper accounts, one verified Administrator, and
          one verified Store Representative—all separate. There is no open signup path.
        </p>
        {error && <p role="alert">{GENERIC_BETA_ERROR}</p>}
        {!state ? (
          <p role="status">Loading private beta state…</p>
        ) : (
          <>
            <p role="status">
              Cohort {state.state}; current ordinal {state.currentOrdinal}; version {state.version}.
            </p>
            <ul aria-label="Beta store admissions">
              {state.admissions.map((admission) => (
                <li key={admission.storeId}>
                  Store {admission.ordinal}: {admission.storeId} — {admission.state} /{' '}
                  {admission.gateState}
                  {admission.state === 'active' && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void run(
                          () =>
                            client.withdrawStore({
                              cohortId,
                              storeId: admission.storeId,
                              reasonCode: 'operational_stop',
                              expectedCohortVersion: state.version,
                              idempotencyKey: crypto.randomUUID(),
                            }),
                          'Store withdrawn; no automatic replacement occurred.',
                        )
                      }
                    >
                      Withdraw Store {admission.ordinal}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div role="group" aria-label="Product Owner gate decision">
              <button type="button" disabled={pending} onClick={() => void requestGate('pass')}>
                Request pass decision
              </button>
              <button type="button" disabled={pending} onClick={() => void requestGate('reject')}>
                Request reject decision
              </button>
            </div>
            {challenge && decision && (
              <section aria-label="Pending gate challenge">
                <p>
                  One-use {decision} challenge expires in {challenge.expiresInSeconds} seconds.
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    void run(
                      () =>
                        client.completeGateDecision({
                          challengeId: challenge.challengeId,
                          payloadDigest: challenge.payloadDigest,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      `Product Owner ${decision} decision recorded.`,
                    ).then(() => {
                      setChallenge(null)
                      setDecision(null)
                    })
                  }
                >
                  Confirm Product Owner {decision} decision
                </button>
              </section>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!state || !storeId.trim() || !representativeId.trim()) return
                void run(
                  () =>
                    client.admitNextStore({
                      cohortId,
                      storeId: storeId.trim(),
                      representativeAccountId: representativeId.trim(),
                      expectedCohortVersion: state.version,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  'Next exact store admitted.',
                )
              }}
            >
              <h2>Admit the next exact store</h2>
              <label htmlFor="beta-store-id">Store ID</label>
              <input
                id="beta-store-id"
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
              />
              <label htmlFor="beta-representative-id">Representative account ID</label>
              <input
                id="beta-representative-id"
                value={representativeId}
                onChange={(event) => setRepresentativeId(event.target.value)}
              />
              <button type="submit" disabled={pending || state.currentOrdinal >= 3}>
                Admit next store
              </button>
            </form>
            {state.state === 'paused' && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  void run(
                    () =>
                      client.recoverCohort({
                        cohortId,
                        expectedCohortVersion: state.version,
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    'Cohort recovered after current operational evidence passed.',
                  )
                }
              >
                Recover paused cohort
              </button>
            )}
            {notice && <p role="status">{notice}</p>}
          </>
        )}
      </section>
    </main>
  )
}
