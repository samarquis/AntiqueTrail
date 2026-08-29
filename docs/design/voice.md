# Antique Trail voice reference

- **Status:** Proposed
- **Owner:** Product Owner
- **Last reviewed:** 2026-08-29
- **Approval mechanism:** A Product Owner or explicitly delegated design decision-maker records `approved` in the dated [brand-reference review note](../evidence/issue-146/brand-reference-review-2026-08-29.md) after completing the [review checklist](BRAND_REFERENCE_REVIEW_CHECKLIST.md).
- **Authority and precedence:** The root [source precedence](../../README.md#source-precedence) controls. [PRD.md](../../PRD.md) and [SECURITY_AND_TRUST.md](../../SECURITY_AND_TRUST.md) control truth, privacy, and safety; [DESIGN.md](../../DESIGN.md) controls interaction and copy intent. This file indexes those rules and cannot authorize new claims or rewrite exact contracted copy. A conflict stops dependent work until the controlling sources are reconciled.
- **Cross-references:** [Mood](mood.md), [token index](tokens.md), and [DESIGN_SYSTEM component states](../../DESIGN_SYSTEM.md#component-contract).

## Voice principles

Antique Trail is plainspoken, calm, precise, respectful of an older adult's time, and honest about uncertainty. Use concrete verbs, direct labels, short sentences, and the information needed for the next decision. Never substitute warmth for truth or confidence for evidence.

## Illustrative enforcement rules and examples

The examples below are illustrative enforcement examples derived from issue #146's required voice rules and the linked controlling sources. They help reviewers apply those rules; they are not contracted product copy. When an exact label, message, or journey intent exists in [DESIGN.md](../../DESIGN.md), that authority controls and this proposed index cannot silently replace it.

| Context              | Rule                                                                               | Acceptable example                                            | Unacceptable example                                               |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Navigation           | Name the destination directly and keep stable labels.                              | `Browse`, `My Trip`, `More`                                   | `Explore`, `Adventure`, `Discover magic`                           |
| Buttons              | Use a concrete verb and the object or outcome.                                     | `Add to Trip`, `Clear filters`, `Retry`                       | `Continue`, `Got it`, `Let's go!` when the outcome is unclear      |
| Loading              | Name the work in progress without promising success or time.                       | `Finding stores`                                              | `Your perfect stores are moments away`                             |
| Empty                | State what is absent, preserve context, and offer one recovery.                    | `No stores match those filters. Clear filters.`               | `Nothing here!`                                                    |
| Error                | State the unavailable capability, preserve safe work, and name recovery.           | `That service is unavailable. Your work is saved. Try again.` | `Oops! Something broke.`                                           |
| Status and freshness | Name evidence and time/state precisely.                                            | `Verified today`, `Pending review`, `Hours unavailable`       | `Verified store`, `All set`, `Open` without current hours evidence |
| Privacy and safety   | Name who can see what, the consequence, and recovery before action.                | `Only you can see this note.`                                 | `Your data is safe with us.`                                       |
| Store Portal         | Distinguish live, pending, and review-controlled changes.                          | `Submitted for review`                                        | `Updated` before publication                                       |
| Administrator        | Name the exact case, state, and permitted action without exposing hidden evidence. | `Return for changes`                                          | `Fix`, `Bad actor`, or speculative fraud labels                    |

## Vocabulary contract

| Term          | Use only when                                                                                                                 | Never use it to mean                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `verified`    | The named fact was checked through the approved source/authority process and is still within its freshness window.            | Endorsed, owner-approved, permanently correct, or identity-verified unless that exact subject was verified |
| `reported`    | A person submitted an unconfirmed correction, problem, or observation.                                                        | Proven, accepted, or published                                                                             |
| `pending`     | A named action was accepted but has not reached its terminal decision or publication state.                                   | Probably approved or safe to rely on                                                                       |
| `unavailable` | A capability, value, or item cannot currently be provided; pair it with the approved reason/recovery when disclosure is safe. | Denied existence, permanent absence, or user fault                                                         |
| `fictional`   | Content depicts no real store/person and exists for bounded demonstration or review.                                          | A loose synonym for inaccurate production data                                                             |
| `synthetic`   | Test data or media was deliberately generated for a controlled non-production fixture.                                        | A public marketing category or an unlabeled real listing                                                   |

Do not imply store endorsement, paid ranking, live map/routing capability, travel-time certainty, provider availability, publication, ownership, or private-data visibility unless the controlling source and current state prove that exact claim.

## Audience rules

### Public and anonymous

Lead with store facts, freshness, hours, and direct discovery actions. Signal sign-in before a private write. Do not imply personalization, location tracking, endorsement, or that a fictional listing is real.

### Authenticated shopper

Use `your` only for shopper-owned saves, notes, ratings, trips, and shares. Name when collaboration exposes exact trip fields; never imply household-wide access or that administrators can browse private content.

### Store Representative

Separate official live content, submitted changes, review-controlled fields, and unavailable capabilities. Authority is exact-store and exact-field; avoid `your store` when the grant or claim is not current.

### Administrator

Use neutral, reason-coded case language. Distinguish `pending`, `changes requested`, `approved`, `rejected`, `revoked`, and `unavailable`. Never reveal reporter identity, hidden abuse signals, private shopper content, or unsupported intent.

## Do and don't replacements

| Don't write                  | Prefer                                                        | Why                                                         |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `Best antique stores`        | `Antique stores in [area]`                                    | Avoids unproved ranking or endorsement.                     |
| `Optimized route`            | `Suggested order`                                             | Avoids a travel-time/optimization promise.                  |
| `Verified owner`             | `Store Representative` plus the exact current authority state | Keeps identity, relationship, and field authority distinct. |
| `Saved!`                     | `Store saved to your list.`                                   | Names the result and owner.                                 |
| `Something went wrong` alone | The approved unavailable message plus Retry/Back/support      | Gives honest recovery.                                      |
| `We can see your notes`      | `Only you can see this note.`                                 | Prevents false private-data visibility.                     |

## Review harness versus production

Review-harness banners, role selectors, synthetic identities, fixture-state labels, and fictional-store disclosures are local test controls. They must remain explicit in review evidence so nobody mistakes fixtures for production, but they are not reusable public brand copy. Production uses only product-authorized truthful disclosure for its real release stage and must never expose harness controls, test identities, or local-only state labels.

## Voice critique decision rule

A Voice review passes only when the reviewer checks navigation, action, loading, empty, error, status, privacy/safety, Store Portal, and Administrator examples against the controlling journey and trust sources; covers all four audiences; and cites the exact rule for each finding. Keyword presence alone is not a passing review.
