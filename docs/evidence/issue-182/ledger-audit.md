# Issue #182 ledger audit

**UTC audit time:** 2026-08-31T22:00:56Z
**Repository HEAD:** `e6827a4d6e40f619005aff2e4eecc653f2038f54`
**Scope:** Read-only audit of Issue #182, successor Issues #168–#181, and the requested operational-ledger paths. Shared ledgers and GitHub objects were not changed.

## Sources and limitations

- `OPEN_TICKET_TODO.md`, `PROJECT_STATE.md`, and `PLANNING_INDEX.md` exist and were audited.
- `rg --files -g 'OPENCODE_TICKET_REVIEW_TODO.md'` returned no path. It therefore has no current repository content to audit; its intended status (retired versus missing) is unknown.
- Live GitHub was queried on 2026-08-31. It is the authoritative issue-state source; repository ledgers are dated snapshots unless reconciled.
- This leaf did not read historical issue comments, change issue bodies/states/comments, or run the plan-ticket validator. Those are outside this narrow ledger/body drift audit.

## Exact commands and results

```powershell
rg --files -g 'OPENCODE_TICKET_REVIEW_TODO.md' -g 'OPEN_TICKET_TODO.md' -g 'PROJECT_STATE.md' -g 'PLANNING_INDEX.md'
```

Result: `OPEN_TICKET_TODO.md`, `PROJECT_STATE.md`, and `PLANNING_INDEX.md` were found; `OPENCODE_TICKET_REVIEW_TODO.md` was not found.

```powershell
$nums = 168..182; foreach ($n in $nums) {
  gh issue view $n --repo samarquis/AntiqueTrail --json number,state,title,body,closedAt,url
}
```

Result: Issues #168–#182 are all `OPEN`, including #174. The live states relevant to the ordered ledger are: #123 `OPEN`, #124 `OPEN`, #125 `CLOSED` at `2026-08-30T21:04:45Z`, and #174 `OPEN`.

```powershell
gh pr view 185 --repo samarquis/AntiqueTrail --json number,state,mergedAt,mergeCommit,url,title
gh pr view 186 --repo samarquis/AntiqueTrail --json number,state,mergedAt,mergeCommit,url,title
```

Result: PR #185 merged at `2026-08-30T21:04:44Z` (`97ab90a488903e5354506dcf1d69404695390a2b`); PR #186 merged at `2026-08-31T01:36:56Z` (`186e7b7b51135864b60909a939f61bfac46ad969`). A merged PR #186 does not make Issue #174 closed.

```powershell
foreach ($n in 168..182) {
  $i = gh issue view $n --repo samarquis/AntiqueTrail --json number,state,body | ConvertFrom-Json
  $lines = $i.body -split "`n"
  $start = [Array]::FindIndex([string[]]$lines, [Predicate[string]]{ param($line) $line -eq '## Dependencies and non-goals' })
  $block = if ($start -ge 0) { ($lines[$start..([Math]::Min($lines.Length-1,$start+4))] -join ' ') } else { '' }
  $self = $block -match ('#' + $n + '(?!\d)')
  "#$($i.number) $($i.state) | self=$self | $block"
}
```

Result: every body reports `self=False`. Dependency direction is coherent: #169 → #168; #171 → #170; #172 → #169/#170/#171; #173 → #172; #175 → #174; #176 → #175; #177 → #174/#175; #178 → #177/#174; #179 → #177/#178; #180 → #176/#177/#178/#179/#123/#124; #181 → #180. #170 correctly distinguishes repository build dependency (#168) from its later public-activation gate (#169). #174 follows closed #125 and is then a prerequisite for #123/#124. #182 only requires that #168–#181 exist. No reversal or self-dependency was found.

```powershell
$retired = 'featured','unlimited'
foreach ($n in 168..182) {
  $body = (gh issue view $n --repo samarquis/AntiqueTrail --json body | ConvertFrom-Json).body
  foreach ($term in $retired) {
    $count = [regex]::Matches($body,'(?i)\b'+$term+'\b').Count
    if($count -gt 0){ "#$n $term=$count" }
  }
}
rg -n -i "\b(featured|unlimited)\b" OPEN_TICKET_TODO.md PROJECT_STATE.md PLANNING_INDEX.md
```

Result: only #174 (`featured=4`, `unlimited=4`) and #175 (`unlimited=1`) match. #174 explicitly labels both as retired migration inputs and requires their removal; #175 prohibits calling Full Gallery "unlimited." The ledger search returned no matches. Historical `Pilot`/`Partner` references identify old flows/roles, not a current tier value. No retired-tier correction is required.

```powershell
rg -n -i "(COMPLETE IN PR|is closed|BLOCKED .*must close)" OPEN_TICKET_TODO.md PROJECT_STATE.md
```

Result: `OPEN_TICKET_TODO.md:24` says #174 is `[x] COMPLETE IN PR #186`; `PROJECT_STATE.md:58` says #174 "is closed"; `OPEN_TICKET_TODO.md:25` says #123 remains blocked until #174 closes. The first two claims conflict with live GitHub `OPEN`; the #123 blocker is currently accurate. No successor body itself claims that it is complete.

## Required corrections for parent integration

1. **`OPEN_TICKET_TODO.md:24` — required.** Do not retain `[x] COMPLETE IN PR #186` while #174 is live `OPEN`. Change the row to an unchecked, non-completion status that records the merged PR and pending issue closure, preserving `Dependencies: #125`. Do not use `[!]` unless the documented external-blocker protocol is actually satisfied. After the issue is validly closed, restore the completed-row format with the existing PR #186 evidence.
2. **`PROJECT_STATE.md:56-58` — required.** Refresh the dated open-backlog list from live GitHub: remove #125 from the "Current product and evidence gaps" open list because it is closed, and replace the false #174 "is closed" claim with its live `OPEN` state plus the factual PR #186 merged/pending-closure distinction.
3. **`PLANNING_INDEX.md:60-67` — required.** Add `OPEN_TICKET_TODO.md` as the current ordered execution/state ledger, with a maintenance rule to reconcile each row against live GitHub issue state. Its omission leaves the current shared operational ledger unregistered while the older `PLAN_TICKET_SEQUENCE.md` is explicitly historical.
4. **`OPENCODE_TICKET_REVIEW_TODO.md` — resolved on this head.** At base `e6827a4` the file was absent from the checkout, so the audit recorded its status as unknown. The #182 correction head contains the review handoff queue (restored as the active operational review ledger) and `PLANNING_INDEX.md` registers it as a current operational source.

## Findings by prohibited drift type

| Check                        | Result                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Self-dependency              | None in #168–#182 bodies.                                                                                                       |
| Closed active blocker        | None. #125 is a satisfied predecessor; #174, the active #123 blocker, is live `OPEN`.                                           |
| Retired tier vocabulary      | None requiring correction; `featured`/`unlimited` occur only as explicit retired/migration/prohibition text in #174/#175.       |
| Dependency direction         | No reversal found; the body chain and ordered ledger agree on the reviewed successor relationships.                             |
| Unsupported completion claim | Found: `OPEN_TICKET_TODO.md:24` and `PROJECT_STATE.md:58` describe #174 as complete/closed although live GitHub reports `OPEN`. |

## Gate evidence

- G1: Pass — commands and results above cover dependency direction, retired tiers, closed blockers, self-dependencies, and completion claims.
- G2: Pass — the three required shared-ledger corrections and the OPENCODE-ledger limitation are stated with locations and exact rationale.
