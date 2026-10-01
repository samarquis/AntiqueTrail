import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OWNER_ACCESS_ERROR, ownerTeamRoleLabel, type OwnerClient } from './ownerClient'
import { useOwnerStoreRole } from './OwnerStoreRoleContext'

export function OwnerTeamInvitationsPage({ client }: { client: OwnerClient }) {
  const navigate = useNavigate()
  const { setRole } = useOwnerStoreRole()
  const [invitations, setInvitations] = useState<Awaited<
    ReturnType<OwnerClient['listPendingInvitations']>
  > | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    client.listPendingInvitations().then(
      (result) => {
        if (current) setInvitations(result)
      },
      () => {
        if (current) setError(true)
      },
    )
    return () => {
      current = false
    }
  }, [client])

  async function accept(invitation: NonNullable<typeof invitations>[number]) {
    setBusy(true)
    setError(false)
    setRole(null)
    try {
      const storeId = await client.acceptInvitation(
        invitation.invitationId,
        invitation.version,
        crypto.randomUUID(),
      )
      await client.selectStore(storeId)
      setRole(invitation.role)
      navigate('/store-portal')
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <main>
      <section className="page-card" aria-labelledby="team-invitations-heading">
        <h1 id="team-invitations-heading">Team invitations</h1>
        {invitations === null && !error && <p role="status">Checking invitations…</p>}
        {error && <p role="alert">{OWNER_ACCESS_ERROR} Sign in with MFA, then try again.</p>}
        {invitations?.length === 0 && <p>No pending team invitations.</p>}
        {invitations && invitations.length > 0 && (
          <ul>
            {invitations.map((invitation) => (
              <li key={invitation.invitationId}>
                <h2>{invitation.storeName}</h2>
                <p>
                  {invitation.inviterName} invited you as {ownerTeamRoleLabel[invitation.role]}.
                </p>
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void accept(invitation)}
                >
                  Accept invitation to {invitation.storeName}
                </button>
              </li>
            ))}
          </ul>
        )}
        {busy && <p role="status">Accepting invitation…</p>}
        <p>
          <Link to="/more">Back</Link>
        </p>
      </section>
    </main>
  )
}
