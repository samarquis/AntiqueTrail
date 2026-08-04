import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_ADMIN_FAILURE } from '../admin'
import type {
  PartnerAdminCase,
  PartnerAdminClient,
  PartnerAdminOperation,
  SyntheticPartnerInvitation,
} from './partnerAdmin'

const operations: PartnerAdminOperation[] = [
  'changes',
  'conflict',
  'approve',
  'reject',
  'revoke',
  'recheck',
  'transfer',
]

function labelState(state: string) {
  return state.replaceAll('_', ' ')
}

export function PartnerAdminPage({ client }: { client: PartnerAdminClient }) {
  const [email, setEmail] = useState('')
  const [invitationKey, setInvitationKey] = useState('')
  const [invitation, setInvitation] = useState<SyntheticPartnerInvitation | null>(null)
  const [claimId, setClaimId] = useState('')
  const [claim, setClaim] = useState<PartnerAdminCase | null>(null)
  const [operation, setOperation] = useState<PartnerAdminOperation>('changes')
  const [reasonCode, setReasonCode] = useState('')
  const [decisionKey, setDecisionKey] = useState('')
  const [transferFromClaimId, setTransferFromClaimId] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function issueInvitation(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    setInvitation(null)
    try {
      setInvitation(
        await client.issueSyntheticInvitation({
          email: email.trim(),
          idempotencyKey: invitationKey.trim(),
        }),
      )
      setEmail('')
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function openClaim(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(false)
    setClaim(null)
    try {
      setClaim(await client.getCase(claimId.trim()))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function decide(event: FormEvent) {
    event.preventDefault()
    if (!claim?.version) return
    setPending(true)
    setError(false)
    try {
      setClaim(
        await client.decide({
          operation,
          claimId: claim.claimId,
          expectedVersion: claim.version,
          idempotencyKey: decisionKey.trim(),
          reasonCode: reasonCode.trim(),
          transferFromClaimId: operation === 'transfer' ? transferFromClaimId.trim() : undefined,
        }),
      )
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="partner-admin-heading">
        <p className="eyebrow">Administrator Review Workspace</p>
        <h1 id="partner-admin-heading">Partner administration</h1>
        <p>Work with one invitation or one exact claim at a time.</p>
        {error && <p role="alert">{GENERIC_ADMIN_FAILURE}</p>}

        <h2>Synthetic Store Partner invitation</h2>
        <p>
          Email delivery remains disabled until E-01 and HC-01 pass. The recipient email enters the
          protected provider boundary and is not stored or logged as plain text.
        </p>
        <form onSubmit={issueInvitation}>
          <label htmlFor="partner-admin-email">Owner-controlled email</label>
          <input
            id="partner-admin-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="partner-admin-invitation-key">Issuance key</label>
          <input
            id="partner-admin-invitation-key"
            value={invitationKey}
            onChange={(event) => setInvitationKey(event.target.value)}
            pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"
            required
          />
          <button className="button" type="submit" disabled={pending}>
            Create synthetic invitation
          </button>
        </form>
        {invitation && (
          <div role="status">
            <p>Copy this invitation now. Its secret cannot be retrieved again.</p>
            <code>{invitation.token}</code>
            <p>Expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
          </div>
        )}

        <h2>Exact listing claim</h2>
        <form onSubmit={openClaim}>
          <label htmlFor="partner-admin-claim-id">Exact claim ID</label>
          <input
            id="partner-admin-claim-id"
            value={claimId}
            onChange={(event) => setClaimId(event.target.value)}
            required
          />
          <button type="submit" disabled={pending}>
            Open exact claim
          </button>
        </form>

        {claim && (
          <section aria-labelledby="partner-admin-case-heading">
            <h3 id="partner-admin-case-heading">Claim case</h3>
            <p>{labelState(claim.state)}</p>
            {claim.exactStoreScope && <p>Exact store scope: {claim.exactStoreScope}.</p>}
            <p>Verified signals: {claim.verifiedSignals?.length ?? 0}.</p>
            <form onSubmit={decide}>
              <label htmlFor="partner-admin-decision">Decision</label>
              <select
                id="partner-admin-decision"
                value={operation}
                onChange={(event) => setOperation(event.target.value as PartnerAdminOperation)}
              >
                {operations.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {labelState(candidate)}
                  </option>
                ))}
              </select>
              <label htmlFor="partner-admin-reason">Reason code</label>
              <input
                id="partner-admin-reason"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
                pattern="[a-z][a-z0-9_]{1,63}"
                required
              />
              <label htmlFor="partner-admin-decision-key">Decision key</label>
              <input
                id="partner-admin-decision-key"
                value={decisionKey}
                onChange={(event) => setDecisionKey(event.target.value)}
                pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"
                required
              />
              {operation === 'transfer' && (
                <>
                  <label htmlFor="partner-admin-transfer-source">Prior approved claim ID</label>
                  <input
                    id="partner-admin-transfer-source"
                    value={transferFromClaimId}
                    onChange={(event) => setTransferFromClaimId(event.target.value)}
                    required
                  />
                </>
              )}
              <button type="submit" disabled={pending || !claim.version}>
                Apply decision
              </button>
            </form>
          </section>
        )}
        <p>
          <Link to="/admin">Back to review queue</Link>
        </p>
      </section>
    </main>
  )
}
