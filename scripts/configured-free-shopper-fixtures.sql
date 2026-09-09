-- Run-owned local browser setup only. Declared internal synthetic imagery from
-- docs/evidence/ui-03/PROVENANCE.md; not public/commercial evidence.
update app_public.store_media set asset_path='/assets/synthetic/stores/clockwork-cabinet.webp'
where store_id='00000000-0000-4000-8000-000000001001' and kind='cover';
insert into app_public.store_media(store_id,asset_path,kind,alt_text,display_order)
values ('00000000-0000-4000-8000-000000001001',
 '/assets/synthetic/stores/clockwork-cabinet-gallery.webp','gallery',
 'Synthetic antique cabinet scene for Clockwork Cabinet',1);
