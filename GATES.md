# Gates: Social sign-in (Google/Facebook) with posture-A admission gate

Scope: Shoppers can start OAuth sign-in with Google/Facebook; returning OAuth sessions are exchanged (PKCE) and admitted only if the Supabase identity maps to an active Antique Trail admission receipt; non-admitted identities are signed out locally with an invitation-required message. Email token-hash callbacks keep working unchanged.

- [x] G1: Typecheck, lint, and format pass across the changed sources.
  CHECK: npm run check && echo GATE_CHECKS_OK
  EXPECT: /GATE_CHECKS_OK/
  EVIDENCE: 2026-08-21 — `npm run check` chain fully green: `tsc -b` clean, `eslint .` clean, prettier clean.

- [x] G2: Auth-area unit/component suites pass (auth feature, review-harness parity, app composition), including new OAuth callback parsing, admission bounce, and social-button tests.
  CHECK: npx vitest run src/features/auth src/review-harness src/app && echo GATE_AUTH_TESTS_OK
  EXPECT: /GATE_AUTH_TESTS_OK/
  EVIDENCE: 2026-08-21 — covered inside the full-suite run: components.test.tsx 25/25 (4 new OAuth/social tests), configuredComposition.test.ts 14/14 (4 new social adapter tests), callbackPreflight.test.ts 4/4 (2 new PKCE/cancellation tests), review-harness clients/harness/components 27/27.

- [x] G3: Production build succeeds with the widened callback types and new client options.
  CHECK: npm run build && echo GATE_BUILD_OK
  EXPECT: /GATE_BUILD_OK/
  EVIDENCE: 2026-08-21 — `vite build`: 169 modules transformed, PWA generateSW precache 18 entries, built in 12.89s.

- [x] G4: New migration defines `app_public.oauth_admission_check()` callable only by `authenticated` (revoked from public/anon), security definer, checking `auth.users.raw_user_meta_data->>'antique_trail_admission_id'` against an `active` admission receipt owned by the caller.
  EVIDENCE: 2026-08-21 — `supabase/migrations/20260821120000_oauth_admission_check.sql` creates `app_public.oauth_admission_check()` as `SECURITY DEFINER SET search_path=''`, guards the uuid cast (`invalid_text_representation`) so malformed metadata fails closed rather than erroring, returns `{state:'active'|'blocked'}` only when the caller's own `raw_user_meta_data->>'antique_trail_admission_id'` resolves to an `app_private.account_admission_receipts` row with `provider_user_id = auth.uid()` and `state='active'`; execution revoked from `public`, `anon`; granted to `authenticated`.

- [x] G5: Sign-in screen renders Continue with Google / Continue with Facebook only when the adapter supports them; clicking starts the provider redirect preserving returnTo. Callback page shows distinct invitation-required copy for non-admitted OAuth identities and generic error for provider cancellation.
  EVIDENCE: 2026-08-21 — component tests prove each behavior: "offers social sign-in only when the adapter supports it" (buttons hidden without capability, wired with returnTo '/stores' when present); "completes an OAuth return and lands on the preserved private target" (PKCE exchange + /saved landing); "shows the invitation-required screen when an OAuth identity lacks admission" ('Sign-in unavailable' heading, reason-neutral alert copy, back-to-stores + support links); "shows the generic failure when the provider cancels or errors the OAuth return".

- [x] G6: Full unit suite result recorded honestly (known Windows fork-pool unhandled-error flake may make exit non-zero even when every test passes; record counts either way).
  EVIDENCE: 2026-08-21 — `npm run test`: Test Files 85 passed (85), Tests 531 passed (531), zero failures; the known fork-pool flake did not occur on this run, exit code 0. Release scripts additionally 58/58 pass.

- [x] G7: SECURITY_AND_TRUST.md records the posture-A control (OAuth identities without an active admission receipt are bounced before any private action; orphan provider accounts possible by design), the age-attestation collapse under posture A, and the manual Supabase dashboard/provider setup checklist (redirect allowlist entries, PKCE client config).
  EVIDENCE: 2026-08-21 — SECURITY_AND_TRUST.md Authentication section now carries the "Admitted-accounts social sign-in (Google/Facebook)" paragraph: preflight capture/scrub + single-use latch, `flowType:'pkce'` with `detectSessionInUrl:false`, `oauth_admission_check()` semantics, local sign-out bounce before any private request, accepted orphan-provider-identity tradeoff, registration-closed age-attestation collapse, and the manual dashboard checklist (enable providers with console client IDs/secrets, `<site-url>/auth/callback` in Site URL/additional redirect URLs per origin, keep PKCE, re-verify bounce after provider changes).

- [x] G8: PRODUCT_DECISIONS.md records the product choice: social login enabled for admitted accounts only; registration remains closed; register screen intentionally has no social buttons.
  EVIDENCE: 2026-08-21 — new confirmed decision "### Social sign-in for admitted accounts" (Approved 2026-08-21) immediately before "Remaining deferred or provider-gated decisions": posture-A social login, invitation-required screen for non-admitted identities, register screen intentionally buttonless, orphan identity row accepted, opening OAuth-driven registration would require a new decision.
