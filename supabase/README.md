# Local catalog database

Package 1 is intentionally local and synthetic. The migration creates the `app_public` schema, seeds twelve fictional stores, and exposes only two anonymous read RPCs:

- `catalog_list(p_q, p_category, p_area)` — deterministic name/area/category search.
- `catalog_details(p_slug)` — one active Synthetic Store or an indistinguishable empty result.

The browser Supabase client must set its database schema to `app_public`. Direct table reads and all anonymous writes are denied by grants and `FORCE ROW LEVEL SECURITY`.

With Docker and the Supabase CLI installed:

```text
supabase start
supabase db reset
supabase test db
```

`db reset` is local/destructive and must never target a shared or production project. The current development environment does not include Docker or the Supabase CLI, so database reset and pgTAP execution remain a CI/environment verification step.
