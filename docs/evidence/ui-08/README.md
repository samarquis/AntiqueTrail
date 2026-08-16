# UI-08 partner onboarding and Store Portal — evidence

Evidence date: 2026-08-12. The local-only review harness uses synthetic
in-memory identities and data; it never contacts an email provider, a media
service, or production store records.

## Ordered review rows

| Row | Browser evidence                                                                                                                                              | Result |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | Non-representative roles are redirected or receive the scoped portal denial, with no Blue Finch data.                                                         | ✓      |
| 2   | `#token=review-partner-invite` exchanges to an active invitation; consent includes the no-access/no-install disclosure.                                       | ✓      |
| 3   | E-01 identity binding states that approved-email-provider verification is unavailable; it never reports a fabricated binding.                                 | ✓      |
| 4   | Approved status, draft save/submit, and the exact Blue Finch claim show understandable lifecycle state.                                                       | ✓      |
| 5   | Blue Finch Portal renders freshness/provenance; controlled change, text update, official link, and support-ticket writes visibly mutate the scoped workspace. | ✓      |
| 6   | M-01 media capability remains disabled and explicitly describes the honest gate.                                                                              | ✓      |
| 7   | Loading, empty, error, blocked, and permission-denied fixtures show loading, truthful empty, or generic safe errors without seeded data.                      | ✓      |
| 8   | 320 CSS-px / 200% reflow, keyboard focus, H1 navigation focus, and 48×48 target scan are asserted.                                                            | ✓      |

## Screenshots

The capture writes five stateful viewports for desktop, tablet, and mobile:
`{project}-partner-invitation.png`, `partner-status.png`, `portal-home.png`,
`portal-changes.png`, and `portal-support.png`.

## Reproduce

```powershell
npx vitest run src/review-harness/clients.test.ts
npx playwright test e2e/ui08-partner-portal.spec.ts --config playwright.review.config.ts
$env:CAPTURE_UI08_EVIDENCE='true'; npx playwright test e2e/ui08-partner-portal.spec.ts --config playwright.review.config.ts --grep "evidence when explicitly requested"; Remove-Item Env:CAPTURE_UI08_EVIDENCE
```

The full required checks are `npm run check` and `npm run test:e2e:review`.
