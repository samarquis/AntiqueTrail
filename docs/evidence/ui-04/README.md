# UI-04 local role-based review harness

## Start from a clean checkout

1. Run `npm ci`.
2. Run `npm run dev:review -- --host 127.0.0.1`.
3. Open `http://127.0.0.1:4173/review?reviewAs=anonymous&reviewState=success`.

The committed `.env.review` contains one non-secret boolean. Vite loads it only for the explicit
`review` mode, and `createReviewHarness` additionally requires `import.meta.env.DEV`. Consequently,
`vite build --mode review` cannot activate a review session. Production replacement also makes the
dynamic fixture imports unreachable, so Vite omits their identities and local token labels from the
bundle. Synthetic access-token labels exist only in memory and are never rendered or persisted.

No credentials, Supabase project, identity provider, production data, or manual database edits are
needed. All names, email-shaped labels, dates, stores, cases, and records are fictional.

## Ordered review

Use the identity buttons on `/review`; each selection reloads a fresh in-memory session. Complete
the following in order:

1. **Anonymous shopper** — Browse the catalog, then open the Saved Stores denial check and confirm
   private content is not shown.
2. **Shopper A** — Open Saved Stores, New Since, and My Trip. Confirm Blue Finch Curios, Avery's
   private memory context, the correction, and Avery's antique day remain scoped to Shopper A.
3. **Shopper B** — Open Shared with Me, Trip Ideas, and Blocked Senders. Confirm the Weekend
   estate-sale lead appears and the Shopper A correction denial does not disclose its content.
4. **Store Representative** — Open Store Portal, Hours, and Controlled Changes. Confirm the only
   scope is Blue Finch Curios and the pending synthetic address change remains unpublished.
5. **Administrator** — Open Review Queue, Partner cases, and Moderation. Confirm MFA/recent-auth
   guard admission and the synthetic moderation case, then use both shopper-private denial links.
6. For each identity, select **loading**, **empty**, **error**, **blocked**, **permission denied**, and
   **success**. Each state has a stable URL suitable for a defect report.
7. Activate the skip link and traverse the identity, state, destination, denial, and reset controls
   using only Tab, Shift+Tab, Enter, and Space. Focus must remain visible.
8. Repeat at phone, tablet, desktop, and browser 200% zoom. No control or content may be clipped or
   require horizontal page scrolling.
9. Select **Reset review fixtures**. This clears local/session storage and the app's private-trip
   IndexedDB on the dedicated local-review origin. Confirm the URL and banner return to
   anonymous/success and no prior private identity remains active.

## State URLs

The URL contract is `/review?reviewAs=<identity>&reviewState=<state>`.

- Identities: `anonymous`, `shopper-a`, `shopper-b`, `representative`, `administrator`
- States: `success`, `loading`, `empty`, `error`, `blocked`, `permission-denied`

Unknown values fail closed to `anonymous` and `success`.

## Automated checks and evidence

- `npm run test:e2e:review` runs role admission, functioning fixture-client, cross-account denial,
  semantic state, reset, keyboard, 200% reflow, and 48-by-48 target contracts on phone, tablet, and
  desktop projects.
- `$env:CAPTURE_UI04_EVIDENCE='1'; npm run test:e2e:review` also refreshes the three screenshots in
  this directory. Remove the temporary shell variable afterward.
- Unit contracts in `src/review-harness` prove production lockout, deterministic sessions, fixture
  states, role permission boundaries, and Shopper A/B isolation.

The screenshot files are generated from the same review test after all assertions pass. Product
Owner visual approval remains a human decision and is not implied by green CI.

## Design comparison

The harness uses the application shell and its existing design tokens rather than creating a
second visual system. It preserves the required Browse / My Trip / More navigation, page-H1 focus,
skip link, single main landmark, visible focus, self-hosted typography, responsive reflow, and
48-by-48 minimum action targets from `DESIGN.md` and `DESIGN_SYSTEM.md`. The harness banner is
explicitly labeled “Local review” so synthetic role context cannot be mistaken for a production
account.
