# Project State

## Project Reference

Antique Trail Regional Public MVP. Current focus: finish the UI acceptance wave (UI-05 through UI-10), then the unblocked package tickets, while keeping provider and named-human evidence gates fail closed.

## Current Position

- Phase: UI acceptance wave
- Plan: UI tickets #35-#40 are the current acceptance contract; package tickets #15, #16, #18, #20 are unblocked and follow UI evidence
- Task: Review UI-05 (#35, PR #44), then run UI-06 through UI-09 (#36-#39, now `ready-for-agent`), then UI-10 (#40)
- Status: Tracker hygiene complete; UI wave in progress
- Progress: Four UI tickets closed (#31-#34) and their four package blockers removed. UI-05 PR #44 is open for review. UI-06 through UI-09 are `ready-for-agent` with no blocked-by references. Packages 3, 4, SLM-01, and 6A lost stale blockers to the closed #12/#14. Three milestones (UI Acceptance, Packages, Gates) organize all 40 issues. Matt's two-axis corrective review closed with no actionable Standards or Spec findings; local checks and hosted web/database CI are green.

## Recent Decisions

- Provider and human gates remain open until real, signed evidence exists.
- Code-complete package tickets move from `ready-for-agent` to `ready-for-human` only after their full acceptance contract is proven, not merely because CI is green.
- Scheduled H-01 monitoring must be configuration-safe and make no provider call when unconfigured.
- Public slugs never authorize private operations; privileged actions use provider-authoritative recent password and enrolled-MFA proof.

## Blockers and Concerns

- Docker/Podman is unavailable locally; clean Supabase reset and pgTAP verification must use GitHub CI.
- Production Supabase/Cloudflare/provider resources and named approvals remain external human actions.
- Reviewer trusted-delivery/verifier evidence, production provider configuration, and named-human approvals remain intentionally fail closed.
- `npm audit --audit-level=high` passes; two moderate React Router advisories remain pending a separately reviewed breaking major upgrade.
- PRD verified consistent: the earlier "Deferred feature catalog" contradiction was a read-tool artifact (phantom headings), not real PRD content. Real deferred sections are Find capture, Household sharing, Collection tracking, and Onboarding/taste profile; nothing an open package delivers is deferred.

## Session Continuity

- Last session: 2026-08-08
- Stopped at: Tracker hygiene complete. UI-05 PR #44 is under review; UI-06 through UI-09 are `ready-for-agent` and unblocked; package tickets #15, #16, #18, #20 lost stale blockers. Three milestones created. PRD verified consistent (the earlier "Deferred feature catalog" contradiction was a read-tool artifact and is retracted).
- Resume file: none; live Git state, GitHub issue evidence, and the active goal are authoritative.
