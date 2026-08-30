# Issue #125 independent final review

Reviewer: separate agent `/root/ticket125_final_review`

Review base: `265306b35c71f851ecdd5998903f93508078265e`

Final reviewed candidate: `9170707220f28f6dfc96485ac53a566f29955834` plus evidence-only commits following it.

Result: GO

The initial review correctly rejected the candidate because its security-definer RPC used a direct active-grant lookup instead of the canonical Portal scope guard, and its cross-store fixture did not authenticate a representative for the second store. The remediation moves the RPC to the shared scope guard, repairs that guard's invalid `min(uuid)` aggregate with an exact-one cardinality check, and makes both security-definer functions owned by `identity_service`.

The reviewer verified that `authenticated`, `anon`, and `public` have no execute privilege on `portal_private.require_portal_scope()`, while the public RPC invokes it as its service owner. The pgTAP fixture exercises the public RPC under current session/MFA/recent-auth claims and proves a separately authorized representative receives only the other store's one record. The reviewed diff remains confined to ticket seams, contains no protected plan changes, and passes `git diff --check`.

Hosted CI also exposed that the migration runner is `supabase_admin`, not the helper owner. The final review confirmed the repair follows the established Package 6B pattern: temporarily grant `identity_service` schema USAGE/CREATE, `SET ROLE identity_service` for replacement, then reset the role and revoke CREATE. Direct privilege inspection confirmed no browser role receives helper execution, `identity_service` finishes with schema USAGE but no CREATE, and the public RPC is executable only by `authenticated`.

The final ownership review confirmed that the helper and public RPC transitions must remain separate: `portal_private` CREATE exists only while `identity_service` replaces its helper, while `app_public` CREATE exists only for transfer of the public RPC from its existing `supabase_admin` owner. The migration revokes both capabilities immediately, then performs the public function ACL/comment work as final owner `identity_service`; no browser/helper execution grant or durable CREATE privilege is introduced.

Note: the reviewer did not obtain an independent completed `npx` receipt because its harness ended after connection output; the current-thread command receipt records the required 26-test pass. This limitation does not replace the required hosted database and web checks.
