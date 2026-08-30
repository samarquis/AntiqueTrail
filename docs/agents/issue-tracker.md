# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues. Use the `gh` CLI for operations and `PLAN_GOVERNANCE.md` as the controlling admission and closure contract.

## Required workflow

1. Read current `main`, `PLAN_GOVERNANCE.md`, `PLANNING_INDEX.md`, and the controlling sources relevant to the finding.
2. Search open and closed issues for duplicates before creating a ticket.
3. Decide whether the finding is implementation drift or a proposal to change intended behavior.
4. If it changes intended behavior, stop. The Product Owner must explicitly direct `update plan`, and the plan amendment must merge before the dependent implementation ticket can be ready.
5. Create the ticket with `.github/ISSUE_TEMPLATE/plan-governed-ticket.yml` or an exactly equivalent body.
6. Verify the created issue with `gh issue view <number> --json number,title,body,labels,state,url`.
7. Apply `ready-for-agent` or `task` only after the issue-governance workflow passes and a human or agent rechecks every admission field against current `main`.

## Required ticket trace

Every ticket must preserve:

`reason -> current evidence -> controlling plan file and heading -> conforming outcome -> mapped acceptance criteria -> executable verification -> closure evidence`

The ticket must address the reason, not only a visible symptom. Its acceptance criteria must prove the cited plan requirements, including relevant roles, states, authorization, responsive/accessibility behavior, errors, and recovery. Historical review files, screenshots, or critique reports may support the evidence but cannot replace a controlling plan reference.

## Conventions

- **Create an issue**: `gh issue create --template plan-governed-ticket.yml` when interactive form support is available; otherwise use `gh issue create --title "..." --body-file <validated-body>`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list` with appropriate state and label filters.
- **Comment on an issue**: `gh issue comment <number> --body-file <comment-file>`.
- **Apply/remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: only after mapped acceptance and hosted evidence pass; use `gh issue close <number> --comment "..."` with the accepted commit or PR and criterion-level evidence.

Infer the repository from `git remote -v`; this checkout points to `samarquis/AntiqueTrail`.

## Pull requests as a triage surface

Pull requests are implementation and acceptance surfaces, not alternate requirement sources. Every pull request must reference its ticket, cite the same controlling plan requirements, state whether it conforms or changes the plan, and report verification. If the diff reveals a missing decision or requirement conflict, stop and follow the plan-amendment process rather than broadening the ticket inside the pull request.
