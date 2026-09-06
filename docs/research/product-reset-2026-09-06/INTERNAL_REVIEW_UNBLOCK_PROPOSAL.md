# Decision needed to execute the remaining hosted review

Status: Product Owner approved this scoped `update plan` proposal by replying `approved`; the dedicated amendment must merge before dependent implementation. Date: 2026-09-06. Evidence: NEW_DEPLOYMENT_RECEIPT.md, NEW_BACKEND_BOUNDARY_PROBES.json, INTERNAL_REVIEW_GATEWAY_CONFIG.md, WORKFLOW_DISPOSITION.md. The new source was built and published; the real application is unavailable for admitted-user workflows under the current isolated stage configuration.

## Verified problem

The isolated backend has the full 120-migration chain but no `authenticator` membership in `public_catalog_gateway`. Its stage is `synthetic_alpha` with private authentication and all private capabilities false, and no admission receipt. Correctly configured catalog traffic returns 503. The current internal-review authorization permits deployment but explicitly forbids fabricating existing release receipts or bypassing server capability checks. Creating test users or fictional stores alone cannot resolve this.

## Recommended outcome

Implement a separately governed internal synthetic assessment context that can admit only this task's explicitly allowlisted synthetic identities and owned fixtures on the isolated backend. Keep existing Shared Alpha/Beta/public/commercial gates intact. Use genuine, typed internal-review authorization evidence distinct from H-01 or shared-stage receipts; do not overload or fabricate those receipts. Preserve role/store/account authorization, RLS, session registry/revocation, MFA where required, private storage, expiry and cleanup. Registration, email delivery, external participants, external providers and payment activation stay disabled under this decision.

The product reset should then exercise the actual configured runtime with these identities. Paths that intrinsically require real providers, professional assessment or human participants remain separately blocked; an internal assessment cannot prove their outcomes.

## Small independently closable work

1. **Conforming gateway repair:** add the missing narrowly scoped PostgREST role membership through a forward-only migration; independent authorization review and hosted database checks. Prove that only the intended catalog gateway role is available, and direct anonymous table access remains denied. Do not broaden to service_role or blanket grants.
2. **Dedicated plan amendment:** define internal context, typed authorization evidence, allowed identities/data, capabilities, explicit external exclusions, expiry, revocation and teardown. Update every affected controlling source together, append PLAN_CHANGELOG, independently review and merge before dependent implementation.
3. **Internal admission implementation:** validate the real internal authorization, provision narrowly scoped task fixtures through approved code, preserve all cross-account/store denials, and make absence/expiry of the authorization fail closed. Keep existing release evidence types and validators unchanged in meaning.
4. **Exact-candidate re-publication and review:** rebuild after fresh required checks and independent affected review; verify the new artifact/backend/protection identity, then execute the queued scenarios. Record actual expected/denied/interrupted results rather than equating a successful login with a passed journey.

Effort is uncertain until the shared authorization seams are designed. These are separate outcomes, not a single large feature ticket. The gateway repair alone will not open the closed stage. Real provider and human evidence remains outside these repository outcomes.

## Proposed authorization wording

### Exact assessment boundary for the amendment

- Owner and internal authorization issuer: Product Owner Scott Marquis, whose recorded decision authorizes this assessment; executor and teardown owner: this Codex task. This is an internal decision record, not a signature by an H-01/SEC-01 professional signer.
- Backend allowlist: project ref `ykyrvqddgnfmgftjwpts` only. Browser origin allowlist starts with the protected Preview from NEW_DEPLOYMENT_RECEIPT.json; any rebuilt Preview must be independently verified and entered in a versioned replacement record before use. No production/custom hostname or existing beta project is included.
- Fixture namespace: `review-reset-20260906`. Exact allowed persona aliases: shopper-a, shopper-b, representative-a, representative-b, administrator-a, navigator-a, revoked-a. No general self-enrollment or wildcard identity domain. The private fixture manifest must record each provider-generated Auth UUID, alias, controlled address at the reserved `.invalid` domain, allowed role, owned store/trip IDs, intended negative-test relationships, created_at, expires_at and cleanup state before the identity is admitted. Administrative assurance and account/store separation remain enforced. If the supported Auth configuration cannot admit such users without enabling real delivery, that path remains blocked pending a separately reviewed design.
- Fixture stores: only the 12 deterministic fictional records `00000000-0000-4000-8000-000000001001` through `00000000-0000-4000-8000-000000001012` from the pinned source seed, with their referenced synthetic category/area/media/hour records. Additional trip, note, export, media or review fixtures must be explicitly linked to those admitted identities and added to the manifest before creation. No copied beta records or unowned objects.
- Proposed typed internal authorization fields: schema_version, context=`internal_synthetic_assessment`, receipt_id, owner_decision_reference, issuer_role=`product_owner`, executor_task_id, backend_project_ref, source_sha, deployment_id, artifact_digest, exact_origin, fixture_manifest_digest, identity_allowlist, allowed_capabilities, excluded_provider_actions, issued_at, expires_at, revoked_at, revocation_reason and teardown_owner. Reject absent/mismatched fields, unknown contexts, stale source/configuration, unlisted identities and excluded operations at the server boundary. The internal receipt cannot satisfy any existing public/shared-stage receipt predicate.
- Lifetime: at most 24 hours from issuance, no automatic renewal. Renewal requires a fresh owner-authorized internal record and current source/configuration/protection checks. Expiry/revocation denies new private operations and sessions and starts task-owned session/fixture cleanup; pending exports and signed offline access must respect the same revocation rules. Teardown follows ADR0007, including withdrawal of only the new deployment and removal of owned resources when the review ends.
- Free-resource basis: NEW_DEPLOYMENT_RECEIPT.md and RESOURCE_OWNERSHIP.json record the second free/nano Supabase project; DEPLOYMENT_DECISION.md and BUILD_DEPLOY_STATUS.md preserve the bounded Vercel unpaid prototype/internal assessment eligibility evidence. Recheck actual account limits before any additional resource. No upgrade, trial, add-on, paid provider, external cohort or revenue activity is authorized.

### Concrete gateway repair and denial checks

Proposed new forward migration (not executed by this proposal):

```sql
begin;
grant public_catalog_gateway to authenticator;
notify pgrst, 'reload schema';
commit;
```

The grant changes no table or function privileges and does not enable a stage. Verify `pg_has_role` becomes true for that exact membership; an anon token still cannot read private/direct store tables, a missing token is rejected, and the gateway still refuses an absent/expired internal authorization. With an accepted internal context, prove intended synthetic projection and cross-account/store denials using two scoped identities. Refresh independent exact-head authorization review and required hosted checks before merge/publication.

If this membership must be withdrawn, use a new forward migration containing the matching `revoke public_catalog_gateway from authenticator` and PostgREST notification; do not rewrite history or reset the database. Restore behavior must preserve existing role grants and fail closed for the withdrawn gateway. The internal-admission schema/validator migration is a separate designed and reviewed implementation after the plan amendment; no speculative SQL in this proposal is executable authority.

> update plan: authorize a dedicated owner-only internal synthetic assessment context for this product-reset review, with explicit allowlisted test identities and task-owned fixtures, genuine internal-review authorization evidence separate from public/shared-stage release receipts, preserved server authorization and cleanup, no real email or users, no payments or paid resources, and no public activation; then implement and independently verify the minimal conforming gateway and admission changes needed to resume the full hosted review.

This would authorize only the proposed internal assessment and its enabling work. It would not accept the broader product findings or authorize a public launch. PLAN_GOVERNANCE.md, `Locked by default` and `Authorized plan-change process`, require this separate scoped product decision because ADR0007 currently authorizes deployment while retaining the application's existing closed capabilities.
