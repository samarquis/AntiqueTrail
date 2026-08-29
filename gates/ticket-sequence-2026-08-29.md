# Gates: ordered GitHub ticket sequence

Scope: each supplied ticket is closed with independently verified evidence, or has a dated GitHub blocker comment explaining why it remains open.

- [x] G01 #152 reaches a terminal GitHub outcome.
  EVIDENCE: 2026-08-29 — CLOSED with evidence comment at https://github.com/samarquis/AntiqueTrail/issues/152; implementation commit `c9359d9` pushed to `origin/codex/issue-116-wowed` after independent focused unit 11/11, typecheck, lint, changed-file Prettier/diff checks, and review-harness browser 36 passed / 0 failed / 3 skipped.
- [ ] G02 #151 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G03 #150 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G04 #149 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G05 #148 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G06 #147 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G07 #146 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G08 #144 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G09 #143 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G10 #142 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G11 #141 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G12 #140 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G13 #139 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G14 #138 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G15 #137 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G16 #135 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G17 #133 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G18 #132 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G19 #131 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G20 #130 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G21 #129 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G22 #126 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G23 #125 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G24 #124 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G25 #123 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G26 #117 reaches a terminal GitHub outcome.
  EVIDENCE: pending
- [ ] G27 #56 reaches a terminal GitHub outcome.
  EVIDENCE: pending

- [ ] G28: The root ledger is independently checked after every terminal outcome and contains no pending supplied tickets.
  CHECK: if (rg -n "EVIDENCE: pending" gates/ticket-sequence-2026-08-29.md) { "PENDING" } else { "NONE" }
  EXPECT: NONE
  EVIDENCE: pending
