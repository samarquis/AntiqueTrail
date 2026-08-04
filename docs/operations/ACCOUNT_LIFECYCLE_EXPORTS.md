# Account lifecycle exports

Portable account exports are deterministic ZIP archives containing canonical JSON, convenience
CSVs, eligible requester-owned media, and a SHA-256 manifest.

The Edge worker uses explicit memory-safety bounds: at most 100 media objects, 8 MiB for any one
source object (including canonical JSON), and 32 MiB across uncompressed source entries. The SQL
boundary rejects an oversized media set before aggregating it. Before download, the Storage adapter
requires authoritative object metadata with a safe integer size inside the remaining bound; missing,
malformed, or oversized metadata fails closed before a Blob is allocated. The adapter checks the
downloaded Blob again to detect metadata drift. A bound violation follows the normal retry-safe
failed export path and the account screen offers retry/support guidance; operators must not silently
omit files from an archive.

These limits are a launch-stage operational constraint. Raising them requires a streaming archive
writer/upload path and a witnessed worker-memory rehearsal before deployment.
