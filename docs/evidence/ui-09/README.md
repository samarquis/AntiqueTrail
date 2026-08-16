# UI-09 administrator, moderation, and operational review — evidence

Evidence date: 2026-08-12. The local-only review harness uses deterministic, in-memory identities and fixtures; it contacts no production service.

## Review result

| Acceptance                                                         | Browser evidence                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin can resolve documented queue items with an auditable outcome | `/admin` opens the exact submitted store-change context, requires a reason, and removes the approved case with “Case approved.”                                                                                                     |
| High-impact actions are confirmed and show consequences            | `/admin/access` revokes a Store Representative scope, previews the exact regrant before confirmation, and previews duplicate-merge safe references, quarantined conflicts, and non-transfer of authority before execution/rollback. |
| Non-admin roles cannot access privileged routes                    | Anonymous, Shopper, and Representative scenarios are redirected from `/admin`; they never receive admin fixture data.                                                                                                               |
| Operational and moderation states are locally reviewable           | `/admin/reviews` mutates an MFA/recent-auth moderation case with an appended decision reason; `/status` deliberately reports S-01 as not configured inside the app main landmark.                                                   |

The contract suite also checks loading, empty, error, blocked, and permission-denied states; 320 CSS-px reflow (the 200% zoom equivalent); every actionable target at 48×48 px or larger; and visible keyboard focus plus Enter activation.

## Screenshots and review URL

Run the review build at `http://127.0.0.1:4174/admin?reviewAs=administrator&reviewState=success`. Ordered review: queue → access/safety → partner claims → moderation → service status.

```powershell
$env:CAPTURE_UI09_EVIDENCE='true'
npx playwright test e2e/ui09-admin-moderation.spec.ts --config playwright.review.config.ts
Remove-Item Env:CAPTURE_UI09_EVIDENCE
```

The capture writes `desktop`, `tablet`, and `mobile` PNGs for queue, access, partner administration, moderation, and operational status to this directory.
