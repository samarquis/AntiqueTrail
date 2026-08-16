# HC-01 human capacity and tester setup

Status: **DRAFT / NO-GO**
Issue: [#8](https://github.com/samarquis/AntiqueTrail/issues/8)

This is a planning receipt, not approval for owner contact, external testing,
Private Beta, or production. AI agents may execute repeatable checks and
collect evidence, but they are not human coverage and cannot approve this gate.

## Named synthetic test roles

| Role | Named person | Scope and test setup | Approval authority |
| --- | --- | --- | --- |
| Product Owner | Scott | Product decisions, release disposition, and gate review | Product/release gates only |
| Primary Internal Tester / Test User A | Scott | Own phone; separate shopper, Representative, and Administrator test accounts; supervised synthetic runs | Primary Internal Tester evidence approval |
| Independent Internal Tester / Test User B | Scott's wife | Her own phone and a newly created separate shopper account; independent shopper acceptance | Independent shopper acceptance only |
| Representative Test Account | Scott | Synthetic Blue Finch scope only; never used for shopper-private records | None |
| Administrator Test Account | Scott | MFA-protected synthetic admin workflow; no shopper-private access | None |
| Agent-Assisted Test Account | Supervised AI only | Optional repeatable synthetic checks under Scott's supervision | None |

## Capacity still required before HC-01 can pass

These entries must contain a real human or qualified professional and a dated
acceptance before first owner contact or any external participant is contacted.

| Required role | Current owner | Required evidence |
| --- | --- | --- |
| Engineering/Security owner | Codex, supervised by Scott | Codex prepares engineering, security, privacy, authorization, incident, and recovery evidence; Scott reviews and accepts the work |
| Operations owner | Scott | Monitoring, support intake, backup/restore, rollback, and status responsibility accepted by Scott |
| Support/on-call primary | Codex + Scott | Codex handles technical triage and runbooks; Scott owns operational decisions and escalation |
| Support/on-call backup | Codex + Scott | Shared coverage; escalation remains with Scott |
| Second catalog verifier | Codex + Scott | Codex performs a separate fact/provenance pass; Scott reconciles and accepts discrepancies |
| Legal/insurance reviewer | Scott + qualified professional when required | Codex can prepare a checklist and identify gaps; only Scott and a qualified legal/insurance professional can confirm this requirement |
| Independent security/release reviewer | Codex prepares; Scott accepts | Codex can run the security review and retests, but cannot be the independent human approver; a conflict-free human approval remains required for a signed release gate |

## Required ownership checks

- Owner contact, consent, privacy, support, recovery, and incident response each
  have a named human owner before outreach.
- Scott may operate the synthetic roles above. Codex may execute checks, prepare
  evidence, and conduct engineering/security analysis, but an AI result is not
  independent human acceptance and cannot substitute for legal/insurance
  confirmation or a conflict-free human release approval.
- The independent tester uses her own account and phone; the solo-stage Test
  User A account is never reassigned to her.
- This receipt remains **NO-GO** while any required role is unassigned or any
  legal/insurance confirmation is missing.

## Role skill backlog

The shared operating model can be built locally before any provider or owner
contact. The minimum reusable playbooks are:

1. **Security review:** threat-model scope, authorization matrix, secret/data
   handling, dependency review, abuse cases, incident response, and retest log.
2. **Operations:** local start/stop, health checks, backup/restore rehearsal,
   rollback, quota/cost stop, and status update procedure.
3. **Support:** intake template, severity classification, privacy-safe ticket
   handling, escalation, response target, and closure evidence.
4. **Catalog verification:** two-pass fact/provenance comparison with a
   discrepancy log and final reconciliation.
5. **Release review:** acceptance checklist, accessibility/browser evidence,
   known-risk disposition, rollback decision, and Product Owner sign-off.

Codex can draft and execute these playbooks; Scott remains the accountable
human for operational decisions and approvals.

## Acceptance record

Complete only after the missing roles are named and have accepted their scope.

| Decision | Name | Date | Evidence/link |
| --- | --- | --- | --- |
| Product Owner accepts HC-01 | Scott | Pending | Pending |
| Primary Internal Tester accepts | Scott | Pending | Pending |
| Independent Internal Tester accepts | Scott's wife | Pending | Pending |
| Engineering/Security evidence prepared | Codex; Scott reviews | Pending | Pending |
| Operations/support accepts | Scott; Codex supports | Pending | Pending |
| Legal/insurance confirms | Scott + qualified professional if required | Pending | Pending |
| Independent reviewer accepts | Conflict-free human required; Codex prepares evidence | Pending | Pending |
