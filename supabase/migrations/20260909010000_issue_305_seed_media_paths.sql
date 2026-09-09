-- The deterministic local seed uses provenance-tracked Vite public assets.
-- Keep provider-managed media restricted to its existing /media namespace.
alter table app_public.store_media drop constraint media_local_asset;
alter table app_public.store_media add constraint media_local_asset check(
  asset_path~'^/(assets|images)/[a-zA-Z0-9_./-]+\.(svg|png|jpg|jpeg|webp)$'
  or asset_path~'^/media/official/[0-9a-f-]{36}/v[1-9][0-9]*/[a-f0-9]{16,64}\.webp$'
);
