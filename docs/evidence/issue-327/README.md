# Issue 327 browser diagnostic evidence

This directory is the evidence surface for issue #327's fixture-only browser diagnostic. The runner is `playwright.issue-327.config.ts`; it owns loopback port 43217 and writes its final JSON result to `latest-results.json`.

The diagnostic uses actual application links and clicks for Browse -> Details -> Photos -> lightbox -> Details -> Browse, rather than using a navigation call to simulate a return. It covers button and Escape closure, selected tile focus return, the approved 50-photo fixture, deterministic sparse/failed-image states, cancelled anonymous Save, 320px reflow as the 200% CSS-viewport proxy, both stored themes, reduced motion, target geometry, and screenshots after the page reaches an asserted ready state.

It is browser/fixture evidence only. It does not claim a configured Auth/Edge/RPC path, assistive-technology session, or firsthand human accessibility acceptance; those remain separately visible gates (#324 and #325). The current deterministic catalog has a one-photo fixture and the approved 50-photo fixture, but no true zero-media store. The dedicated zero-media case is intentionally skipped with that reason; it is not reported as a pass.

Current execution status (2026-09-10): **UNAVAILABLE in this checkout.** `npm ci` left the dependency tree without executable `typescript`, `prettier`, or `@playwright/test` package files, so the focused command could not start. No JSON, screenshots, trace, or passing browser count is claimed until a complete dependency installation permits `node node_modules/playwright/cli.js test --config playwright.issue-327.config.ts` to finish.
