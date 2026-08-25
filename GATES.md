# Gates: all open GH tickets closed or at named human gates

Scope: work tickets #101 #104 #113 #114 #115 #116 #117 #118 #119 #120 #121 to closable state with evidence; #56 to an honest refreshed disposition. Per-leaf detail in gates/leaf-*.md.

- [ ] R1: full pgTAP suite passes CI-identically on the merged tree
  CHECK: npx supabase@2.115.0 test db
  EXPECT: /Result: PASS/
  EVIDENCE: pending

- [ ] R2: merged tree passes repo check suite
  CHECK: npm run check
  EXPECT: /BUILD_OK|built in/
  EVIDENCE: pending

- [ ] R3: every closable ticket is closed with an evidence comment; final report lists each number + closing evidence line
  EVIDENCE: pending

- [ ] R4: tickets that cannot close without a human/provider action are listed with their exact next human action; none silently dropped
  EVIDENCE: pending

- [ ] R5: Package 13 contract presented to owner before any W2 migration landed; approval or explicit non-response recorded
  EVIDENCE: pending

- [ ] R6: zero unfiled sweep findings — every Gap/Deviation found by #116/#117 has a defect ticket number recorded in its verdict draft
  EVIDENCE: pending
ABANDON: #115 no leaf file or work assigned - ticket superseded by later phases
ABANDON: #118 no leaf file or work assigned - ticket superseded by later phases
ABANDON: #119 no leaf file or work assigned - ticket superseded by later phases
