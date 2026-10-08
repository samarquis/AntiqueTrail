import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { GENERIC_ADMIN_FAILURE } from '../admin'
import {
  isPartnerAdminStoreId,
  type PartnerAdminCase,
  type PartnerAdminClient,
  type PartnerAdminOperation,
  type PartnerAdminTeamMember,
  type SyntheticPartnerInvitation,
} from './partnerAdmin'
import { ownerTeamRoleLabel } from '../owner/ownerClient'

const operations: PartnerAdminOperation[] = [
  'changes',
  'conflict',
  'approve',
  'reject',
  'revoke',
  'recheck',
  'transfer',
]
const OWNER_APPROVAL_REASON_CODE = 'owner_boundary_confirmed'

function labelState(state: string) {
  return state.replaceAll('_', ' ')
}

export function PartnerAdminPage({
  client,
  applications,
}: {
  client: PartnerAdminClient
  applications?: ReactNode
}) {
  const [email, setEmail] = useState('')
  const [invitationKey, setInvitationKey] = useState('')
  const [invitation, setInvitation] = useState<SyntheticPartnerInvitation | null>(null)
  const [claimId, setClaimId] = useState('')
  const [claim, setClaim] = useState<PartnerAdminCase | null>(null)
  const [operation, setOperation] = useState<PartnerAdminOperation>('changes')
  const [reasonCode, setReasonCode] = useState('')
  const [decisionKey, setDecisionKey] = useState('')
  const [transferFromClaimId, setTransferFromClaimId] = useState('')
  const [signalReasonCode, setSignalReasonCode] = useState('')
  const [signalDecisionKey, setSignalDecisionKey] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const [confirmDecision, setConfirmDecision] = useState(false)
  const [confirmSignal, setConfirmSignal] = useState<{
    signalId: string
    operation: 'verify' | 'reject'
  } | null>(null)
  const [signalOutcome, setSignalOutcome] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<PartnerAdminTeamMember[]>([])
  const [teamPending, setTeamPending] = useState(false)
  const [teamError, setTeamError] = useState(false)
  const [confirmTeamGrantId, setConfirmTeamGrantId] = useState<string | null>(null)
  const [teamRevokeReason, setTeamRevokeReason] = useState('')

  async function refreshTeam(storeId: string) {
    setTeamPending(true)
    setTeamError(false)
    try {
      setTeamMembers((await client.listStoreTeam(storeId)).members)
    } catch {
      setTeamError(true)
    } finally {
      setTeamPending(false)
    }
  }

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
    setTeamMembers([])
    setTeamError(false)
    setConfirmTeamGrantId(null)
    setTeamRevokeReason('')
    try {
      const next = await client.getCase(claimId.trim())
      setClaim(next)
      if (next.storeId) await refreshTeam(next.storeId)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function revokeTeamAccess(member: PartnerAdminTeamMember) {
    const reason = teamRevokeReason.trim()
    if (!claim?.storeId || !reason) return
    setTeamPending(true)
    setTeamError(false)
    try {
      await client.revokeStoreTeamAccess({
        storeId: claim.storeId,
        grantId: member.grantId,
        expectedVersion: member.version,
        idempotencyKey: crypto.randomUUID(),
        reason,
      })
      setTeamMembers((await client.listStoreTeam(claim.storeId)).members)
      setConfirmTeamGrantId(null)
      setTeamRevokeReason('')
    } catch {
      setTeamError(true)
    } finally {
      setTeamPending(false)
    }
  }

  async function decide(event: FormEvent) {
    event.preventDefault()
    if (!claim?.version) return
    if (
      operation === 'approve_owner' &&
      (!isPartnerAdminStoreId(claim.storeId) || !claim.exactStoreScope)
    ) {
      setError(true)
      setConfirmDecision(false)
      return
    }
    if (!confirmDecision) {
      setConfirmDecision(true)
      return
    }
    setPending(true)
    setError(false)
    try {
      setClaim(
        await client.decide({
          operation,
          claimId: claim.claimId,
          expectedVersion: claim.version,
          idempotencyKey: decisionKey.trim(),
          reasonCode:
            operation === 'approve_owner' ? OWNER_APPROVAL_REASON_CODE : reasonCode.trim(),
          transferFromClaimId: operation === 'transfer' ? transferFromClaimId.trim() : undefined,
          ...(operation === 'approve_owner' ? { confirmedStoreId: claim.storeId } : {}),
        }),
      )
      setConfirmDecision(false)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  async function decideSignal(signalId: string, signalOperation: 'verify' | 'reject') {
    if (!claim?.version || !signalReasonCode.trim() || !signalDecisionKey.trim()) return
    setPending(true)
    setError(false)
    try {
      const next = await client.verifySignal({
        operation: signalOperation,
        claimId: claim.claimId,
        signalId,
        expectedVersion: claim.version,
        idempotencyKey: signalDecisionKey.trim(),
        reasonCode: signalReasonCode.trim(),
      })
      setClaim(next)
      setSignalOutcome(
        signalOperation === 'verify'
          ? `Signal verified and added to this exact claim’s verified signal record. Reason retained: ${signalReasonCode.trim()}.`
          : `Pending signal resolved and removed from this exact claim. Reason retained: ${signalReasonCode.trim()}.`,
      )
      setSignalDecisionKey('')
      setConfirmSignal(null)
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

        {applications}
        <h2>Synthetic Store Partner invitation</h2>
        <p>
          Email delivery remains disabled until E-01 and HC-01 pass. The recipient email enters the
          protected provider boundary and is not stored or logged as plain text.
        </p>
        <form className="partner-admin__invitation-form" onSubmit={issueInvitation}>
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

        <h2 className="partner-admin__claim-heading">Exact listing claim</h2>
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
            {claim.storeId && (
              <section aria-labelledby="partner-admin-team-heading">
                <h4 id="partner-admin-team-heading">Store team access</h4>
                {teamPending && <p role="status">Updating team access…</p>}
                {teamError && (
                  <p role="alert">Team access is unavailable. Refresh and try again.</p>
                )}
                {!teamPending && !teamError && teamMembers.length === 0 && (
                  <p>No active team members.</p>
                )}
                <ul aria-label="Active store team members">
                  {teamMembers.map((member) => (
                    <li key={member.grantId}>
                      <span>
                        {member.displayName} — {ownerTeamRoleLabel[member.role]}
                      </span>{' '}
                      <button
                        type="button"
                        disabled={teamPending}
                        onClick={() => {
                          setTeamRevokeReason('')
                          setConfirmTeamGrantId(member.grantId)
                        }}
                      >
                        Remove team access for {member.displayName}
                      </button>
                      {confirmTeamGrantId === member.grantId && (
                        <div role="group" aria-label="Confirm team access removal">
                          <p>
                            Site Admin removal ends {member.displayName}’s access immediately. This
                            cannot be undone.
                          </p>
                          <label htmlFor="partner-admin-team-revoke-reason">
                            Reason for removal
                          </label>
                          <textarea
                            id="partner-admin-team-revoke-reason"
                            value={teamRevokeReason}
                            maxLength={240}
                            required
                            onChange={(event) => setTeamRevokeReason(event.target.value)}
                          />
                          <p>
                            Keep this brief. Do not include personal or shopper details; the reason
                            is retained in the administrator audit record.
                          </p>
                          <button
                            type="button"
                            disabled={teamPending || !teamRevokeReason.trim()}
                            onClick={() => void revokeTeamAccess(member)}
                          >
                            Confirm remove {member.displayName}
                          </button>
                          <button
                            type="button"
                            disabled={teamPending}
                            onClick={() => {
                              setConfirmTeamGrantId(null)
                              setTeamRevokeReason('')
                            }}
                          >
                            Keep access
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p>Verified signals: {claim.verifiedSignals?.length ?? 0}.</p>
            {(claim.pendingSignals?.length ?? 0) > 0 && (
              <section aria-labelledby="pending-authority-signals-heading">
                <h4 id="pending-authority-signals-heading">Submitted authority signals</h4>
                <p>
                  Only channel metadata is shown here. Raw evidence remains inside the trusted
                  verification boundary.
                </p>
                <label htmlFor="partner-admin-signal-reason">Signal decision reason</label>
                <input
                  id="partner-admin-signal-reason"
                  value={signalReasonCode}
                  onChange={(event) => setSignalReasonCode(event.target.value)}
                  pattern="[a-z][a-z0-9_]{1,63}"
                  required
                />
                <label htmlFor="partner-admin-signal-key">Signal decision key</label>
                <input
                  id="partner-admin-signal-key"
                  value={signalDecisionKey}
                  onChange={(event) => setSignalDecisionKey(event.target.value)}
                  pattern="[A-Za-z0-9][A-Za-z0-9._:-]{0,127}"
                  required
                />
                <ul>
                  {claim.pendingSignals?.map((signal) => (
                    <li key={signal.signalId}>
                      <span>
                        {labelState(signal.channelClass)} · {labelState(signal.signalType)}
                      </span>{' '}
                      <button
                        type="button"
                        disabled={pending || !signalReasonCode.trim() || !signalDecisionKey.trim()}
                        onClick={() =>
                          setConfirmSignal({ signalId: signal.signalId, operation: 'verify' })
                        }
                      >
                        Verify {labelState(signal.channelClass)} signal
                      </button>{' '}
                      <button
                        type="button"
                        disabled={pending || !signalReasonCode.trim() || !signalDecisionKey.trim()}
                        onClick={() =>
                          setConfirmSignal({ signalId: signal.signalId, operation: 'reject' })
                        }
                      >
                        Reject {labelState(signal.channelClass)} signal
                      </button>
                    </li>
                  ))}
                </ul>
                {confirmSignal && (
                  <section aria-label="Confirm authority signal decision">
                    <p>
                      Confirm {confirmSignal.operation}:{' '}
                      {confirmSignal.operation === 'verify'
                        ? 'this adds the pending signal to the exact claim’s verified signal record.'
                        : 'this resolves and removes the pending signal from the exact claim.'}{' '}
                      The supplied reason is retained in the audit record.
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        void decideSignal(confirmSignal.signalId, confirmSignal.operation)
                      }
                    >
                      Confirm {confirmSignal.operation} signal
                    </button>{' '}
                    <button type="button" onClick={() => setConfirmSignal(null)}>
                      Cancel signal decision
                    </button>
                  </section>
                )}
              </section>
            )}
            {signalOutcome && <p role="status">{signalOutcome}</p>}
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
                {client.ownerApprovalAvailable &&
                  isPartnerAdminStoreId(claim.storeId) &&
                  claim.exactStoreScope && (
                    <option value="approve_owner">
                      Approve Store Owner for this exact synthetic store
                    </option>
                  )}
              </select>
              <label htmlFor="partner-admin-reason">Reason code</label>
              <input
                id="partner-admin-reason"
                value={operation === 'approve_owner' ? OWNER_APPROVAL_REASON_CODE : reasonCode}
                readOnly={operation === 'approve_owner'}
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
                {confirmDecision ? `Confirm ${labelState(operation)} decision` : 'Apply decision'}
              </button>
              {confirmDecision && (
                <p role="status">
                  {operation === 'approve_owner'
                    ? `Confirm Store Owner approval for exact store ${claim.exactStoreScope}. The audit records owner_boundary_confirmed.`
                    : `Confirm ${labelState(operation)}: this changes the exact claim’s state and records the supplied reason.`}{' '}
                  <button type="button" onClick={() => setConfirmDecision(false)}>
                    Cancel decision
                  </button>
                </p>
              )}
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
