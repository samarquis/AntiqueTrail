# Decision needed to resume publication

Date: 2026-09-06. The Product Owner approved this exact amendment proposal by replying `yes approved and authorized` after the proposed `update plan` directive was presented. Amendment review/merge and execution prerequisites remain required; no deployment or public-release pass is implied.

## Concrete prepared result

Deployment prerequisite source is pinned at `a9be6d4adb52b34d74ce83cc88e193ac7b603c0b`, PR224. A configured local Vercel Preview build completed, and its validated bundle has SHA-256 `4cb98d69b67072c286218645de8ac5ba30c7f3ca66672464fa290a1f3a996323`. Independent review and 29 focused artifact tests pass. This is a locally built preparation artifact, not an accepted CI release.

The existing Vercel account is authenticated. The selected project's authentication protection is `all_except_custom_domains`; automatic Git deployment is disabled in source. No new deployment has been uploaded, no domain promoted and no protection changed.

## Why sign-in is not the remaining decision

`docs/adr/0006-deploy-static-pwa-on-vercel-with-supabase.md` — `Architecture and provider boundary` says: “Only protected GitHub Actions may build and upload a release candidate.” Its `Consequences and acceptance` also retains named H-01 and dependent release evidence. The protected environment lacks the required deployment configuration and accepted receipts. Issue56's recorded archival is not a passing receipt and did not amend the controlling ADR.

`PLAN_GOVERNANCE.md` — `Locked by default` says requests to build or fix do not authorize a plan change and requires the exact Product Owner directive `update plan`. Therefore a direct local CLI upload as a substitute for the prescribed release workflow needs an explicit, narrow amendment; it cannot be presented as conforming release evidence.

## Recommended decision to review

Authorize a dedicated amendment for **protected internal synthetic review only**, allowing a reviewed local prebuilt artifact to be uploaded through the authenticated CLI with an honest internal-review receipt. Preserve source/artifact/config/schema identity, secret exclusion, every-host authentication protection, no production alias assignment, no real users or payments, no commercial activation and no claim that H-01 or public-launch gates passed. The amendment should identify which existing preactivation requirements continue to apply and which internal-only requirements replace them; it must not silently waive recovery or data-security obligations.

Use an isolated synthetic Supabase backend if available within confirmed free resource limits; do not overwrite or reset the existing six accounts or rewrite its conflicting historical migration records. If isolation requires spending or a capability not already available, report that separate resource decision before creation. The existing backend remains untouched pending a separately reviewed recoverability and forward-upgrade plan.

Approval would authorize writing and reviewing the coordinated protected-plan amendment first. It would not declare the current bundle accepted or immediately authorize upload before the amendment and its checks merge. Rebuild and bind configuration to the actual selected isolated backend before publication; the current bundle points to the older shared backend and cannot serve as full-stack review acceptance.

Exact directive presented and subsequently approved: **“update plan: authorize the protected internal synthetic review deployment described in DEPLOYMENT_DECISION.md, with no paid resources or public activation.”**

## Existing-contract alternative

Keep the ADR unchanged and complete the prescribed protected CI configuration, dedicated credentials, provider/cost/protection/recovery evidence and named signoffs. This also requires resolving hosted backend parity; CLI sign-in alone cannot supply those approvals. No duration is promised while those human and provider inputs remain unavailable.
