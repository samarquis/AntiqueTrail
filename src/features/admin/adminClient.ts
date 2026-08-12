import type {
  AdminDecision,
  AdminDecisionResult,
  AdminMergePlan,
  AdminReviewCaseDetail,
  AdminReviewCaseSummary,
  AdminScopeResult,
  AdminScopePreview,
  AdminStoreScope,
} from './types'
import { GENERIC_ADMIN_FAILURE } from './boundary'

type AdminRpcName =
  | 'admin_list_review_cases'
  | 'admin_get_review_case'
  | 'admin_decide_review_case'
  | 'admin_list_store_scopes'
  | 'admin_preview_store_scope_change'
  | 'admin_change_store_scope'
  | 'admin_preview_duplicate_merge'
  | 'admin_execute_duplicate_merge'
  | 'admin_rollback_duplicate_merge'

export interface AdminRpcTransport {
  rpc(
    name: AdminRpcName,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>
}

export interface AdminClient {
  listCases(retry?: boolean): Promise<AdminReviewCaseSummary[]>
  getCase(caseId: string): Promise<AdminReviewCaseDetail>
  decideCase(
    caseId: string,
    action: AdminDecision,
    reason: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<AdminDecisionResult>
  listStoreGrants(retry?: boolean): Promise<AdminStoreScope[]>
  previewStoreScopeChange(
    subjectUserId: string,
    storeId: string,
    expectedVersion: number,
  ): Promise<AdminScopePreview>
  changeStoreScope(
    operation: 'revoke' | 'regrant',
    subjectUserId: string,
    storeId: string,
    expectedVersion: number,
    reasonCode: string,
    idempotencyKey: string,
    previewId: string | null,
  ): Promise<AdminScopeResult>
  previewDuplicateMerge(canonicalStoreId: string, duplicateStoreId: string): Promise<AdminMergePlan>
  executeDuplicateMerge(
    proposalId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<AdminMergePlan>
  rollbackDuplicateMerge(
    proposalId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<AdminMergePlan>
}

export function createAdminClient(transport: AdminRpcTransport): AdminClient {
  async function call<T>(name: AdminRpcName, args?: Record<string, unknown>): Promise<T> {
    try {
      const result = await transport.rpc(name, args)
      if (result.error || result.data === null || result.data === undefined)
        throw new Error(GENERIC_ADMIN_FAILURE)
      return result.data as T
    } catch {
      throw new Error(GENERIC_ADMIN_FAILURE)
    }
  }

  return {
    listCases: () => call('admin_list_review_cases'),
    getCase: (caseId) => call('admin_get_review_case', { p_case_id: caseId }),
    decideCase: (caseId, action, reason, expectedVersion, idempotencyKey) =>
      call('admin_decide_review_case', {
        p_case_id: caseId,
        p_action: action,
        p_reason: reason,
        p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey,
      }),
    listStoreGrants: () => call('admin_list_store_scopes'),
    previewStoreScopeChange: (subjectUserId, storeId, expectedVersion) =>
      call('admin_preview_store_scope_change', {
        p_subject_user_id: subjectUserId,
        p_store_id: storeId,
        p_expected_version: expectedVersion,
      }),
    changeStoreScope: (
      operation,
      subjectUserId,
      storeId,
      expectedVersion,
      reasonCode,
      idempotencyKey,
      previewId,
    ) =>
      call('admin_change_store_scope', {
        p_operation: operation,
        p_subject_user_id: subjectUserId,
        p_store_id: storeId,
        p_expected_version: expectedVersion,
        p_reason_code: reasonCode,
        p_idempotency_key: idempotencyKey,
        p_preview_id: previewId,
      }),
    previewDuplicateMerge: (canonicalStoreId, duplicateStoreId) =>
      call('admin_preview_duplicate_merge', {
        p_canonical_store_id: canonicalStoreId,
        p_duplicate_store_id: duplicateStoreId,
      }),
    executeDuplicateMerge: (proposalId, expectedVersion, idempotencyKey) =>
      call('admin_execute_duplicate_merge', {
        p_proposal_id: proposalId,
        p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey,
      }),
    rollbackDuplicateMerge: (proposalId, expectedVersion, idempotencyKey) =>
      call('admin_rollback_duplicate_merge', {
        p_proposal_id: proposalId,
        p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey,
      }),
  }
}

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error(GENERIC_ADMIN_FAILURE))
}

export const unavailableAdminClient: AdminClient = {
  listCases: unavailable,
  getCase: unavailable,
  decideCase: unavailable,
  listStoreGrants: unavailable,
  previewStoreScopeChange: unavailable,
  changeStoreScope: unavailable,
  previewDuplicateMerge: unavailable,
  executeDuplicateMerge: unavailable,
  rollbackDuplicateMerge: unavailable,
}
