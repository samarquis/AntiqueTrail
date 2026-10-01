export interface OwnerStore {
  storeId: string
  name: string
  role: OwnerTeamRole
}

export type OwnerTeamRole = 'store_owner' | 'co_owner' | 'full_store_access' | 'listing_editor'
export type OwnerTeamInviteRole = Exclude<OwnerTeamRole, 'store_owner'>
export const ownerTeamRoleLabel: Record<OwnerTeamRole, string> = {
  store_owner: 'Store Owner',
  co_owner: 'Co-Owner',
  full_store_access: 'Full Store Access',
  listing_editor: 'Listing Editor',
}

export interface OwnerTeamMember {
  accessId: string
  role: OwnerTeamRole | 'store_owner'
  displayName: string
  version: number
  canRevoke: boolean
}

export interface OwnerTeamInvitation {
  invitationId: string
  role: OwnerTeamRole
  version: number
  canCancel: boolean
}

export interface PendingOwnerInvitation {
  invitationId: string
  storeId: string
  storeName: string
  inviterName: string
  role: OwnerTeamRole
  version: number
}

export interface OwnerClient {
  listStores(): Promise<OwnerStore[]>
  selectStore(storeId: string): Promise<void>
  listTeam(
    storeId: string,
  ): Promise<{ members: OwnerTeamMember[]; invitations: OwnerTeamInvitation[] }>
  inviteTeam(
    storeId: string,
    email: string,
    role: OwnerTeamInviteRole,
    idempotencyKey: string,
  ): Promise<void>
  cancelTeamInvitation(
    storeId: string,
    invitationId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<void>
  revokeTeamMember(
    storeId: string,
    accessId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<void>
  listPendingInvitations(): Promise<PendingOwnerInvitation[]>
  acceptInvitation(
    invitationId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<string>
}

export const OWNER_ACCESS_ERROR = 'Store workspace access is unavailable.'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const roles = ['store_owner', 'co_owner', 'full_store_access', 'listing_editor'] as const
const inviteRoles = ['co_owner', 'full_store_access', 'listing_editor'] as const

function role(value: unknown): OwnerTeamRole {
  if (typeof value !== 'string' || !roles.includes(value as OwnerTeamRole))
    throw new Error(OWNER_ACCESS_ERROR)
  return value as OwnerTeamRole
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error(OWNER_ACCESS_ERROR)
  return value
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(OWNER_ACCESS_ERROR)
  return value as Record<string, unknown>
}

function throwIfConflict(result: Record<string, unknown>) {
  if (result.state === 'conflict')
    throw new Error(`Team access changed. Current version: ${version(result.version)}.`)
}

export function createOwnerClient(
  rpc: (command: string, payload: Readonly<Record<string, unknown>>) => Promise<unknown>,
): OwnerClient {
  return {
    async listStores() {
      const result = object(await rpc('owner_list_stores', {}))
      if (result.role !== 'Store Owner' || !Array.isArray(result.stores) || !result.stores.length)
        throw new Error(OWNER_ACCESS_ERROR)
      return result.stores.map((value) => {
        const store = object(value)
        if (
          typeof store.storeId !== 'string' ||
          !uuid.test(store.storeId) ||
          typeof store.name !== 'string' ||
          !store.name.trim()
        )
          throw new Error(OWNER_ACCESS_ERROR)
        return {
          storeId: store.storeId,
          name: store.name,
          role: store.role === undefined ? 'store_owner' : role(store.role),
        }
      })
    },
    async selectStore(storeId) {
      if (!uuid.test(storeId)) throw new Error(OWNER_ACCESS_ERROR)
      const result = object(await rpc('owner_select_store', { p_store_id: storeId }))
      if (result.storeId !== storeId) throw new Error(OWNER_ACCESS_ERROR)
    },
    async listTeam(storeId) {
      if (!uuid.test(storeId)) throw new Error(OWNER_ACCESS_ERROR)
      const result = object(await rpc('owner_team_list', { p_store_id: storeId }))
      if (!Array.isArray(result.members) || !Array.isArray(result.invitations))
        throw new Error(OWNER_ACCESS_ERROR)
      const members = result.members.map((value) => {
        const member = object(value)
        if (
          typeof member.accessId !== 'string' ||
          !uuid.test(member.accessId) ||
          typeof member.displayName !== 'string' ||
          typeof member.canRevoke !== 'boolean'
        )
          throw new Error(OWNER_ACCESS_ERROR)
        const memberRole = role(member.role)
        return {
          accessId: member.accessId,
          role: memberRole,
          displayName: member.displayName,
          version: version(member.version),
          canRevoke: member.canRevoke,
        }
      })
      const invitations = result.invitations.map((value) => {
        const invitation = object(value)
        if (
          typeof invitation.invitationId !== 'string' ||
          !uuid.test(invitation.invitationId) ||
          typeof invitation.canCancel !== 'boolean'
        )
          throw new Error(OWNER_ACCESS_ERROR)
        return {
          invitationId: invitation.invitationId,
          role: role(invitation.role),
          version: version(invitation.version),
          canCancel: invitation.canCancel,
        }
      })
      return { members, invitations }
    },
    async inviteTeam(storeId, email, inviteRole, idempotencyKey) {
      if (!uuid.test(storeId) || !inviteRoles.includes(inviteRole) || !key.test(idempotencyKey))
        throw new Error(OWNER_ACCESS_ERROR)
      const recipientEmail = email.trim().toLowerCase()
      if (
        recipientEmail.length < 3 ||
        recipientEmail.length > 320 ||
        !/^[^\s@]+@[^\s@]+$/.test(recipientEmail)
      )
        throw new Error(OWNER_ACCESS_ERROR)
      const result = object(
        await rpc('owner_team_invite', {
          p_store_id: storeId,
          p_recipient_email: recipientEmail,
          p_role: inviteRole,
          p_idempotency_key: idempotencyKey,
        }),
      )
      if (typeof result.invitationId !== 'string' || !uuid.test(result.invitationId))
        throw new Error(OWNER_ACCESS_ERROR)
    },
    async cancelTeamInvitation(storeId, invitationId, expectedVersion, idempotencyKey) {
      if (
        !uuid.test(storeId) ||
        !uuid.test(invitationId) ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1 ||
        !key.test(idempotencyKey)
      )
        throw new Error(OWNER_ACCESS_ERROR)
      const result = object(
        await rpc('owner_team_cancel', {
          p_store_id: storeId,
          p_invitation_id: invitationId,
          p_expected_version: expectedVersion,
          p_idempotency_key: idempotencyKey,
        }),
      )
      throwIfConflict(result)
      if (result.state !== 'cancelled') throw new Error(OWNER_ACCESS_ERROR)
    },
    async revokeTeamMember(storeId, accessId, expectedVersion, idempotencyKey) {
      if (
        !uuid.test(storeId) ||
        !uuid.test(accessId) ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1 ||
        !key.test(idempotencyKey)
      )
        throw new Error(OWNER_ACCESS_ERROR)
      const result = object(
        await rpc('owner_team_revoke', {
          p_store_id: storeId,
          p_grant_id: accessId,
          p_expected_version: expectedVersion,
          p_idempotency_key: idempotencyKey,
        }),
      )
      throwIfConflict(result)
      if (result.state !== 'revoked') throw new Error(OWNER_ACCESS_ERROR)
    },
    async listPendingInvitations() {
      const result = object(await rpc('owner_team_invitations', {}))
      if (!Array.isArray(result.invitations)) throw new Error(OWNER_ACCESS_ERROR)
      return result.invitations.map((value) => {
        const invitation = object(value)
        if (
          typeof invitation.invitationId !== 'string' ||
          !uuid.test(invitation.invitationId) ||
          typeof invitation.storeId !== 'string' ||
          !uuid.test(invitation.storeId) ||
          typeof invitation.storeName !== 'string' ||
          typeof invitation.inviterName !== 'string'
        )
          throw new Error(OWNER_ACCESS_ERROR)
        return {
          invitationId: invitation.invitationId,
          storeId: invitation.storeId,
          storeName: invitation.storeName,
          inviterName: invitation.inviterName,
          role: role(invitation.role),
          version: version(invitation.version),
        }
      })
    },
    async acceptInvitation(invitationId, expectedVersion, idempotencyKey) {
      if (
        !uuid.test(invitationId) ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1 ||
        !key.test(idempotencyKey)
      )
        throw new Error(OWNER_ACCESS_ERROR)
      const result = object(
        await rpc('owner_team_accept', {
          p_invitation_id: invitationId,
          p_expected_version: expectedVersion,
          p_idempotency_key: idempotencyKey,
        }),
      )
      throwIfConflict(result)
      if (typeof result.storeId !== 'string' || !uuid.test(result.storeId))
        throw new Error(OWNER_ACCESS_ERROR)
      return result.storeId
    },
  }
}

export const unavailableOwnerClient: OwnerClient = {
  listStores: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  selectStore: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  listTeam: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  inviteTeam: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  cancelTeamInvitation: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  revokeTeamMember: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  listPendingInvitations: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
  acceptInvitation: async () => {
    throw new Error(OWNER_ACCESS_ERROR)
  },
}
