# Free private-evaluation asset provenance

This record inventories every asset currently referenced by the private evaluation runtime: the approved app mark and feature icons, self-hosted fonts and notices, and all responsive synthetic-store image derivatives. provenance.json records the inspected source SHA, file SHA-256, runtime use, source declaration, derivative relationship, dimensions where mechanically checked, and rights status.

The record is evidence, not a license grant. Unknown means the repository does not contain a creator, license, or approval receipt that supports a stronger claim. Synthetic images remain fictional Internal Alpha fixtures and are not public, commercial, or participant evidence. The approved visual identity is unchanged; docs/design/ICON_PLACEMENT_SPEC.md remains the placement authority.

Run from the repository root:

    node scripts/verify-free-private-assets.mjs
    node --test scripts/verify-free-private-assets.test.mjs

The verifier checks every recorded file hash, evidence path, derivative parent, raster dimension, and synthetic restriction. It reports unknown rights separately and fails only for mechanical evidence problems. Add or remove an asset by updating the manifest from the new inspected source, then rerun both commands; do not invent a source or approval receipt.
