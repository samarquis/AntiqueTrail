# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues. Use the `gh` CLI for operations and `PLAN_GOVERNANCE.md` as the controlling admission and closure contract.

## Required workflow

1. Read current `main`, `PLAN_GOVERNANCE.md`, `PLANNING_INDEX.md`, and the controlling sources relevant to the finding.
2. Search open and closed issues for duplicates before creating a ticket.
3. Decide whether the finding is implementation drift or a proposal to change intended behavior.
4. If it changes intended behavior, stop. The Product Owner must explicitly direct `update plan`, and the plan amendment must merge before the dependent implementation ticket can be ready.
5. Create one independently closable implementation ticket with `.github/ISSUE_TEMPLATE/plan-governed-ticket.yml` or an exactly equivalent body. Use a separate gate issue for external evidence.
6. Verify the created issue with `gh issue view <number> --json number,title,body,labels,state,url`.
7. Apply `ready-for-agent` or `task` only after the issue-governance workflow passes and a human or agent rechecks every admission field against current `main`.

## Required ticket trace

Every implementation ticket must preserve:

`problem and evidence -> controlling plan heading -> one outcome -> 1-5 acceptance criteria -> executable verification`

The ticket must address the cause, not only a visible symptom. Include roles, states, authorization, responsive/accessibility behavior, errors, or recovery only when required by its outcome. Historical evidence cannot replace a controlling plan reference.

## Conventions

- **Create an issue**: `gh issue create --template plan-governed-ticket.yml` when interactive form support is available; otherwise use `gh issue create --title "..." --body-file <validated-body>`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list` with appropriate state and label filters.
- **Comment on an issue**: `gh issue comment <number> --body-file <comment-file>`.
- **Apply/remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: use `Closes #N` in the accepted pull request. Reopen immediately if later evidence disproves acceptance.

Infer the repository from `git remote -v`; this checkout points to `samarquis/AntiqueTrail`.

## Pull requests as a triage surface

Pull requests are implementation and acceptance surfaces, not alternate requirement sources. Every pull request references its ticket, cites the controlling plan heading, and maps acceptance to evidence. If the diff reveals a missing decision or requirement conflict, stop and follow the plan-amendment process rather than broadening the ticket inside the pull request.
