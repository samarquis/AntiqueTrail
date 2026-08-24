# Gates: Start instruction run â€” #100, #97, then W1

Scope: coding authorized by Product Owner 2026-08-23. Order: security hygiene #100, local-stack #97, then W1 spec-drift slices (#105-#112), then #113 contract DRAFTED for owner review (never closing #113 this run; no Package 13 migrations land before owner approval). Every closure requires scoped typecheck+lint+tests green, commit pushed, issue CLOSED/COMPLETED verified.

## G1 â€” #100 secret hygiene resolved and closed
- [x] Hosted-project secrets removed from tracked/env files per ticket scope; fix committed; issue CLOSED/COMPLETED
  CHECK: gh issue view 100 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - history pickaxe clean (validators only), .env.local sanitized to localhost, .env.example verified fail-closed, closed with evidence comment
## G2 â€” #97 local stack resolution landed and closed
- [x] Ticket's root cause addressed; boot + full reset verified on this machine with Docker; committed; CLOSED/COMPLETED
  CHECK: gh issue view 97 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - pins bumped to 2.115.0 (README/CI/plan); bind_navigator_device ownership repair; supabase start green, db reset green through 89 migrations + seed; pgTAP baseline filed as #121; commit 1187967
## G3 â€” W1 slice: #111 Review Hours harness divergence reconciled
- [x] Harness mirrors production RPC semantics; codifying e2e updated; scoped tests green; closed
  CHECK: gh issue view 111 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - ui07 spec 54 passed / 0 failed / 3 skipped across viewports; REVIEW_VERDICTS.md note marked RESOLVED with dated evidence; commit 1d480ce
## G4 â€” W1 slice: #105 /stores/:slug/updates route registered
- [x] Route live with e2e both paths green; closed
  CHECK: gh issue view 105 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - route at App.tsx:898 pre-existing post-review; e2e store-details.spec.ts:232-267 covers populated + empty states; closed with citations
## G5 â€” W1 slice: #106 card Add-to-Trip action
- [x] Card action shipped anonymous-resume + authenticated paths tested; closed
  CHECK: gh issue view 106 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - card deep link components.tsx:361-366; new catalog.spec.ts card href/text test + details-link e2e; JIT resume covered by ui05 suite; commit 18a8a66
## G6 â€” W1 slice: #107 aria-hidden decorative glyphs
- [x] Glyphs hidden from AT, accessible-name assertions added; closed
  CHECK: gh issue view 107 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - four glyph sites verified aria-hidden; new catalog.spec.ts exact-accessible-name regression test green; commit 18a8a66
## G7 â€” W1 slice: #108 typography token compliance
- [x] Forbidden weights and off-token headings corrected or documented exceptions; closed
  CHECK: gh issue view 108 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - h1 42px/h2 29px match DESIGN_SYSTEM tokens exactly; zero non-token font-weight declarations repo-wide; closed with measurements
## G8 â€” W1 slice: #109 More menu auth-required signals
- [x] Gated items show non-color-only signal; tested; closed
  CHECK: gh issue view 109 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - MoreMenuLock lock icon + sr-only text at App.tsx:331-348 gated per-destination :391; App.test.tsx menu coverage; closed with citations
## G9 â€” W1 slice: #110 dark-mode tokens + persistence
- [x] Dark palette covers all tokens; toggle persists; no first-paint flash; closed
  CHECK: gh issue view 110 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - styles.css dark token block + index.html pre-paint boot script verified; new theme.spec system/toggle/persistence tests green all viewports; commit 18a8a66
## G10 â€” W1 slice: #112 dark coverage sweep
- [x] All routes audited dark; contrast fixes landed; e2e theme coverage; closed
  CHECK: gh issue view 112 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 - themed-surface tests on Browse/Details/Gallery/More + @axe-core/playwright dark scans ZERO critical/serious violations incl color-contrast; 14/14 theme tests green; commit 18a8a66
## G11 â€” #113 contract drafted and handed to owner (NOT closed)
- [x] Package 13 section written into PACKAGE_CONTRACTS.md, pushed, review-request comment posted on #113; issue intentionally left OPEN awaiting owner approval
  CHECK: node -e "const{execSync}=require('child_process');const j=JSON.parse(execSync('gh api repos/samarquis/AntiqueTrail/issues/113/comments',{encoding:'utf8'}));const s=JSON.parse(execSync('gh issue view 113 --json state',{encoding:'utf8'}));console.log(j.some(c=>c.body.includes('contract draft is ready for your review'))&&s.state==='OPEN'?'DRAFTED_AND_OPEN':'CHECK_STATE')"
  EXPECT: /DRAFTED_AND_OPEN/
  EVIDENCE: 2026-08-23 - comment 5389629757 posted referencing draft commit 1184c57; issue verified OPEN
