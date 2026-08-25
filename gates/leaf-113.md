# Gates: leaf-113 (#113 Package 13 contract completion)

Scope: finish the already-drafted Package 13 section (PACKAGE_CONTRACTS.md lines ~261-273, commit 1184c57) so it meets #113 acceptance, then STOP for owner review. Do NOT touch any migration or code.

Acceptance gaps to close:
1. PLAN_ACCEPTANCE.md has NO Package 13 reference — add matching house-style cross-reference.
2. SECURITY_AND_TRUST.md authorization matrix (around line 655) lacks Package 13 roles/commands — add Store Representative tier-selection/billing actions, Administrator moderation queue authority, and flag-flip receipt-bound command per the contract's Commands paragraph.
3. Verify the contract section explicitly contains: authorization-matrix pointer, capability-flag semantics (default off everywhere; flip requires monetization Product Decision + package activation gates via receipt-bound command), staged-off proof requirements, dependency/entry conditions. Patch wording if any is missing.

- [x] G1: PLAN_ACCEPTANCE.md references Package 13 consistently with how other packages are referenced
  CHECK: Select-String -Path PLAN_ACCEPTANCE.md -Pattern "Package 13"
  EXPECT: /Package 13/
  EVIDENCE: added row | 13 | Photo-tier memberships, moderation, and staged-off billing | to traceability table

- [x] G2: SECURITY_AND_TRUST.md authorization matrix gains Package 13 entries (roles x commands incl. photo_tiers_enabled flip)
  CHECK: Select-String -Path SECURITY_AND_TRUST.md -Pattern "photo_tiers|Package 13|store_photo_tier"
  EXPECT: /Package 13|photo_tiers/
  EVIDENCE: added "Package 13 authorization matrix" line after "Threat model review"

- [x] G3: contract self-check: flag semantics + staged-off proof + entry conditions all present in PACKAGE_CONTRACTS.md Package 13 section
  CHECK: Select-String -Path PACKAGE_CONTRACTS.md -Pattern "photo_tiers_enabled=false" , "Flag-off inertness"
  EXPECT: both patterns found
  EVIDENCE: both patterns confirmed on lines 263 and 271

- [ ] G4: OWNER REVIEW requested (driver asks owner after merge); no W2 migration may land before approval
  EVIDENCE: pending
