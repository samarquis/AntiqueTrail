# Owner Onboarding Spec — Simple 70-Year-Old-Friendly Store Partner Journey

Status: **Draft for handoff** (approved baseline; implementable). Resolves wayfinder
map #61. Reconciled against PRD.md, DESIGN.md, DESIGN_SYSTEM.md, PACKAGE_CONTRACTS.md
Package 6, ADR 0002, ADR 0003, PRODUCT_DECISIONS.md (2026-07-31 older-adult cohort).

Controlling-doc precedence applies (README.md source-precedence table). Where this
spec states interaction/copy, it amends DESIGN.md/DESIGN_SYSTEM.md (see "Contract
reconciliation" below); product behavior remains PRD.md.

## 0. Purpose and baseline

The journey is the invited Store Partner onboarding flow, rebuilt so a 70-year-old
non-computer person can complete it **alone**: QR scan → consent → account/MFA →
store draft → approval wait → activation → first Portal login.

Baseline decisions (recorded 2026-08-17, map #61):

- Keep the approved five-task backbone with `Step n of 5` numbering (DESIGN.md
  one-task-per-screen; DESIGN_SYSTEM.md partner onboarding progress).
- Inside Task 3 (draft), one **field** per screen with field-level progress.
- Photo is **deferred to after approval** (Store Change Request, M-01 gated) —
  never a draft step.
- Full hours editor at onboarding, presented progressively (not free text).
- Explicit interruption/resume design on every task.
- Guide gently through owner-controlled verified email + MFA; never helper-owned
  accounts.
- Testable older-adult acceptance criteria from the approved eight-person cohort.

The Age-Inclusive Usability Baseline (PRD/DESIGN.md) applies everywhere below:
plain labels, one primary action per screen, no time pressure, 18px+ body, 48px+
targets, WCAG 2.2 AA, no color-only status, inputs preserved on error/Back.

## 1. Journey map

```
Canonical flow (PACKAGE_CONTRACTS.md Package 6):
/partner/join#token  →  /partner/join        (Task 1: Review invitation & consent)
                     →  /partner/verify      (Task 2: Create/verify account & MFA)
                     →  /partner/draft       (Task 3: Submit store draft — one field per screen)
                     →  /partner/status      (unnumbered wait: Submitted / Changes Requested / Rejected)
                     →  approval email → normal /auth/sign-in with verified email + MFA
                     →  /partner/activate    (Tasks 4–5: Review approved listing & scope; Finish setup/install)
                     →  /store-portal
```

Rules preserved verbatim from contract: one readable 320px task/screen; no
auto-advance or countdown; safe draft preservation; generic token/wrong-account
failure; `Step n of 5` only on participant-controlled numbered task screens;
Status never pretends progress the owner can advance; activation cannot load
before the exact grant exists; Back never reopens a consumed token or skips the
review wait.

## 2. Task 1 — Review invitation & consent (`/partner/join`)

### Welcome screen (new first screen of the journey)

H1: `Welcome to Antique Trail`
Body: `You've been invited to add your store to Antique Trail. We'll take this one
step at a time — you can stop and come back whenever you need to.`
One primary action: `Get started`. Secondary: plain "What is this?" expander with
two sentences (who we are, what the pilot is, that participation is voluntary and
unpaid). No timer, no urgency.

### Consent acknowledgements (substance immutable — PRD/ADR 0002)

Each of the five required acknowledgements keeps its **exact legal statement**
as the checkbox label, unchanged. Under each label add one plain-language
"in other words" line (no legal-substance change):

1. Authority — `In other words: you're the owner or manager, and you're allowed
   to speak for this store.`
2. Voluntary — `In other words: this is your choice. You can stop any time.`
3. Permitted data — `In other words: we'll show the store facts you confirm and
   nothing else without asking.`
4. No payment — `In other words: this costs you nothing.`
5. Withdrawal — `In other words: you can end participation at any time.`

### Typed identity

One field per screen (name, title, store, owner-controlled email). Plain labels:
`Your name`, `Your title or job`, `Store name`, `Your email`. Email hint:
`We'll send a verification link to this email. Use an email you can check —
this is how you'll sign in.` The email is normalized and owner-controlled;
never helper-created (decided; ADR 0002).

## 3. Task 2 — Create/verify account & MFA (`/partner/verify`)

Supabase Auth is a separate boundary; all enrollment stays in the existing auth
flow with generic enumeration-resistant errors (DESIGN_SYSTEM.md). This spec adds
**guided copy only**:

- Before signup: `This step creates your private sign-in. Only you should use
  this account.` (reinforces owner-controlled, gently, no helper accounts).
- MFA enrollment screen: `A second check keeps your store safe. We'll send a
  code to your email each time you sign in.`
- Recovery codes: `Write these codes down and keep them in a safe place. If you
  ever lose your phone or email access, these codes are how you get back in.`
  Require a plain confirm step ("I saved my codes") before continuing.
- Reassurance on every step: `Your progress is saved. You can stop and come
  back.` Interrupted signup stays resumable and unprivileged (ADR 0002).

## 4. Task 3 — Submit store draft (`/partner/draft`): one field per screen

The draft task is a **one-field-per-screen sub-flow**. Task-level progress stays
`Step 3 of 5`; field-level progress shows as `Question 2 of 9` (GOV.UK-style
plain indicator) — **never** a second `Step n of 5` and never a percentage bar
that implies time pressure. Every screen: Back link, page heading, one primary
Continue; typed input is auto-saved on advance and preserved on Back/failure
(DESIGN.md safe-field rule; existing partnerClient resume handles).

### Field order (plain-language, emotional-core-first)

The spec mandates this exact order (Ticket 63 resolution; PRD fields all present):

| # | Field | Screen H1 / question | Notes |
|---|-------|----------------------|-------|
| 0 | Welcome | `Welcome! Let's add your store.` | one-tap into field 1 |
| 1 | Store name | `What is the name of your store?` | text, autocomplete off |
| 2 | Description | `Tell shoppers what they'll find.` | 2–4 sentences, example hint, no word minimum |
| 3 | Address | `Where is your store?` | street/city/state/ZIP, one field per line, plain labels; drives timezone (DESIGN.md) |
| 4 | Phone | `What phone number should shoppers call?` | tel keyboard, accept dashes/parens (NN/g loose-input finding) |
| 5 | Website | `Do you have a website? (optional)` | explicit optional, url keyboard |
| 6 | Regular hours | `What hours is your store open?` | full hours editor, progressive (see §6) |
| 7 | Holiday hours | `Special holiday hours? (optional)` | same editor, `Same as regular hours` shortcut |
| 8 | Category tags | `What does your store sell?` | see §7 |
| 9 | Review & submit | `Check your store before sending` | exact final preview incl. 14-day hours preview; `Send for review` |

Photo does **not** appear here (deferred to post-approval, §8).

## 5. Interruption/resume rules (all five tasks)

The owner WILL be interrupted. Mandated design (Ticket 65 resolution; ADR 0002
resume semantics; DESIGN_SYSTEM route-contract safe-draft preservation):

1. **Every task intro and every typed screen** shows the persistent reassurance
   line: `You can stop and come back — your answers are saved.`
2. **Task 1**: typed identity fields + acknowledgement states auto-save to
   sessionStorage on each advance. The invitation token is consumed only by the
   final atomic provisional-consent transaction, so a pre-submit interruption
   leaves the token unconsumed. If the 30-minute token expires during a long
   pause, the generic terminal failure shows with the ADR 0002 recovery path
   (Administrator repeats verification, revokes stale child, issues a new
   invitation) — **the spec does not amend the expiry**; it designs around it.
   Post-submit interruption resumes the same unprivileged pending identity
   (unbound records expire after 30 days per ADR 0002).
3. **Task 2**: interrupted signup remains resumable and unprivileged; orphan
   Auth accounts remain ordinary shoppers. Reassurance copy only.
4. **Task 3**: each field auto-saves on advance; return resumes at the exact
   field with all prior answers intact; Back preserves safe fields; submission
   requires the final preview (no partial submission).
5. **Tasks 4–5**: checklist progress is server-persisted and audited
   (PRD.md activation); return resumes the checklist at the incomplete item.
6. No countdown, no auto-advance, no time-pressure copy anywhere.

## 6. Hours editor presented simply (Task 3, fields 6–7)

The full approved editor (DESIGN.md) surfaces **progressively**; no advanced
control is visible on step one.

- One day per screen, plain question: `What time does the store open on Monday?`
  → Open/Closed toggle first (the most common answer is "closed Sunday"), then
  time entry only if Open.
- After the first day is set: `Make the other days the same?` → one-tap
  `Copy to Other Days` (existing editor affordance, plain label), then each day
  is individually adjustable.
- Second range: an optional expander per day: `Add a second time range (optional)`
  — not visible until the day's first range is complete.
- Holiday hours (field 7): `Same as regular hours` one-tap, else the same
  one-day-per-screen editor.
- Timezone shown once, from address: `We'll use [City], [State] time.`
- The 14-day preview appears only on the final Review & submit screen
  (field 9): `Here's what shoppers will see.` Not per-day.

## 7. Category tags step (Task 3, field 8)

22 approved tags (PRD.md Store categories and attributes). A dense 22-item
multi-select wall is forbidden. Mandated presentation:

- H1: `What does your store sell?`
- Part A (always visible): **radio list** of all 22 tags, each with a
  plain-language 3–6 word description (e.g. `Furniture — tables, chairs,
  dressers`; `Jewelry — rings, watches, pins`). One tap to pick the single best
  fit: `Pick the one that best describes your store.`
- Part B (progressive, optional): `Add more (optional)` expander reveals the
  same list as checkboxes: `Tap any others that also fit.`
- Why-it-matters line: `These help shoppers find the kinds of things you sell.`
- Plain descriptions for all 22 tags are enumerated in the implementation
  contract (not this spec body; see ticket 67 resolution for the list source).

## 8. Photo ask — after approval (Tasks 4–5)

Photo is never a draft step. It lands in the post-approval activation checklist.

- **Before M-01 passes**: checklist item `Add a storefront photo` renders in a
  neutral placeholder state: `Photos are coming soon. We'll let you know when
  you can add yours.` Non-blocking — completing the checklist never requires it.
- **After M-01 passes**: the item becomes active with plain copy:
  `Would you like to add a photo of your storefront? It helps shoppers
  recognize your store.` One primary action opens a **Store Change Request**
  with a photo attachment (the only media-bearing change request; media
  commands exist only after M-01 per Package 6). Optional; never required.
- The item stays optional in the guided first-login checklist (confirm listing,
  review hours, one Representative-Managed Field edit, one Store Change
  Request, pilot support — PRD.md activation checklist; photo is an optional
  sixth item, not a replacement).

## 9. Tasks 4–5 — activation (`/partner/activate`)

Preserved per contract (DESIGN_SYSTEM.md; PRD.md Representative activation):
exact approved listing review, permissions review, Pilot Consent Receipt and
approval history, device-appropriate PWA install instructions, guided checklist.
Checklist progress server-persisted and audited. Photo item per §8. All copy in
plain language; one primary action per screen.

## 10. Acceptance criteria (older-adult cohort)

Cohort (PRODUCT_DECISIONS.md 2026-07-31): ≥8 participants 55+, ≥3 at 70+, ≥2
with low-vision/motor/assistive-tech adaptations; own device.

| # | Journey step | Pass threshold | Evidence |
|---|---|---|---|
| A1 | Invitation → Welcome → Task 1 consent, unaided | 90% complete | session recording, moderator log |
| A2 | Consent comprehension: after Task 1, state in own words that participation is voluntary and unpaid | 100% | post-screen comprehension check |
| A3 | Task 2: email verification + MFA + recovery-code confirmation, unaided | 90% | recording; participant can produce saved codes |
| A4 | Task 3: each of the 9 draft fields completable unaided | 90% per field | field-level completion log |
| A5 | Hours accuracy: entered hours match spoken hours within one 15-min block | 90% of entries | moderator comparison |
| A6 | Interruption/resume: scripted ≥30-min interruption mid-draft; resume at exact field, all prior answers intact, no data loss | 90% | recording, state diff |
| A7 | Status wait understood (no false progress, no action taken that shouldn't be) | 90% | recording, post-screen check |
| A8 | Tasks 4–5 activation checklist incl. optional photo item, unaided | 90% | checklist progress log |
| A9 | Zero safety/privacy/authorization failure (absolute) | 0 failures | incident log |
| A10 | Group average noncritical task errors | ≤1 per participant | error log |

Repeated critical failure on any row → fix and retest the same cohort (cohort
rule). Evidence artifacts are dated and reviewed by the Primary Internal
Tester (Product Owner) before release gates.

## 11. Contract reconciliation (Ticket 70 resolution)

The spec is a **new document** (`docs/specs/owner-onboarding.md`), not a PRD
amendment: no PRD product-behavior change exists (all fields, the checklist,
the editor, and tags are already approved in PRD.md). Interaction/copy changes
amend DESIGN.md and DESIGN_SYSTEM.md minimally (done as part of this ticket):

- DESIGN.md: Task 3 draft becomes one-field-per-screen with field-level
  progress; hours editor progressive-reveal; photo ask = optional activation
  checklist item, M-01 gated; category step = radio-first presentation.
- DESIGN_SYSTEM.md: partner onboarding progress section gains the
  field-level-progress rule (never a second `Step n of 5`) and the activation
  photo checklist item.
- No ADR change: ADR 0002 (QR/resume/expiry) and ADR 0003 (owner-controlled
  draft) stand as written.

## 12. Out of scope

Helper-owned accounts; photo before M-01; Administrator workspace redesign;
Store Portal redesign beyond first-login activation; public listing claims
(Package 10B); changing invitation expiry or the owner-controlled email+MFA
requirement.