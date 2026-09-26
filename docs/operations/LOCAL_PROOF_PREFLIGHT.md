# Local proof admission and ownership

Use before assigning or running local provider/database/browser acceptance. The integrator owns shared infrastructure; a behavior worker consumes a proven runner. This is an operational gate, not a claim that Docker or a provider is currently healthy.

## Admit the run

1. Pin source SHA and fixture mode. Confirm required scripts exist in that exact package.json and the locked installation completed. Record Node/npm versions and the pinned CLI version. A missing command or partial installation is an environment blocker, not a product failure.
2. Verify the Docker Linux engine responds with `docker info`. Do not infer readiness from the Desktop window or a stopped Windows service alone. If unavailable, preserve the run and assign environment recovery; no blanket service/process killing.
3. Record a resource lease: owner/task, checkout/SHA, runner command, run ID, project ID, exact loopback ports, fixture mode, receipt path, and release condition. Keep credentials and callback tokens out. Initially permit one heavy local provider/browser run at a time; independent source checks may continue.
4. Use the existing isolated runner from the approved account candidate. It must gate Auth/Edge readiness, use a run-owned mailbox for email proof, reset user fixtures between browser projects, and scope cleanup by verified owner markers. If a prerequisite fails, one infrastructure owner repairs the shared harness before dependent retries.

Completion: the intended scenario is reachable on the correct source/fixture, and no resource or shared-file owner overlaps. Do not launch another full-stack proof merely to discover which API or fixture the ticket means.

## Execute and classify

Freeze source during acceptance. Record scenario stages separately from setup and teardown. A provider identity assertion is not email-delivery proof; a stubbed delivery result must never be labeled real mailbox evidence.

- Setup failure: preserve the stage and safe diagnostic; assertions remain unexecuted.
- Assertion failure: capture the exact identity/expected/actual result and repair only the demonstrated scope.
- Inherited failure: compare exact base and candidate test identities and fixture configuration. This records a limit; it does not waive required CI.
- Transient infrastructure failure: one affected retry is justified only by new readiness evidence or a diagnosed transient cause. Do not inflate global timeouts or rerun every suite.

After source/configuration/fixture changes, refresh affected proof. Use focused checks locally first, then repository-required gates. Serial local reruns may distinguish resource contention; they do not replace required CI.

## Release the lease

Keep the scenario verdict even if teardown fails. Verify removal of this run's containers, network, volumes, and owner-marked temporary directory, including resources retained by its earlier failed attempts. Matching names alone are not ownership. Never globally prune or remove another worker's resources.

Receipt: source SHA/dirty state, fixture mode, stage, assertion counts/skips, evidence class, scenario result, cleanup result, and remaining owned resources. Mark cleanup `removed` only after checking absence. Release the lane after cleanup is verified or explicitly hand off retained resources to a named owner.

## Account harness baseline

The account harness repairs from [PR #442](https://github.com/samarquis/AntiqueTrail/pull/442) reached `main` in merge `a73e8c63`. New leaves must pin a current base containing that merge and verify the required commands there. Hosted proof and publication retain their separate authorization and acceptance gates.
