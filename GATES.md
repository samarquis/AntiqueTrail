# Gates: caveat remediation — lint debris, secret hazard, MPL contract, agent fleet

Scope: caveats 1-4 from the #99 close-out. Full `npm run check` green locally, security contract green, web CI job green after push, secret-bearing untracked scripts removed reversibly, subagent fleet spawnable again. Debris removal is backup-first (Temp/opencode/debris-backup), never silent destruction.

- [ ] G1: Secret-bearing untracked scripts removed from the working tree, backups preserved outside the repo
  CHECK: Test-Path each of the three debris scripts is False; backups exist under %TEMP%\opencode\debris-backup
  EXPECT: /False/ for all three plus backup listing
  EVIDENCE: pending

- [ ] G2: Hosted credential appears nowhere in tracked or untracked repo files
  CHECK: grep repo tree for the password substring
  EXPECT: zero matches
  EVIDENCE: pending

- [ ] G3: eslint no longer scans gitignored runtime artifacts; supabase/.temp ignored
  CHECK: npx eslint . after cleanup exits 0 with supabase/.temp present on disk
  EXPECT: exit 0
  EVIDENCE: pending

- [ ] G4: security contract accepts the dev-only axe-core MPL-2.0 dependency; npm run security:contract exit 0
  CHECK: npm run security:contract
  EXPECT: /Security contract checks passed/
  EVIDENCE: pending

- [ ] G5: FULL repository bar green locally — npm run check exit 0 (typecheck, lint, format, vitest, release contracts, build)
  CHECK: npm run check
  EXPECT: exit 0
  EVIDENCE: pending

- [ ] G6: Push lands and BOTH CI jobs conclude success on the new commit
  CHECK: gh run watch <new run id>
  EXPECT: /web=success database=success/i
  EVIDENCE: pending

- [ ] G7: Subagent fleet spawns again — probe task returns PROBE-OK without ProviderModelNotFoundError
  CHECK: task(category=quick) health probe
  EXPECT: /PROBE-OK/
  EVIDENCE: pending

Notes:
- ABANDON: none yet. Credential ROTATION itself requires Supabase dashboard access (owner action); removal of the embedded secret from disk is what this run gates on.
- Pre-run evidence: latest main CI run 32724467845 concluded database=success web=failure, failing at the "Repository security contract" step (MPL-2.0); SBOM upload error is downstream fallout only.
