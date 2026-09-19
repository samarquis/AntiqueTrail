-- Restore the configured catalog's deterministic gallery records for local
-- Store Details and photo-wall acceptance journeys.
insert into app_public.store_media (store_id, asset_path, kind, alt_text, display_order)
select s.id,
       '/images/synthetic-fixtures/' || m.fixture_slug || '/' || lpad(g.photo::text, 3, '0') || '-wall.svg',
       'gallery',
       'Synthetic interior photo ' || g.photo || ' for ' || s.name,
       g.photo
from app_public.stores s
join (values
  ('clockwork-cabinet','blue-finch-curios'),
  ('prairie-patina','prairie-cabinet'),
  ('juniper-junction','juniper-house'),
  ('foundry-and-fable','cedar-and-brass'),
  ('meadow-motif','maple-lantern'),
  ('northstar-nook','north-star-relics'),
  ('paper-moon-market','redbud-market'),
  ('rail-and-ribbon','union-station-vintage'),
  ('sunroom-salvage','sunflower-salvage'),
  ('tin-roof-trove','tallgrass-treasures')
) as m(slug, fixture_slug) on m.slug = s.slug
cross join generate_series(1, 3) as g(photo)
where not exists (
  select 1
  from app_public.store_media existing
  where existing.store_id = s.id
    and existing.display_order = g.photo
);
