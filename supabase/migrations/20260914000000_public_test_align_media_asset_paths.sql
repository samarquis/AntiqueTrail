-- Forward-only migration to align store_media asset_path with reviewed seed.sql webp media assets
update app_public.store_media sm
set asset_path = m.asset_path
from app_public.stores s
join (
  values
    ('clockwork-cabinet','/images/synthetic-stores/1280w/blue-finch-curios-cover.webp'),
    ('prairie-patina','/images/synthetic-stores/1280w/prairie-cabinet-cover.webp'),
    ('juniper-junction','/images/synthetic-stores/1280w/juniper-house-cover.webp'),
    ('foundry-and-fable','/images/synthetic-stores/1280w/cedar-and-brass-cover.webp'),
    ('meadow-motif','/images/synthetic-stores/1280w/maple-lantern-cover.webp'),
    ('northstar-nook','/images/synthetic-stores/1280w/north-star-relics-cover.webp'),
    ('paper-moon-market','/images/synthetic-stores/1280w/redbud-market-cover.webp'),
    ('rail-and-ribbon','/images/synthetic-stores/1280w/union-station-vintage-cover.webp'),
    ('sunroom-salvage','/images/synthetic-stores/1280w/sunflower-salvage-cover.webp'),
    ('tin-roof-trove','/images/synthetic-stores/1280w/tallgrass-treasures-cover.webp')
) as m(slug, asset_path) on s.slug = m.slug
where sm.store_id = s.id and sm.kind = 'cover'