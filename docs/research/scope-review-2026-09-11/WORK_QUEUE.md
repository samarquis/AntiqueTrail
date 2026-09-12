# Bounded work queue and adoption map

September 11, 2026. This is a proposed execution map plus a dated backlog review. GitHub owns live status. Do not start implementation from this document; use the admitted live issue and current merged requirements. [Review](REVIEW.md), [proposed PRD](PROPOSED_PRD.md), [applied changes and verification](CHANGES.md).

## Current work: preserve before splitting

Do not slice the completed portion of #323 into fresh implementation tickets. Its existing PR has nine changed files and the latest isolation repair is already committed. Give its existing owner one checkpoint at a time:

1. Integrate preserved `9009adbc` with current main in an isolated candidate; preserve main's changes and pin the resulting SHA. Finish when conflicts are resolved and focused static checks pass. No diagnostic during edits.
2. Run the configured admin diagnostic on that frozen candidate, including desktop, phone and wrong-readback control. Finish when each result and owned cleanup is recorded truthfully. If startup is unavailable, record the failed phase; if an assertion fails, diagnose that assertion before another full run.
3. Obtain fresh independent review of the final source, complete required hosted checks, refresh PR evidence and merge/confirm #323 closure. These are bounded delivery steps in the same PR, not three duplicate feature tickets.

For #321, preserve PR #334 and its raw artifacts. Separate the investigation of failed acceptance from implementing accepted-partner removal and from the diagnostic's eventual joined browser proof. Pending invitation revoke is not accepted-member removal. Do not mark #321 complete because a fixture test passes or because its new child issues exist.

For #325, separate the written worksheet from the firsthand testing. PR #329 can close a documentation child; #325 remains open until actual observations exist. #324 likewise remains a human gate. Neither should be sent to an autonomous coding worker for closure.

## Small task cards

The first four cards are current-plan work, not new product intent. The remainder are **post-amendment candidates**, not alleged defects and not automatically admitted implementation tickets. Existing code and closed issues must be checked before creating any of them. No target ticket count is required.

Published current-plan cards: A → [#342](https://github.com/samarquis/AntiqueTrail/issues/342), B → [#343](https://github.com/samarquis/AntiqueTrail/issues/343), C → [#344](https://github.com/samarquis/AntiqueTrail/issues/344), D → [#345](https://github.com/samarquis/AntiqueTrail/issues/345). Each has three acceptance criteria; #344 explicitly depends on #343. They do not authorize a worker restart. Existing #321/#323 ready labels were removed during the review pause.

| Card | One result and acceptance | Files / evidence | Dependency and parallel lane |
| --- | --- | --- | --- |
| A | Explain the correct-recipient invitation failure: sanitized real RPC error, independent invitation/member readback, and a reproduction that distinguishes fixture/transport/product cause | #321 artifacts and dedicated diagnostic; no application repair | Independent investigation; reuse existing owner/candidate. Trip lane, proposed deferral. |
| B | Provide one creator-authorized accepted-partner removal server transition; unrelated callers denied, next-request membership revoked, Navigator/offline effects match existing contract | Forward-only migration and focused database allow/deny tests | Independent of acceptance diagnosis using accepted-member fixtures. Sensitive review; park pending trip priority. |
| C | Connect creator removal to collaboration UI; successful removal returns truthful state, cancel/failure changes nothing, unauthorized UI cannot grant access | Trip client/types, collaboration UI, focused phone/desktop test | Depends on B's merged API. One trip UI writer. |
| D | Deliver the existing human accessibility worksheet in main, with exact-candidate and actual device/AT fields, while leaving human gate open | Existing PR #329, one Markdown file | Independent documentation lane. Reuse written work. |
| E | Verify a reproducible internal showcase handoff: exact candidate, routes, fixture versus real-service labels, owner-readable startup/access steps | Reuse #251 and existing evaluation packets; update only stale setup/evidence | After store-first amendment. Start by checking existing artifact; no duplicate runner. |
| F | Prove Browse → details → photos → return on that candidate, or file the exact failing transition | Existing catalog and #327 evidence; one scoped browser result | Same candidate as E; independent read-only lane. Do not rebuild gallery. |
| G | Prove representative edit → admin approval → public listing for one fictional shop, or identify the exact missing step | Existing Portal/Admin/media clients; real-local proof where boundary is claimed | Same candidate/setup as E; unique fixtures. No paid work. |
| H | Record owner computer-then-phone showcase decision with actual observations | Revised #324 after amendment, existing worksheet | Human; depends on E and selected-path readiness, not trip completion. |
| I | Produce a named real-store pilot activation checklist for the chosen deployment/content/account path, with each necessary outstanding gate owned | Existing operations/provider evidence, reused and revalidated | Planning/operations after scope decision; no deployment or outreach implied. |
| J | Confirm the single Gallery commercial offer: exact price, included photos, cancellation/refund/service limits and owner decision | One inactive commercial configuration and existing terms sources | Human/business decision; no invented pricing. Can prepare beside pilot work. |
| K | Verify one Stripe test-mode Free → Gallery purchase and cancellation through existing hosted products, with signed-event-only entitlement changes | Existing billing functions and provider test artifacts | Explicit test-provider authorization/configuration; depends on J. Sensitive review. Split a reproduced failure into one focused repair. |
| L | Record permitted real owner feedback and paid-pilot continue/revise/stop decision | Named participants, firsthand observations, operating/provider evidence | Human/activation gate; not a coding ticket and not automatic launch. |

Cards B/C are real unfinished trip requirements under today's plan. Their existence should not silently put them ahead of store feedback. After the proposed stage amendment, retain them in the deferred backlog with no implementation-ready label. Do not delete the evidence or pretend these features passed.

## Suitable worker handoff

Give a worker: issue URL; exact base SHA; current ownership/worktree and published/unpublished source; one desired outcome; two or three observable acceptance criteria; exact file/heading references; focused command; required runtime; and the definition of closure. Confirm the command can reach the selected test before assigning a long autonomous run.

Prefer small local UI, documentation and fixture corrections for low-effort Terra. Do not give it an undefined instruction such as "finish all auth and security acceptance." A task's complexity comes from unresolved decisions and coupled boundaries, not its number of checkboxes. No claim about model success rate is established by this review.

One failed assertion should produce one evidence-backed diagnosis. Do not repeatedly wake a worker with "continue" after an unchanged failure. Stop a run before editing its source or fixtures. Batch review/CI after a coherent source candidate, rather than introducing an evidence-only source change after every observation. Follow current proportional checks; never weaken boundary tests to make a task look easy.

## Parallel work that is actually independent

- Worksheet documentation can run beside either diagnostic.
- Admin and trip diagnostics can run beside each other only with distinct loopback ports, Docker/project identities and fixture users. Shared Docker startup may need a short serialized resource reservation; that does not impose a feature dependency.
- Trip backend B and investigation A can be developed separately with accepted-member fixtures; UI C waits for the server contract.
- Read-only shopper and store workflow evaluations can use the same frozen build with separate accounts/fixtures. A source edit requires a new candidate and affected retest.
- Changes to `package.json`, shared configured-service runners or shared evidence files have one integration owner. Do not let separate workers independently repair the same shared file.
- Human feedback and business decisions are scheduled separately. Automated tests do not supply them.

## Protected-source amendment map

An adoption PR must be documentation-only, use the owner's exact authorization, and reconcile these sources together. This map is not a substitute for that amendment/review.

| Source / exact heading | Proposed change |
| --- | --- |
| PRD: Purpose, people, and product promise; Product summary; Product vision; Product goals | Lead with store showcase and optional photo membership; move trip vision to later stage. |
| PRD: The connected shopper experience; The store and administrator experience; Next milestone: Free private experience evaluation | Install proposed core paths and bounded internal showcase acceptance; preserve separate human evidence. |
| PRD: Startup Learning MVP; Regional Public MVP; Launch promotion and prospective-owner acquisition; Stage dependencies | Remove trip benchmark/geographic expansion as prerequisites to store pilot and first paid offer; retain explicit staged exposure. |
| PRD: Budget and commercial direction; Provider and external-action prerequisites; Deferred implementation boundary | Distinguish internal demo, real-store pilot, public release and paid activation; defer Full Gallery sales/featured placement. No infrastructure spending inferred. |
| DESIGN: Implementation acceptance journeys; Shared-trip handoff; Store Representative portal; Paid-tier changes | Route stage acceptance to chosen store journey; preserve deferred-feature semantics and existing visual direction. |
| DESIGN_SYSTEM: relevant route/screen acceptance and accessibility sections | Update only milestone applicability where required; no palette/typography redesign. |
| SECURITY_AND_TRUST: applicable external-testing, release, provider and privileged-control sections | Keep real privacy/authorization/payment controls; map necessary evidence to the correct stage rather than importing every later feature gate. |
| PACKAGE_CONTRACTS: Package 5A; Package 6/7; Packages 8–13 | Preserve technical contracts for existing code, reconcile stage prerequisites and initial one-paid-offer boundary; no code migration in this PR. |
| docs/specs/store-membership-spec.md: Tier model; Stage-specific owner acceptance; acquisition/payment clauses | Offer Free/Gallery first, defer Full Gallery sales, replace mandatory three-community prerequisite with bounded paid-pilot evidence. Preserve incumbent obligations pending provider-state verification. |
| docs/specs/owner-onboarding.md: Purpose and baseline; Journey map | Prefer existing invited pilot variant first; retain verified identity, scope approval and simpler user-facing progression. |
| Accepted ADRs affected by stage/environment changes | Identify exact affected decisions; supersede only the named stage boundary in a new ADR if necessary. Do not erase historical constraints or claim old test authority applies to new hosting. |
| README; PLANNING_INDEX; CODEX_START_PROMPT; manifest.json | Make the short PRD the entry point and preserve one owner per specialist requirement. |
| PROJECT_STATE; PRODUCT_DECISIONS; PLAN_CHANGELOG | Refresh dated implementation facts, record owner rationale and append authorization/affected-ticket receipt. Do not copy live status into the state index. |

After adoption: reclassify open issues against the merged amendment, mark only admitted independent code work ready, keep gates separate, and choose one bounded showcase checkpoint. Do not resume the old all-ticket supervision loop automatically.

## Predeclared checks on the reset

Proceed with the showcase when the amended scope is consistent and a named exact candidate can reach its selected path. Revise the queue if a task still requires uncertain architecture/provider decisions or several unrelated outcomes. Stop expansion if selected-path privacy, data loss or payment correctness fails. Do not delay all owner feedback for unrelated deferred defects; do not expose those defects as accepted live behavior.
