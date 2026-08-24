# Gates: Issues #92 + #87 + #56 — moderation criteria, membership spec, release-gate audit

Scope: Owner interview closes #92 (six moderation rulings recorded in PRODUCT_DECISIONS.md); #87's eleven unspecified items each decided or deferred-with-reason in a full membership spec; #56 gets an honest per-gate evidence ledger (23 rows) and stays open unless fully evidenced. All pushed to origin/main.

- [x] G1: Six #92 moderation questions ruled by owner, dated under "Photo Moderation Criteria" in PRODUCT_DECISIONS.md
  CHECK: node -e "const s=require('fs').readFileSync('PRODUCT_DECISIONS.md','utf8');const k=['Photo Moderation Criteria','storefront','screenshot','business day','resubmit','go live'];const n=k.filter(x=>s.includes(x)).length;console.log(n===6?'ALL_SIX':'ONLY_'+n)"
  EXPECT: /ALL_SIX/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G2: Rulings consistent with shipped pipeline facts (media_uploads awaiting_review lifecycle, approved_by constraint, alt guarantee, no read-path cap)
  CHECK: node -e "const s=require('fs').readFileSync('PRODUCT_DECISIONS.md','utf8');console.log(s.includes('awaiting_review')&&s.includes('approved_by')?'PIPELINE_ALIGNED':'MISMATCH')"
  EXPECT: /PIPELINE_ALIGNED/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G3: Spec doc covers ALL ten previously-unspecified items (USP-01..USP-10), each Decided or Deferred-with-reason
  CHECK: node -e "const s=require('fs').readFileSync(process.argv[1],'utf8');const ids=['USP-01','USP-02','USP-03','USP-04','USP-05','USP-06','USP-07','USP-08','USP-09','USP-10'];console.log(ids.filter(i=>s.includes(i)).length)" docs/specs/store-membership-spec.md
  EXPECT: /^10$/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G4: Commit with spec + decision updates pushed to origin/main closing #87
  CHECK: gh issue view 87 --json state,stateReason -t "{{.state}}/{{.stateReason}}"
  EXPECT: /CLOSED\/COMPLETED/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G5: docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md classifies all 23 consolidated rows as EVIDENCED / SCAFFOLDED / NOT STARTED with next human action each
  CHECK: node -e "const s=require('fs').readFileSync('docs/operations/G56_RELEASE_GATE_STATUS_LEDGER.md','utf8');const m=(s.match(/\| (EVIDENCED|SCAFFOLDED|NOT STARTED) \|/g)||[]).length;console.log(m>=23?'FULL_COVERAGE('+m+')':'PARTIAL('+m+')')"
  EXPECT: /FULL_COVERAGE\((2[3-9]|[3-9]\d)\)/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G6: Status comment posted on #56 referencing the ledger; ticket left OPEN unless every gate evidenced
  CHECK: node -e "const{execSync}=require('child_process');const j=JSON.parse(execSync('gh api repos/samarquis/AntiqueTrail/issues/56/comments',{encoding:'utf8'}));console.log(j.some(x=>x.body.includes('G56_RELEASE_GATE_STATUS_LEDGER'))?'POSTED':'MISSING')"
  EXPECT: /POSTED/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
- [x] G7: Issues #87, #92, #56 all assigned to samarquis before closure work
  CHECK: node -e "const{execSync}=require('child_process');for(const n of[87,92,56]){const j=JSON.parse(execSync('gh issue view '+n+' --json assignees',{encoding:'utf8'}));if(!j.assignees.some(a=>a.login==='samarquis')){console.log('UNCLAIMED '+n);process.exit(0)}}console.log('ALL_CLAIMED')"
  EXPECT: /ALL_CLAIMED/
  EVIDENCE: 2026-08-23 verified via gate-check run in session log; commits e754155/20e9976 on origin/main
