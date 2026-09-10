# Real local Representative hours publication

Run the one-command #322 diagnostic from a clean checkout with Docker Desktop and Playwright Chromium installed:

```powershell
node scripts/configured-representative-hours.mjs
```

The command creates its own local Supabase project, loopback ports, synthetic Representative, exact one-store grant, and ordinary GoTrue TOTP enrollment. The browser signs in with password and enters the generated TOTP code through the application UI. Setup credentials and raw browser artifacts remain in the owned temporary directory and are removed during cleanup.

At desktop and phone widths, the suite changes Monday's closing value through `/store-portal/hours`, verifies direct-publication UI labeling and success, independently reads the exact database row, reloads the portal, and then signs a distinct permitted shopper into the catalog for readback. It separately revokes the exact Representative grant, attempts the next UI edit, requires generic denial plus focused input, and verifies neither the owned nor sibling store changed. No media, paid, email, support, hosted, or provider action is enabled.

`CONFIGURED_REPRESENTATIVE_HOURS_WRONG_READBACK=1 node scripts/configured-representative-hours.mjs` is the required negative control. It changes only the expected independent readback value, so the real result must fail and exit nonzero. A missing/malformed Playwright report, omitted project, failed assertion, or cleanup failure cannot pass.

The redacted `artifacts/configured-shopper-*/report.json` records source, schema/function/configuration/fixture identities, loopback endpoint, project, individual results, and cleanup. Keep raw trace files, temporary browser input, credentials, and token-bearing output local.
