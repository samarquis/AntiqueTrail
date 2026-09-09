import type { AdminClient, AdminAuditEntry } from '../features/admin'
import { GENERIC_ADMIN_FAILURE } from '../features/admin'

/** Synthetic UI fixture only; production authorization is exercised in pgTAP. */
export function withRecordAuditReview(client: AdminClient): AdminClient {
  const records = new Map<string, AdminAuditEntry[]>()
  function reference(entries: AdminAuditEntry[]) {
    const access = crypto.randomUUID()
    records.set(access, entries)
    return access
  }
  return {
    ...client,
    async getCase(id) {
      const record = await client.getCase(id)
      return { ...record, auditAccess: reference(record.audit) }
    },
    async listStoreGrants(retry) {
      return (await client.listStoreGrants(retry)).map((record) => ({
        ...record,
        auditAccess: reference(record.recentActivity),
      }))
    },
    async readAudit(access) {
      const entries = records.get(access)
      if (!entries) throw new Error(GENERIC_ADMIN_FAILURE)
      return structuredClone(entries)
    },
  }
}
