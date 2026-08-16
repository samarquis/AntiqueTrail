# UI-10 full-spec Product Owner acceptance

Status: **Awaiting explicit Product Owner approval.** Automation and screenshots are evidence, not approval or authority to close #40.

## Start the local review build

```powershell
npm run dev:review -- --host 127.0.0.1 --port 4174
```

## Ordered review checklist

1. [Public Browse](http://127.0.0.1:4174/stores) — confirm Browse / My Trip / More, honest store information, and Store Details.
2. [Shopper A](http://127.0.0.1:4174/saved?reviewAs=shopper-a&reviewState=success) — confirm only Blue Finch private data appears; follow Saved, memory, correction, candidates, and trip flows from UI-05–07 evidence.
3. [Representative](http://127.0.0.1:4174/store-portal?reviewAs=representative&reviewState=success) — confirm Blue Finch-only portal scope, submitted controlled changes, E-01 and M-01 honest gates, updates, links, and support.
4. [Administrator](http://127.0.0.1:4174/admin?reviewAs=administrator&reviewState=success) — confirm queue, access preview/confirmation, partner, moderation, and operational status outcomes.
5. Repeat a relevant route with each `reviewState=loading`, `empty`, `error`, `blocked`, `permission-denied`, and `success`; never accept fabricated data or a silent failure.
6. Use keyboard only: activate Skip to main content, inspect visible focus, and navigate a public, shopper, representative, and admin control. Repeat at phone, tablet, desktop, and browser 200% zoom.
7. Compare the screens with `DESIGN.md`, `DESIGN_SYSTEM.md`, and the detailed UI-01–09 evidence. Record **Approve** or concrete revision requests on issue #40.

## Integrated automation

`playwright.review.config.ts` now executes UI-01 Browse (`catalog.spec.ts`), UI-02 Details (`store-details.spec.ts`), UI-04 review harness, UI-05–09 slice contracts, and this UI-10 integration contract across desktop, tablet, and mobile. UI-10 checks content/outcomes and role boundaries, loading/empty/error/blocked state honesty, H1/focus, forced-colors/reduced-motion compatibility, and true CSS `zoom=2` reflow.

```powershell
npm run test:e2e:review
$env:CAPTURE_UI10_EVIDENCE='true'; npx playwright test e2e/ui10-full-spec.spec.ts --config playwright.review.config.ts --grep "captures integrated"; Remove-Item Env:CAPTURE_UI10_EVIDENCE
```

The capture stores four comparable public/shopper/representative/admin screens per desktop, tablet, and mobile viewport in this directory. Existing UI-01–09 evidence remains the detailed workflow proof; UI-10 deliberately does not duplicate it.
