# Account release source manifest - #444

Production lineage: `c62850ff2091b1013fe9e5bbe3c538db28e64fbe`, extended by reviewed account work through `f42b087eeeb43bdde7235b795596dfd472a08e7f` (PR #409). This release branch is separate from main because production contains Browse/gallery work absent from main.

Selected account settings source and direct tests come from `e3c42422090b66c684fbac4b27f6c1ce9638650c` (merged #442 plus #421). No dirty checkout files are imported. Two App hunks connect the authoritative settings client to AuthProvider and remove the obsolete provider prop from UserSettingsPage. CSS changes cover saved-address wrapping and readable privacy text.

Preserved from production lineage: public Browse/Details/Help/Status, navigation, gallery, media assets, seed data, and historical migration `20260919000000_configured_store_gallery.sql`. Public UI integration #423 remains separate.

Account changes cover canonical display names, versioned/idempotent settings writes, current-value reads after retry, content-free receipts, and the stage-closed address UI. Existing sign-in, registration, password policy, OAuth callbacks and hosted Edge Functions are unchanged. Do not deploy Functions for this release. Optional private address policy matches #442; current UI does not collect addresses.

Only pending database migrations are `20260926211513_account_settings_concurrency.sql` and `20260926220346_account_settings_private_receipts.sql`. Apply both before promoting the matching frontend. Never expose the intermediate payload-derived receipt contract. Old two-argument writers fail closed until browser reload. Do not repair remote history or restore the unversioned writer.

Record exact source, checks, migrations, deployment and canonical proof in the release PR and #444. Hosted signup-email lifecycle remains #428; local mailbox evidence is not hosted proof.
