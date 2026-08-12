# UI-09 review specification

This local, secret-free review harness proves issue #39 without inventing production administration or operational data. The Administrator fixture is MFA-verified and recently authenticated; Shopper, Representative, and Anonymous fixtures are denied by the real route guard.

Routes: `/admin` (assigned review queue), `/admin/access` (Store Representative scopes and duplicate merges), `/admin/partners` (exact claim and authority signal), `/admin/reviews` (moderation), and `/status` (honest S-01 operational state).

The Playwright contract in `e2e/ui09-admin-moderation.spec.ts` asserts meaningful content and state transitions: review detail and case resolution; revoke → preview regrant → confirm regrant; preview → execute → rollback merge; partner signal verification and decision; moderation decision; role denial; honest failure/loading/empty states; reflow; target size; keyboard focus; and screenshots in desktop, tablet, and mobile projects.

Run `npm run test:e2e:review` for the registered review suite, or run the UI-09 file directly as shown in the evidence README. `CAPTURE_UI09_EVIDENCE=true` enables PNG output.
