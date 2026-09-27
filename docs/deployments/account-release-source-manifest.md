# Account release source manifest — #444

Production lineage: `c62850ff2091b1013fe9e5bbe3c538db28e64fbe`, extended by the reviewed account work through `f42b087eeeb43bdde7235b795596dfd472a08e7f` (PR #409). This release branch is intentionally separate from main because production contains Browse/gallery work absent from main.

Selected account settings source and direct tests come from `e3c42422090b66c684fbac4b27f6c1ce9638650c` (merged #442 plus #421). No unknown dirty checkout files are imported. The two App runtime hunks connect the authoritative settings client to AuthProvider and remove the obsolete provider prop from UserSettingsPage. CSS additions are restricted to saved-address wrapping and readable privacy text.

Preserved from production lineage: catalog implementations, public Browse/Details/Help/Status surfaces, navigation, gallery, media assets, seed data, and historical migration `20260919000000_configured_store_gallery.sql`. PR #408/#394 and public UI integration #423 remain separate.

Account/auth source includes the current main password contract (12–128 characters), explicit OAuth availability, canonical account display names, versioned/idempotent settings writes, current-value reads after retry, private receipt retention, and the stage-closed address UI. Registration and recovery Function code must ship with the matching frontend policy. Optional private address policy clauses match #442; current UI does not collect an address.

Only pending reviewed database migrations are `20260926211513_account_settings_concurrency.sql` and `20260926220346_account_settings_private_receipts.sql`. Apply both in the same coordinated rollout; never expose the intermediate payload-derived receipt contract. Old two-argument writers fail closed until browser reload. Do not repair remote history or restore the unversioned writer.

Acceptance evidence and exact candidate SHA are recorded in the release PR and #444 after verification. Hosted email/signup lifecycle remains #428; local mailbox evidence must not be relabeled as hosted proof.
