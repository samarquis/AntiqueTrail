# Gates: Decision â†’ Plan â†’ Ticket-tree turn

Scope: owner rulings (tickets-only, dark mode in W1, staged-off billing) recorded; TDD development plan doc written; 16-ticket tree (#105â€“#120) cut and verified open; plan numbering matches actual issue numbers; committed and pushed. NO code authorized â€” start instruction still pending.

- [x] G1: Staged-off build authorization recorded in PRODUCT_DECISIONS.md photo-tier section
  CHECK: node -e "const s=require('fs').readFileSync('PRODUCT_DECISIONS.md','utf8');console.log(s.includes('Staged-off build authorization')&&s.includes('permanently staged off')?'RECORDED':'MISSING')"
  EXPECT: /RECORDED/
  EVIDENCE: RECORDED
- [x] G2: Plan doc exists with W0-W4, ticket tables, deferred-decision trigger table
  CHECK: node -e "const s=require('fs').readFileSync('docs/specs/TDD_DEVELOPMENT_PLAN.md','utf8');const k=['W0','W1','W2','W3','W4','Deferred-decision triggers','start instruction'];const n=k.filter(x=>s.includes(x)).length;console.log(n===7?'PLAN_COMPLETE':'PARTIAL_'+n)"
  EXPECT: /PLAN_COMPLETE/
  EVIDENCE: PLAN_COMPLETE
- [x] G3: All sixteen tickets #105-#120 exist and are open
  CHECK: node -e "const{execSync}=require('child_process');const o=JSON.parse(execSync('gh issue list --state open --limit 40 --json number',{encoding:'utf8'}).toString());const have=new Set(o.map(i=>i.number));const missing=[];for(let n=105;n<=120;n++){if(!have.has(n))missing.push(n)};console.log(missing.length?'MISSING:'+missing.join(','):'ALL_SIXTEEN_OPEN')"
  EXPECT: /ALL_SIXTEEN_OPEN/
  EVIDENCE: ALL_SIXTEEN_OPEN
- [x] G4: Plan doc numbering matches actual issue titles
  CHECK: node -e "const{execSync}=require('child_process');const want={105:'updates route',111:'Review Hours',113:'Package 13',114:'moderation queue',115:'rejection reason',118:'tier state + cap resolution',119:'approved-count vs tier',120:'staged-off capability flag'};for(const[n,t]of Object.entries(want)){const j=JSON.parse(execSync('gh issue view '+n+' --json title',{encoding:'utf8'}));if(!j.title.includes(t)){console.log('MISMATCH '+n);process.exit(0)}}console.log('NUMBERING_ALIGNED')"
  EXPECT: /NUMBERING_ALIGNED/
  EVIDENCE: NUMBERING_ALIGNED
- [x] G5: Committed and pushed to origin/main
  CHECK: git log origin/main --oneline -1 -- docs/specs/TDD_DEVELOPMENT_PLAN.md PRODUCT_DECISIONS.md
  EXPECT: a commit hash line
  EVIDENCE: 2026-08-23 verified - commit 9e06302 pushed to origin/main (fd9071c..9e06302), gate-check run in session log
