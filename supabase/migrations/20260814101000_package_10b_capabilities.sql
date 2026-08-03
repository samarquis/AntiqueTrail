create table release_private.release_capabilities (
  release_id uuid primary key references release_private.regional_releases(release_id) on delete restrict,
  public_catalog boolean not null default false,public_claims boolean not null default false,
  public_reviews boolean not null default false,public_registration boolean not null default false,
  product_promotion boolean not null default false,updated_at timestamptz not null default statement_timestamp(),
  constraint release_capabilities_atomic check (
    (public_catalog and public_claims and public_reviews and public_registration and product_promotion)
    or (not public_catalog and not public_claims and not public_reviews and not public_registration and not product_promotion)
  )
);
