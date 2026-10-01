import { useState } from 'react'
import {
  OWNER_ACCESS_ERROR,
  ownerTeamRoleLabel,
  type OwnerClient,
  type OwnerStore,
  type OwnerTeamInvitation,
  type OwnerTeamInviteRole,
  type OwnerTeamMember,
} from './ownerClient'

export function OwnerTeamPanel({ store, client }: { store: OwnerStore; client: OwnerClient }) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<OwnerTeamMember[]>([])
  const [invitations, setInvitations] = useState<OwnerTeamInvitation[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OwnerTeamInviteRole>(
    store.role === 'full_store_access' ? 'listing_editor' : 'co_owner',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmingAccessId, setConfirmingAccessId] = useState<string | null>(null)
  const availableRoles: OwnerTeamInviteRole[] =
    store.role === 'full_store_access'
      ? ['listing_editor']
      : ['co_owner', 'full_store_access', 'listing_editor']

  async function refresh() {
    setBusy(true)
    setError(false)
    try {
      const result = await client.listTeam(store.storeId)
      setMembers(result.members)
      setInvitations(result.invitations)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  async function toggle() {
    if (!open) await refresh()
    setOpen((value) => !value)
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(false)
    setMessage('')
    try {
      await client.inviteTeam(store.storeId, email, role, crypto.randomUUID())
      setEmail('')
      setMessage('If that verified account exists, an invitation is ready to accept.')
      await refresh()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  async function cancel(invitation: OwnerTeamInvitation) {
    setBusy(true)
    setError(false)
    try {
      await client.cancelTeamInvitation(
        store.storeId,
        invitation.invitationId,
        invitation.version,
        crypto.randomUUID(),
      )
      await refresh()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  async function revoke(member: OwnerTeamMember) {
    setBusy(true)
    setError(false)
    try {
      await client.revokeTeamMember(
        store.storeId,
        member.accessId,
        member.version,
        crypto.randomUUID(),
      )
      setConfirmingAccessId(null)
      await refresh()
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  if (store.role === 'listing_editor') return null

  return (
    <section aria-label={`Team access for ${store.name}`}>
      <button className="button" type="button" aria-expanded={open} onClick={() => void toggle()}>
        {open ? 'Hide team access' : `Manage team access for ${store.name}`}
      </button>
      {open && (
        <div>
          <h3>Team access</h3>
          {busy && <p role="status">Updating team access…</p>}
          {error && <p role="alert">{OWNER_ACCESS_ERROR} Refresh and try again.</p>}
          {message && <p role="status">{message}</p>}
          {!busy && !error && members.length === 0 && invitations.length === 0 && (
            <p>No team members or pending invitations.</p>
          )}
          {members.length > 0 && (
            <ul aria-label="Active team members">
              {members.map((member) => (
                <li key={member.accessId}>
                  <span>
                    {member.displayName} — {ownerTeamRoleLabel[member.role]}
                  </span>
                  {member.canRevoke && (
                    <>
                      <button
                        className="button"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingAccessId(member.accessId)}
                      >
                        Remove {member.displayName}
                      </button>
                      {confirmingAccessId === member.accessId && (
                        <div role="group" aria-label="Confirm team access removal">
                          <p>
                            Remove {member.displayName}’s access? They lose access immediately. This
                            cannot be undone.
                          </p>
                          <button
                            className="button"
                            type="button"
                            disabled={busy}
                            onClick={() => void revoke(member)}
                          >
                            Confirm remove {member.displayName}
                          </button>
                          <button
                            className="button"
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirmingAccessId(null)}
                          >
                            Keep access
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {invitations.length > 0 && (
            <ul aria-label="Pending team invitations">
              {invitations.map((invitation) => (
                <li key={invitation.invitationId}>
                  <span>{ownerTeamRoleLabel[invitation.role]} — awaiting acceptance</span>
                  {invitation.canCancel && (
                    <button
                      className="button"
                      type="button"
                      disabled={busy}
                      onClick={() => void cancel(invitation)}
                    >
                      Cancel {ownerTeamRoleLabel[invitation.role]} invitation
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(event) => void invite(event)}>
            <label htmlFor={`team-email-${store.storeId}`}>Verified teammate email</label>
            <input
              id={`team-email-${store.storeId}`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor={`team-role-${store.storeId}`}>Store role</label>
            <select
              id={`team-role-${store.storeId}`}
              value={role}
              onChange={(event) => setRole(event.target.value as OwnerTeamInviteRole)}
            >
              {availableRoles.map((nextRole) => (
                <option key={nextRole} value={nextRole}>
                  {ownerTeamRoleLabel[nextRole]}
                </option>
              ))}
            </select>
            <button className="button" type="submit" disabled={busy}>
              Invite teammate
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
