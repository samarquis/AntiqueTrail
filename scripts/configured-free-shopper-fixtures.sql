-- Run-owned local browser setup only. Declared internal synthetic imagery from
-- docs/evidence/ui-03/PROVENANCE.md; not public/commercial evidence. The
-- Standard seed owns five gallery slots; this run-owned fixture replaces the
-- first wall image with the approved cabinet photo used by the browser probe.
update app_public.store_media
set asset_path = '/images/synthetic-stores/1280w/blue-finch-curios-gallery-cabinet.webp',
    alt_text = 'Synthetic antique cabinet scene for Clockwork Cabinet'
where store_id = '00000000-0000-4000-8000-000000001001'
  and kind = 'gallery'
  and display_order = 1;
