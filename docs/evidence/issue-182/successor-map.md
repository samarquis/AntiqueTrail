# Issue #182 — historical-to-successor map

**Readback verified:** 2026-08-31 21:57:35 UTC

**Source of the mapping:** [Issue #182](https://github.com/samarquis/AntiqueTrail/issues/182), `Current evidence` / `Use this exact historical-to-successor map`.
**Amendment boundary:** the source ticket identifies the authorized 2026-08-30 amendment at `585497125d722d2568ac63a3113cda3091b8db50`. This record maps scope; it does not reopen, rewrite, or invalidate historical evidence.

## Method and results

```text
gh issue view 182 --json number,title,state,url,body,updatedAt,closedAt
# Result: #182 OPEN; body supplied the exact mapping below.

foreach ($id in 20,27,28,87,88,89,90,113,118,119,120,138,123,124,168..181) {
  gh api "repos/samarquis/AntiqueTrail/issues/$id"
}
# Result: all 12 historical sources resolve and are CLOSED; all 16 assigned
# successors resolve and are OPEN. URLs and states are recorded below.
```

## Before/after map

“Historical proof” is a short description of the closed issue’s recorded former scope, not a statement that its acceptance criteria passed. “Amended successor work” is only the ownership stated by #182; no successor is claimed complete.

| Historical source (verified state) | Historical proof / former scope | Exact successor assignment from #182 | Amended successor work not proved by the historical source |
| --- | --- | --- | --- |
| [#20](https://github.com/samarquis/AntiqueTrail/issues/20) — CLOSED | Package 6A invitation, provisional consent/identity binding, and risk-tiered claims. | [#168](https://github.com/samarquis/AntiqueTrail/issues/168), [#170](https://github.com/samarquis/AntiqueTrail/issues/170), [#171](https://github.com/samarquis/AntiqueTrail/issues/171) | Isolated owner-acquisition research; public existing-store claim; public add-store intake and atomic Free activation. |
| [#27](https://github.com/samarquis/AntiqueTrail/issues/27) — CLOSED | Private/noindex CAT-01 regional-readiness evidence. | [#168](https://github.com/samarquis/AntiqueTrail/issues/168), [#169](https://github.com/samarquis/AntiqueTrail/issues/169), [#172](https://github.com/samarquis/AntiqueTrail/issues/172), [#173](https://github.com/samarquis/AntiqueTrail/issues/173) | Private owner research/usability, then the production-intended public owner page and promotion evidence. |
| [#28](https://github.com/samarquis/AntiqueTrail/issues/28) — CLOSED | Package 10B public regional release and consent-based promotion. | [#170](https://github.com/samarquis/AntiqueTrail/issues/170), [#171](https://github.com/samarquis/AntiqueTrail/issues/171), [#172](https://github.com/samarquis/AntiqueTrail/issues/172), [#173](https://github.com/samarquis/AntiqueTrail/issues/173) | Atomic public Free intake, owner page, and owner-card release. |
| [#87](https://github.com/samarquis/AntiqueTrail/issues/87) — CLOSED | Earlier photo-tiers/payment product-spec questions and retired tier assumptions. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Tier migration, inactive configuration, paid-value evidence, Checkout, lifecycle, sales controls, composite activation, and live activation evidence. |
| [#88](https://github.com/samarquis/AntiqueTrail/issues/88) — CLOSED | Earlier store onboarding/tier-selection questions. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Tier migration, inactive configuration, paid-value evidence, Checkout, lifecycle, sales controls, composite activation, and live activation evidence. |
| [#89](https://github.com/samarquis/AntiqueTrail/issues/89) — CLOSED | Earlier pilot-store grandfathering/paid-transition questions. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Tier migration, inactive configuration, paid-value evidence, Checkout, lifecycle, sales controls, composite activation, and live activation evidence. |
| [#90](https://github.com/samarquis/AntiqueTrail/issues/90) — CLOSED | Earlier mid-cycle upgrade/downgrade and proration questions. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Tier migration, inactive configuration, paid-value evidence, Checkout, lifecycle, sales controls, composite activation, and live activation evidence. |
| [#113](https://github.com/samarquis/AntiqueTrail/issues/113) — CLOSED | Earlier Package 13 staged-off photo-tier contract. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Tier migration, inactive configuration, paid-value evidence, Checkout, lifecycle, sales controls, composite activation, and live activation evidence. |
| [#118](https://github.com/samarquis/AntiqueTrail/issues/118) — CLOSED | Earlier tier-state/cap-resolution migration using legacy names and assumptions. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174), [#123](https://github.com/samarquis/AntiqueTrail/issues/123), [#124](https://github.com/samarquis/AntiqueTrail/issues/124) | Current tier names and cap enforcement, rejected-media resubmission, and database proof. |
| [#119](https://github.com/samarquis/AntiqueTrail/issues/119) — CLOSED | Earlier intake approved-count/tier validation and over-cap copy. | [#174](https://github.com/samarquis/AntiqueTrail/issues/174), [#123](https://github.com/samarquis/AntiqueTrail/issues/123), [#124](https://github.com/samarquis/AntiqueTrail/issues/124) | Current tier names and cap enforcement, rejected-media resubmission, and database proof. |
| [#120](https://github.com/samarquis/AntiqueTrail/issues/120) — CLOSED | Earlier Stripe integration behind a Boolean staged-off capability. | [#177](https://github.com/samarquis/AntiqueTrail/issues/177)–[#181](https://github.com/samarquis/AntiqueTrail/issues/181) | Paid consent/Checkout, lifecycle, sales-state controls, activation, and live-evidence contract. |
| [#138](https://github.com/samarquis/AntiqueTrail/issues/138) — CLOSED | Assigned Pilot Store Draft approval path from queue to atomic decision. | [#171](https://github.com/samarquis/AntiqueTrail/issues/171) | Distinct public add-store intake, provenance, and atomic Free approval path. |

For every `#174–#181` and `#177–#181` range in the table, the inclusive issues are exactly the linked numbered sequence; no numbers are skipped or added.

## Successor link/state readback

All links below resolved through the GitHub Issues API in the same UTC readback and were **OPEN** at that time.

| Successor | Verified URL and state | Assigned ownership label |
| --- | --- | --- |
| #123 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/123) | Complete Store Portal rejected-media resubmission journey. |
| #124 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/124) | Repair Package 13 media-history database proof coverage. |
| #168 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/168) | Isolated owner-acquisition research artifact. |
| #169 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/169) | Eight-owner acquisition usability gate. |
| #170 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/170) | Public existing-store claim through atomic Free activation. |
| #171 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/171) | Add-store intake, duplicate conversion, and atomic Free publication. |
| #172 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/172) | Public `/for-stores` Free acquisition page. |
| #173 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/173) | Owner card, QR controls, and consented launch channels. |
| #174 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/174) | Free, Gallery, and Full Gallery tier enforcement. |
| #175 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/175) | Inactive commercial configuration and value-research controls. |
| #176 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/176) | Paid-value research and monetization decision. |
| #177 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/177) | Paid consent through verified Checkout tier upgrade. |
| #178 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/178) | Paid membership servicing lifecycle. |
| #179 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/179) | Race-safe paid-sales controls. |
| #180 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/180) | Composite activation and stage-controlled paid surfaces. |
| #181 | [OPEN](https://github.com/samarquis/AntiqueTrail/issues/181) | Paid-tier activation execution and independent verification. |

## Coverage and ownership check

- **No orphan in the supplied map:** its unique successor set is exactly `#123`, `#124`, and `#168–#181`; every member resolves and is linked above.
- **No duplicate owner inferred:** each successor has one distinct ownership label in the live issue title/scope. Repeated appearances are deliberate historical-to-successor references prescribed by #182 (not competing implementations): #20/#27/#28 share acquisition successors; #87–#90/#113 share the complete paid-tier sequence; #118/#119 share #174/#123/#124.
- **Historical proof remains historical:** the CLOSED source links establish only the former ticket scopes summarized above. The OPEN successor links identify amended work; they do not prove implementation, acceptance, activation, provider readiness, or closure.

## Limitations

- This is a read-only issue-map and link/state snapshot. GitHub state may change after the timestamp.
- Link resolution and an OPEN state do not establish successor completion, dependency readiness, code correctness, human sign-off, or provider evidence.
- The map records only the exact assignments supplied by #182; it does not assess broader repository-ledger or plan-governance conformance.
