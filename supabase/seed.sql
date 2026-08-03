-- Deterministic synthetic fixtures. No real businesses, providers, or remote media.
insert into app_public.catalog_areas (id,slug,label,state_code,sort_order) values
 ('00000000-0000-4000-8000-000000000001','topeka-ks','Topeka','KS',1);

insert into app_public.store_categories (id,slug,label,sort_order) values
 ('00000000-0000-4000-8000-000000000101','antique-mall','Antique Mall',1),
 ('00000000-0000-4000-8000-000000000102','vintage','Vintage',2),
 ('00000000-0000-4000-8000-000000000103','furniture','Furniture',3),
 ('00000000-0000-4000-8000-000000000104','collectibles','Collectibles',4),
 ('00000000-0000-4000-8000-000000000105','home-decor','Home Decor',5),
 ('00000000-0000-4000-8000-000000000106','flea-market','Flea Market',6);

insert into app_public.stores (id,slug,name,town,state_code,address,area_id,summary,description,phone,website,timezone_name,synthetic,audience,publication_state)
select id::uuid,slug,name,'Topeka','KS',address,'00000000-0000-4000-8000-000000000001'::uuid,summary,description,phone,website,'America/Chicago',true,'synthetic','active'
from (values
 ('00000000-0000-4000-8000-000000001001','clockwork-cabinet','Clockwork Cabinet','101 Fiction Lane','A warm cabinet of imaginary clocks, brass curios, and storybook finds.','A fictional neighborhood shop for testing the complete Store Browser journey. Every object, description, and image is synthetic.','+1 785 555 0101','https://example.com/antique-trail/clockwork-cabinet'),
 ('00000000-0000-4000-8000-000000001002','prairie-patina','Prairie Patina','202 Make-Believe Avenue','Painted furniture and gentle vintage colors for a slow Saturday browse.','Prairie Patina is a rights-safe fictional store fixture with a calm furniture and home-decor mix.','+1 785 555 0102','https://example.com/antique-trail/prairie-patina'),
 ('00000000-0000-4000-8000-000000001003','juniper-junction','Juniper Junction','303 Storybook Street','Collectible paper goods, tiny trains, and playful shelf-sized treasures.','Juniper Junction is a synthetic collectibles shop used only for local development and testing.','+1 785 555 0103','https://example.com/antique-trail/juniper-junction'),
 ('00000000-0000-4000-8000-000000001004','foundry-and-fable','Foundry and Fable','404 Lantern Road','Industrial textures and fictional finds with a handmade-market feel.','Foundry and Fable offers a synthetic blend of flea-market and vintage categories.','+1 785 555 0104','https://example.com/antique-trail/foundry-and-fable'),
 ('00000000-0000-4000-8000-000000001005','meadow-motif','Meadow Motif','505 Meadow Loop','Soft linens, imagined ceramics, and bright home accents.','Meadow Motif is a fictional home-decor stop with deterministic catalog data.','+1 785 555 0105','https://example.com/antique-trail/meadow-motif'),
 ('00000000-0000-4000-8000-000000001006','northstar-nook','Northstar Nook','606 Compass Court','A small nook of maps, vintage games, and curious collectibles.','Northstar Nook is synthetic content for exercising details, search, and hours states.','+1 785 555 0106','https://example.com/antique-trail/northstar-nook'),
 ('00000000-0000-4000-8000-000000001007','paper-moon-market','Paper Moon Market','707 Moonlight Drive','Fictional ephemera, posters, and market-day discoveries.','Paper Moon Market is a rights-safe, imaginary flea-market fixture.','+1 785 555 0107','https://example.com/antique-trail/paper-moon-market'),
 ('00000000-0000-4000-8000-000000001008','rail-and-ribbon','Rail and Ribbon','808 Union Way','Vintage textiles and tiny railway memorabilia in a bright studio.','Rail and Ribbon is synthetic and never represents a real store or owner.','+1 785 555 0108','https://example.com/antique-trail/rail-and-ribbon'),
 ('00000000-0000-4000-8000-000000001009','sunroom-salvage','Sunroom Salvage','909 Sunbeam Boulevard','Fictional salvaged furniture and cheerful collectible accents.','Sunroom Salvage supports missing-image and category-filter fixture coverage.','+1 785 555 0109','https://example.com/antique-trail/sunroom-salvage'),
 ('00000000-0000-4000-8000-000000001010','tin-roof-trove','Tin Roof Trove','100 Tin Roof Terrace','A make-believe trove of tools, toys, and old-house details.','Tin Roof Trove is a local Synthetic Store with no external provider dependency.','+1 785 555 0110','https://example.com/antique-trail/tin-roof-trove'),
 ('00000000-0000-4000-8000-000000001011','willow-warehouse','Willow Warehouse','111 Willow Walk','A fictional warehouse with roomy furniture and home-decor finds.','Willow Warehouse is intentionally media-free to exercise the neutral placeholder.','+1 785 555 0111','https://example.com/antique-trail/willow-warehouse'),
 ('00000000-0000-4000-8000-000000001012','velvet-veranda','Velvet Veranda','1212 Veranda View','Imagined velvet chairs, framed art, and a welcoming browsing room.','Velvet Veranda rounds out the twelve-store deterministic fixture set.','+1 785 555 0112','https://example.com/antique-trail/velvet-veranda')
) as x(id,slug,name,address,summary,description,phone,website);

insert into app_public.store_category_assignments (store_id,category_id)
select s.id, c.id
from app_public.stores s
join app_public.store_categories c on c.slug = case
  when s.slug in ('clockwork-cabinet','foundry-and-fable') then 'antique-mall'
  when s.slug in ('prairie-patina','rail-and-ribbon') then 'vintage'
  when s.slug in ('meadow-motif','sunroom-salvage','willow-warehouse') then 'furniture'
  when s.slug in ('juniper-junction','northstar-nook') then 'collectibles'
  when s.slug in ('paper-moon-market','tin-roof-trove') then 'flea-market'
  else 'home-decor' end;
insert into app_public.store_category_assignments (store_id,category_id)
select s.id,c.id from app_public.stores s join app_public.store_categories c on c.slug='home-decor'
where s.slug in ('prairie-patina','foundry-and-fable','velvet-veranda');

insert into app_public.store_fact_verifications (store_id,verification_group,verified_at,provenance_label,verifier_kind)
select s.id,g.group_name,'2026-07-15 12:00:00+00','Synthetic fixture generated for Antique Trail Package 1','synthetic_fixture'
from app_public.stores s cross join (values
 ('identity_location'::app_public.verification_group),('contact'::app_public.verification_group),('hours'::app_public.verification_group),('categories_attributes'::app_public.verification_group)
) g(group_name);

-- Every store is open Monday-Saturday 10:00-17:00 local and closed Sunday.
insert into app_public.store_weekly_hours (store_id,iso_weekday,interval_index,is_closed,opens_at,closes_at)
select s.id, d, 1, d=7, case when d=7 then null else time '10:00' end, case when d=7 then null else time '17:00' end
from app_public.stores s cross join generate_series(1,7) d;

-- One dated replacement demonstrates exception precedence without using a real holiday.
insert into app_public.store_hour_exceptions (store_id,local_date,interval_index,is_closed,opens_at,closes_at,label)
values ('00000000-0000-4000-8000-000000001001','2026-12-24',1,false,'11:00','15:00','Synthetic winter schedule');

insert into app_public.store_media (store_id,asset_path,kind,alt_text,display_order)
select id, '/assets/synthetic/stores/' || slug || '.svg', 'cover', 'Illustrated synthetic cover for ' || name, 0
from app_public.stores where slug not in ('willow-warehouse','velvet-veranda');
