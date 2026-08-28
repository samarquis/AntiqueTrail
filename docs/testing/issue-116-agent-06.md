# Issue #116 lane 06 — Package 7 Access & Safety

Date: 2026-08-27 (America/Chicago). Static review found the active-scope revoke path asks for a preview in the UI (`src/features/admin/components.tsx:283-301`), while `app_public.admin_preview_store_scope_change` rejects every state except `revoked` (`supabase/migrations/20260822100000_package_7_operational_admin.sql:309-320`). The review harness is permissive and therefore does not prove the production RPC path. Browser/unit execution was unavailable in the isolated worktree. Finding ticket: #133.
