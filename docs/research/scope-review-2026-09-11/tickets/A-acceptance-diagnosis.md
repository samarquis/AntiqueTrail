## Problem

#321's last completed real-local diagnostic at f47420dc070f4ecc291d535f9adc506cc3c92d01 failed correct-recipient invitation acceptance on desktop and phone after session restoration. The UI returned a generic failure; the underlying RPC cause is not established. Its existing owner preserved artifacts in C:/Users/samar/.codex/worktrees/d7de/AntiqueTrail. Repeated whole-suite retries cannot identify whether the cause is fixture state, transport or application behavior.

## Plan

[PRD.md — Purpose, people, and product promise](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#purpose-people-and-product-promise), [The connected shopper experience](https://github.com/samarquis/AntiqueTrail/blob/main/PRD.md#the-connected-shopper-experience), and `One-trip roles and invitation`; DESIGN.md — `Shared-trip handoff`; PLAN_GOVERNANCE.md — `Ticket admission contract`. Current-main review baseline f182871d9de0d5db2a30ad0de9ac8dc72467648b. This is a bounded diagnostic child of #321, not an application fix. Preserve PR #334 and existing ownership. Execution is paused for scope review; no ready label or automatic restart.

## Outcome

Land a sanitized, reproducible explanation of the failed acceptance boundary with a precise repair disposition. Own only a focused diagnostic/reproduction and its report. Do not implement partner removal, repair unrelated auth, or refactor the shared runner.

## Acceptance

- [ ] On a frozen candidate, capture the actual local acceptance command/error and independent verified-recipient, invitation and membership state before/after; do not publish tokens or recipient addresses.
- [ ] Reproduce the failing boundary and one distinguishing control so the report identifies fixture, transport or product cause with evidence; a timeout or generic alert alone is insufficient.
- [ ] Commit the focused reproduction and diagnosis/disposition, linking any separately admitted repair. Product correctness and #321's joined acceptance are not claimed by this diagnosis.

## Verification

Reuse the existing disposable local Auth/RPC lifecycle and existing #321 artifacts. Run only the acceptance path plus the distinguishing control, record source/schema identity and scoped cleanup, and run focused checks for changed files. If local startup is unavailable, report that phase and leave this issue open. Closure requires the diagnostic/report merged to main with applicable checks and independent review of privileged diagnostic code. This issue does not require a product repair to be implemented before its evidence outcome can close.
