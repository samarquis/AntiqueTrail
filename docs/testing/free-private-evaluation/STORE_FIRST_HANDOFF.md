# Store-first local showcase handoff

This is the reproducible setup and blank observation packet for issue [#348](https://github.com/samarquis/AntiqueTrail/issues/348). It prepares the existing local, synthetic evaluation for the current [store-first PRD](../../../PRD.md#next-milestone-usable-internal-store-showcase). It does not change application behavior, create hosting, contact a real store, use a real account, or establish backend, provider, deployment, accessibility-human, or release acceptance.

## Candidate and boundaries

- **Source:** record the exact checked-out commit with `git rev-parse HEAD` before starting. The handoff is valid only for the candidate actually rehearsed.
- **Fixture:** `local-review-harness-fictional-v1`, with fictional stores and locally supplied synthetic imagery. Blue Finch Curios is the named showcase store; it is not a real business.
- **Harness:** the explicit local review build (`VITE_REVIEW_HARNESS_ENABLED=true`) and its deterministic in-memory identities. The harness is available only in local development/review mode and must never be treated as a production identity or authorization result.
- **Evidence:** browser observations against the fixture are `fixture_browser`. They cannot prove Supabase/RLS/RPC authorization, real account isolation, provider behavior, deployment, or human usefulness. The owner’s computer-then-phone notes below are `human_firsthand` and remain blank until the owner performs them.

## Start and stop

From the repository root:

```text
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

Use development mode without `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`; the source maps this no-provider development case to the local in-memory review harness. Do not use `npm run dev:review` with the checked-in `.env.review` for this walkthrough: that file intentionally supplies synthetic Supabase values and selects the configured transport, which requires a running local backend. If provider variables are present in the shell, clear them for this local-only rehearsal (`$env:VITE_SUPABASE_URL = ''; $env:VITE_SUPABASE_ANON_KEY = ''`).

Open `http://127.0.0.1:4173/review?reviewAs=anonymous&reviewState=success` first. The review landing page is the role entry point. Use its links, or these directly addressable local entries:

| Role | Entry point | Intended scope |
| --- | --- | --- |
| Anonymous shopper | `/review?reviewAs=anonymous&reviewState=success` → `/stores` | Browse fictional stores without an account |
| Store Representative | `/review?reviewAs=representative&reviewState=success` → `/store-portal` | Blue Finch Curios store-scoped fixture |
| Administrator | `/review?reviewAs=administrator&reviewState=success` → `/admin` | Synthetic metadata-only review queue |

The review harness must show its local-review banner. If the page does not load, stop and record the exact command, URL, browser, error, and source SHA as an unavailable setup phase. Do not substitute a deployed URL. Stop the server with `Ctrl+C`; remove only the generated evaluation output if it is no longer needed.

For the focused automated rehearsal and machine-readable report, run:

```text
node scripts/free-private-evaluation.mjs --mode local --output artifacts/free-private-evaluation
```

This command chooses an available loopback port, runs the existing `e2e/persona-free-private-evaluation.spec.ts` against the local harness, and writes the exact source/fixture distinction and blank owner packet to `artifacts/free-private-evaluation/report.json`. A non-zero result is a recorded failure, not permission to claim a pass. The report is generated evidence and is not a replacement for the owner’s firsthand notes.

## Focused showcase walkthrough

Perform the shopper portion on a computer first, then repeat the supported browse/details/photos/return path in a phone browser or narrow browser viewport. The phone row records the platform used; lack of physical-phone access is explicitly unavailable, not verified.

1. On `/stores`, search or select the fictional **Blue Finch Curios** result.
2. Open Store Details and inspect the name, hours, location/contact facts, provenance labels, and truthful photo count.
3. Open the photographs section and activate a photo/lightbox with the keyboard on the computer. Check that the caption/alt relationship remains understandable, Escape closes the dialog, focus returns, and returning to Details remains possible. Do not add Save or Add to Trip; those are optional and trips are outside this handoff.
4. Use the page’s normal Back/return path and confirm the selected store context is retained. A fixture browser result proves only this local UI transition.
5. Switch/reset to `reviewAs=representative`, open `/store-portal`, and demonstrate one fictional Representative edit using the existing local fixture. Record whether the UI identifies the exact store and whether the edit is marked immediate or Administrator-reviewed. This does not prove a server write or real publication.
6. Switch/reset to `reviewAs=administrator`, open `/admin` (or the linked partner review case), and demonstrate the corresponding fictional approval/review result. Record the exact visible case and outcome. This does not prove MFA, RLS/RPC enforcement, audit persistence, or production publication.

Record each transition, route, browser/viewport, visible result, error, and limitation. Never fill a human reaction from the simulated persona report.

## Owner’s blank observation packet

The owner records computer observations first and phone observations second. Leave fields blank until firsthand use.

### Computer (human_firsthand: not started)

- Browser/version:
- Source SHA:
- Setup result and route:
- Interruption or failure:
- Hesitation/confusion:
- Usefulness:
- Readability/presentation:
- Ease:
- Flow:
- Enjoyment:
- Memorable elements:
- Return intent:
- Help needed / error recovery:

### Phone (human_firsthand: not started)

- Phone platform/model or narrow viewport:
- Physical phone available? If no, write `unavailable`:
- Browser/version:
- Source SHA:
- Setup result and route:
- Interruption or failure:
- Hesitation/confusion:
- Usefulness:
- Readability/presentation:
- Ease:
- Flow:
- Enjoyment:
- Memorable elements:
- Return intent:
- Help needed / error recovery:

### Disposition (human_firsthand: not started)

- Decision: `continue` / `revise` / `stop`:
- Reason:
- Specific next bounded change or follow-up:

This disposition applies only to the local showcase evaluation. It is not a release, pilot, provider, payment, or demand decision.

## Evidence and follow-up ownership

The focused rehearsal evidence for this handoff used development mode on `http://127.0.0.1:42200` with no provider variables and source `17b4236e35d42b7eb82af0f2dc0e38b03618b4d4`: shopper Browse → Details → 50 photos → lightbox → return; Representative `Blue Finch Curios` managed-field publish; Administrator `Review queue` → `Case approved.` The result is `fixture_browser` evidence only. The existing local runner/report remains the source for fixture-browser assertions. The owner supplies the firsthand observations and decision for #324. Accessibility worksheet work is separate in #345; this handoff links it but does not close or replace it. The prior packet at [README.md](README.md) and its scenarios remain intact for historical/other evaluation coverage; they are not rewritten here.

Known unavailable evidence for this handoff: physical-phone access unless the owner has one, real Supabase/Auth/RLS/RPC behavior, provider behavior, deployment/hosting, real stores/participants, and public or paid activation. No unavailable item is a pass.
