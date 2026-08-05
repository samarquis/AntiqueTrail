# Project State

## Project Reference

Antique Trail Regional Public MVP. Current focus: implement every remaining agent-actionable GitHub issue while keeping provider and named-human evidence gates fail closed.

## Current Position

- Phase: Human and provider gate handoff
- Plan: Preserve fail-closed external gates after agent implementation
- Task: Named-human acceptance and provider evidence collection
- Status: Agent implementation complete
- Progress: Zero `ready-for-agent` tickets remain. Matt's two-axis corrective review closed with no actionable Standards or Spec findings; local checks and hosted web/database CI are green. Remaining open tickets are `ready-for-human`, explicit gates, or the program tracker.

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

## Session Continuity

- Last session: 2026-08-05
- Stopped at: Agent-actionable implementation and Matt corrective review are complete. GitHub issue evidence is current; continue with human/provider gates without converting missing evidence into synthetic acceptance.
- Resume file: none; live Git state and active goal are authoritative.
