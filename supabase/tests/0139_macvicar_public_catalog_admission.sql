begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(15);

-- All authority, approvals, hashes and bytes here are isolated SQL fixtures,
-- never a hosted asset permission, Administrator decision, or scan receipt.
update public_test_private.bindings set state='revoked',revoked_at=statement_timestamp() where state='active';
update public_test_private.runtime set active_binding_id=null;
create temporary table macvicar_fixture as select public_test_private.prepare_macvicar_store() store_id,
 null::uuid binding_id,null::uuid admission_id,null::text manifest,null::jsonb spec,null::jsonb approvals;
update macvicar_fixture set binding_id=public_test_private.prepare(jsonb_build_object(
 'backendRef','uaupykgpegbseboklubv','origin','https://antique-trail.vercel.app','sourceSha',repeat('a',40),
 'artifactDigest',repeat('b',64),'configurationDigest',repeat('c',64),'schemaDigest',repeat('d',64),'evidenceDigest',repeat('e',64),
 'decisionRef','isolated fixture','reviewRef','https://github.com/samarquis/AntiqueTrail/pull/522','operatorRef','isolated fixture','stopOwner','isolated fixture',
 'capabilities',jsonb_build_array('catalog'),'storeIds',(select jsonb_agg(id order by id) from app_public.stores where synthetic and publication_state='active'),
 'startsAt',statement_timestamp(),'expiresAt',statement_timestamp()+interval '1 hour','testers','[]'::jsonb),
 extensions.gen_random_uuid(),(select version from public_test_private.runtime where id=1));
select public_test_private.activate(binding_id,(select version from public_test_private.runtime where id=1)) from macvicar_fixture;
update macvicar_fixture set manifest=jsonb_build_object('schemaVersion',1,'storeSlug','the-market-at-macvicar',
 'galleryWallSha256',repeat('1',64),'sourceRightsManifestSha256',repeat('2',64),'assets',
 (select jsonb_agg(jsonb_build_object('kind',case when n=0 then 'cover' else 'gallery' end,'order',n,
  'sha256',md5('asset'||n)||md5('derivative'||n),'bytes',32,'width',1,'height',1,'chunks',jsonb_build_array('VP8'),
  'path','/curated/macvicar/v1/'||md5('asset'||n)||md5('derivative'||n)||'.webp','sourcePhotoId','52200'||n,
  'alt','Reviewed fixture photo '||n,'caption','Fixture caption '||n,'rightsLabel','Store owner-authorized photo') order by n) from generate_series(0,50)n))::text;
update macvicar_fixture set approvals=(select jsonb_agg(jsonb_build_object('assetSha256',x->>'sha256',
 'metadataDigest',encode(extensions.digest(convert_to(x::text,'UTF8'),'sha256'),'hex'),
 'permissionRef','isolated permission fixture','approverRef','isolated approval fixture','approvedAt',statement_timestamp(),
 'securityRef','isolated scan fixture')) from jsonb_array_elements(manifest::jsonb->'assets')x),
 spec=jsonb_build_object('storeId',store_id,'bindingId',binding_id,'sourceSha',repeat('a',40),'artifactDigest',repeat('b',64),
 'configurationDigest',repeat('c',64),'schemaDigest',repeat('d',64),'manifestSha256',encode(extensions.digest(convert_to(manifest,'UTF8'),'sha256'),'hex'),
 'storeProfileDigest',encode(public_test_private.macvicar_profile_digest(store_id),'hex'),
 'decisionRef','isolated fixture','reviewRef','https://github.com/samarquis/AntiqueTrail/pull/522','operatorRef','isolated fixture','stopOwner','isolated fixture',
 'startsAt',(select starts_at from public_test_private.bindings where binding_id=macvicar_fixture.binding_id),
 'expiresAt',(select expires_at from public_test_private.bindings where binding_id=macvicar_fixture.binding_id));
select set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);

create function pg_temp.denied(p_command text,p_state text default '42501') returns boolean language plpgsql as $$
begin execute p_command;return false;exception when others then return sqlstate=p_state;end $$;

-- Invoke actual general RPCs under their external roles. A transactional
-- capability fixture below enables the general stage, so denial is not a false
-- green caused by its usual disabled flag. No provider/release evidence follows.
create function pg_temp.macvicar_general_denied(p_target uuid) returns void language plpgsql as $$
declare actor text:=current_user;reader text;rows jsonb;
begin
 foreach reader in array array['anon','authenticated','service_role','public_catalog_gateway'] loop
  execute format('set local role %I',reader);
  if has_schema_privilege(current_user,'app_public','USAGE') and has_function_privilege(current_user,'app_public.catalog_list(text,text,text)','EXECUTE') then
   assert not exists(select 1 from app_public.catalog_list(null,null,null) where id=p_target),'legacy list never adds curated UUID';
   assert not exists(select 1 from app_public.catalog_details('the-market-at-macvicar') where id=p_target),'legacy details never add curated UUID';
  else
   assert pg_temp.denied('select * from app_public.catalog_list(null,null,null)'),'legacy list without role grant denied';
  end if;
  if has_schema_privilege(current_user,'app_public','USAGE') and has_function_privilege(current_user,'app_public.regional_catalog_list(text,text,text)','EXECUTE') then
   assert not exists(select 1 from app_public.regional_catalog_list(null,null,null) where id=p_target),'general regional list denies curated UUID';
   assert not exists(select 1 from app_public.regional_catalog_details('the-market-at-macvicar') where id=p_target),'general regional details deny curated UUID';
  else
   assert pg_temp.denied('select * from app_public.regional_catalog_details(''the-market-at-macvicar'')'),'regional details without role grant denied';
  end if;
  if has_schema_privilege(current_user,'app_public','USAGE') and has_function_privilege(current_user,'app_public.public_catalog_gateway_request(text,text,jsonb)','EXECUTE') then
   rows:=app_public.public_catalog_gateway_request(repeat('9',64),'details','{"p_slug":"the-market-at-macvicar"}');
   assert position(p_target::text in rows::text)=0,'general gateway details cannot bypass exact admission';
   rows:=app_public.public_catalog_gateway_request(repeat('9',64),'list','{}');
   assert position(p_target::text in rows::text)=0,'general gateway list cannot bypass exact admission';
  else
   assert pg_temp.denied('select app_public.public_catalog_gateway_request('''||repeat('9',64)||''',''list'',''{}'')'),'general gateway without role grant denied';
  end if;
  execute format('set local role %I',actor);
 end loop;
 foreach reader in array array['catalog_reader','release_automation'] loop
  execute format('set local role %I',reader);
  assert not exists(select 1 from app_public.stores where id=p_target),'general RPC owner cannot read curated UUID';
  assert exists(select 1 from app_public.stores where synthetic and publication_state='active'),'general reader preserves unrelated fictional rows';
  execute format('set local role %I',actor);
 end loop;
end $$;

select lives_ok($test$do $proof$declare rows jsonb;begin
 rows:=app_public.public_test_catalog_gateway_request(repeat('3',64),'list','{}');
 assert jsonb_array_length(rows)=12,'no real admission retains exactly twelve fictional rows';
 assert app_public.public_test_catalog_gateway_request(repeat('4',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'unadmitted real details denied';
 assert not has_function_privilege('service_role','public_test_private.prepare_macvicar(jsonb,text,jsonb,bigint)','EXECUTE'),'service cannot self-admit';
 assert not has_function_privilege('authenticated','app_public.public_test_catalog_gateway_request(text,text,jsonb)','EXECUTE'),'browser cannot bypass gateway';
 assert not has_table_privilege('macvicar_catalog_reader','auth.users','SELECT'),'real reader has no Auth read';
 assert not has_column_privilege('macvicar_catalog_reader','public_test_private.macvicar_admissions','approvals','SELECT'),'approval identities remain protected';
 assert not has_table_privilege('synthetic_catalog_automation','public_test_private.macvicar_admissions','SELECT'),'synthetic automation has no real admission rights';
end $proof$;$test$,'no admission and minimal-role boundaries');

select lives_ok($test$do $proof$declare f record;v bigint;begin
 select * into f from macvicar_fixture;select version into v from public_test_private.runtime where id=1;
 assert public_test_private.prepare_macvicar_store()=f.store_id,'normal admission reuses exact legitimate UUID';
 insert into app_public.stores(synthetic,audience,publication_state,slug,name,town,state_code,address,area_id,summary,description)
 select false,'public','draft','potential-macvicar-duplicate','The Market at Macvicar','Topeka','KS','2307 SW 10th Avenue',area_id,'Isolated ambiguity fixture','Isolated ambiguity fixture' from app_public.stores where id=f.store_id;
 assert pg_temp.denied('select public_test_private.prepare_macvicar_store()'),'other-slug potential identity duplicate refused';
 assert app_public.public_test_catalog_gateway_request(repeat('4',64),'details','{"p_slug":"potential-macvicar-duplicate"}')='[]'::jsonb,'unadmitted other real slug denied';
 delete from app_public.stores where slug='potential-macvicar-duplicate';
 assert pg_temp.denied(format('select public_test_private.prepare_macvicar(%L::jsonb,%L,%L::jsonb,%s)',f.spec,f.manifest,f.approvals,v+1)),'stale runtime rejected';
 assert pg_temp.denied(format('select public_test_private.prepare_macvicar(%L::jsonb,%L,%L::jsonb,%s)',jsonb_set(f.spec,'{manifestSha256}',to_jsonb(repeat('0',64))),f.manifest,f.approvals,v)),'wrong manifest rejected';
 assert pg_temp.denied(format('select public_test_private.prepare_macvicar(%L::jsonb,%L,%L::jsonb,%s)',f.spec,f.manifest,'[]',v)),'missing per-asset approvals rejected';
 assert pg_temp.denied(format('select public_test_private.prepare_macvicar(%L::jsonb,%L,%L::jsonb,%s)',jsonb_set(f.spec,'{storeProfileDigest}',to_jsonb(repeat('0',64))),f.manifest,f.approvals,v)),'wrong public projection rejected';
 assert pg_temp.denied(format('select public_test_private.prepare_macvicar(%L::jsonb,%L,%L::jsonb,%s)',jsonb_set(f.spec,'{storeId}',to_jsonb('52200000-0000-4000-8000-000000000099'::text)),f.manifest,f.approvals,v)),'wrong real UUID rejected';
end $proof$;$test$,'protected preparation rejects stale or unreviewed inputs');

update macvicar_fixture set admission_id=public_test_private.prepare_macvicar(spec,manifest,approvals,(select version from public_test_private.runtime where id=1));
select lives_ok($test$do $proof$begin
 assert jsonb_array_length(app_public.public_test_catalog_gateway_request(repeat('5',64),'list','{}'))=12,'prepared admission is invisible';
 assert pg_temp.denied(format('select public_test_private.activate_macvicar(%L,2)',(select admission_id from macvicar_fixture))),'wrong admission version denied';
end $proof$;$test$,'prepared record remains invisible until activation');
select public_test_private.activate_macvicar(admission_id,1) from macvicar_fixture;
grant select on macvicar_fixture to public_catalog_gateway;
set local role public_catalog_gateway;
select lives_ok($test$do $proof$declare rows jsonb;fictional jsonb;begin
 rows:=app_public.public_test_catalog_gateway_request(repeat('6',64),'list','{}');
 assert jsonb_array_length(rows)=13,'exact one admitted real row added';
 assert rows->0->>'id'=(select store_id::text from macvicar_fixture),'real UUID first';
 fictional:=rows-0;
 assert (select count(distinct x->>'id') from jsonb_array_elements(rows)x)=13,'no duplicate UUID';
 assert (select array_agg(x->>'name' order by ord) from jsonb_array_elements(fictional) with ordinality a(x,ord))=(select array_agg(x->>'name' order by x->>'name',x->>'id') from jsonb_array_elements(fictional)x),'fictional relative order retained';
end $proof$;$test$,'existing Edge role sees real first and stable fictional order');

select lives_ok($test$do $proof$declare rows jsonb;begin
 rows:=app_public.public_test_catalog_gateway_request(repeat('7',64),'list','{"p_q":"Macvicar"}');
 assert jsonb_array_length(rows)=1 and rows->0->>'slug'='the-market-at-macvicar','matching query returns exact real row';
 assert app_public.public_test_catalog_gateway_request(repeat('8',64),'list','{"p_q":"no-such-store-522"}')='[]'::jsonb,'excluding query does not force first client';
 assert app_public.public_test_catalog_gateway_request(repeat('9',64),'list','{"p_area":"not-topeka"}')='[]'::jsonb,'excluding area stays empty';
 assert app_public.public_test_catalog_gateway_request(repeat('0',64),'list','{"p_category":"not-a-category"}')='[]'::jsonb,'excluding category stays empty';
end $proof$;$test$,'server filters precede placement');

select lives_ok($test$do $proof$declare row jsonb;begin
 row:=app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')->0;
 assert row->>'id'=(select store_id::text from macvicar_fixture),'details stable UUID';
 assert jsonb_array_length(row->'media')=51,'one cover and fifty galleries';
 assert row->'media'->0->>'kind'='cover' and row->'media'->50->>'kind'='gallery','exact selected order';
 assert row->'media'->1->>'caption'='Fixture caption 1','caption preserved';
 assert row->>'email'='themarketatmacvicar2307@gmail.com','approved business contact preserved';
 assert row->'accessibility'->>'status'='unverified','no invented accessibility verification';
 assert row->'hoursExceptions'='[]'::jsonb and row->'updates'='[]'::jsonb,'no invented events';
 assert row->'socialLinks'->0->>'href'='https://www.facebook.com/TheMarketatMacvicar2307/','exact approved social destination';
 assert position('October 21, 2017' in row->'provenance'->>'note')>0,'historical cover context preserved';
 assert not(row ?| array['ownerAccount','planEntitlement','approvals','operator_ref','decision_ref','auth_user_id']),'private fields excluded';
end $proof$;$test$,'real Details/Photos projection preserves approved content only');

select lives_ok($test$do $proof$begin
 assert pg_temp.denied('select * from public_test_private.macvicar_admissions'),'gateway cannot inspect private admission';
 assert pg_temp.denied('select * from auth.users'),'gateway cannot inspect Auth';
 assert pg_temp.denied('select public_test_private.prepare_macvicar_store()'),'gateway cannot provision stores';
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('b',64)||''',''list'',''{"unexpected":true}'')','22023'),'argument allowlist retained';
end $proof$;$test$,'public gateway has only composed catalog capability');
reset role;
select set_config('request.headers','{"origin":"https://evil.example"}',true);
select lives_ok($test$do $proof$begin
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('c',64)||''',''list'',''{}'')'),'spoofed origin denied';
end $proof$;$test$,'spoofed origin denied');
select set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);

select lives_ok($test$do $proof$declare target uuid;admission uuid;activated timestamptz;release uuid:=extensions.gen_random_uuid();begin
 select store_id into target from macvicar_fixture;
 assert not shopper_private.store_is_shopper_visible(target),'existing users cannot save or trip real scoped record';
 assert (select count(*) from public_test_private.bindings where binding_id=(select binding_id from macvicar_fixture) and cardinality(store_ids)=12)=1,'fictional admission cardinality unchanged';
 assert not exists(select 1 from app_private.role_grants where store_id=target),'no real Owner or Representative role';
 assert not exists(select 1 from partner_private.store_partner_grants where store_id=target),'no partner grant activated';
 -- Enable only isolated SQL fixture capability rows, never provider state.
 insert into release_private.regional_releases(release_id,region_key,artifact_digest,catalog_digest,prerequisite_receipt_digest,state)
 values(release,'topeka-ks','sha256:'||repeat('7',64),'sha256:'||repeat('8',64),'sha256:'||repeat('9',64),'active');
 insert into release_private.release_capabilities(release_id,public_catalog,public_claims,public_reviews,public_registration,product_promotion)
 values(release,true,true,true,true,true);
 assert release_private.public_capability_enabled('catalog'),'general stage truly enabled for denial proof';
 select admission_id,activated_at into admission,activated from public_test_private.macvicar_admissions where admission_id=(select admission_id from macvicar_fixture);
 perform pg_temp.macvicar_general_denied(target);
 update public_test_private.macvicar_admissions set state='prepared',activated_at=null where admission_id=admission;
 perform pg_temp.macvicar_general_denied(target);
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'prepared narrow route denied even with verified facts';
 update public_test_private.macvicar_admissions set state='revoked',revoked_at=statement_timestamp() where admission_id=admission;
 perform pg_temp.macvicar_general_denied(target);
 update public_test_private.macvicar_admissions set state='active',activated_at=activated,revoked_at=null where admission_id=admission;
 perform set_config('request.headers','{"origin":"https://evil.example"}',true);
 perform pg_temp.macvicar_general_denied(target);
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('a',64)||''',''details'',''{"p_slug":"the-market-at-macvicar"}'')'),'wrong origin narrow route denied';
 perform set_config('request.headers','{"origin":"https://antique-trail.vercel.app"}',true);
 update public_test_private.macvicar_admissions set source_sha=repeat('0',40) where admission_id=admission;
 perform pg_temp.macvicar_general_denied(target);
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'wrong binding narrow route denied';
 update public_test_private.macvicar_admissions set source_sha=repeat('a',40) where admission_id=admission;
 delete from release_private.release_capabilities where release_id=release;
 delete from release_private.regional_releases where release_id=release;
end $proof$;$test$,'real listing never grants private actions or Owner benefits');

select lives_ok($test$do $proof$declare target uuid;row jsonb;fact app_public.store_fact_verifications%rowtype;reviewed_at timestamptz;original_zone text;original_pin bytea;begin
 select store_id into target from macvicar_fixture;
 execute 'set local role public_catalog_gateway';
 row:=app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')->0;
 execute 'reset role';
 assert row->>'freshness_state'=(select freshness_state from app_public.catalog_freshness(target,statement_timestamp())),'public freshness derives from four recorded fact groups';
 assert (select count(*)=4 from app_public.store_fact_verifications where store_id=target and verification_group in ('identity_location','contact','hours','categories_attributes')),'four reviewed public fact groups recorded';
 select prepared_at into reviewed_at from public_test_private.macvicar_admissions where admission_id=(select admission_id from macvicar_fixture);
 assert (row->>'oldest_verified_at')::timestamptz=reviewed_at,'freshness uses actual protected review time, not dated source provenance';
 assert row->'provenance'->>'updatedAt'='2026-10-03','dated public source remains separate';
 assert (select bool_and(verifier_kind='administrator_curated_source' and verified_at=reviewed_at and position('2026-10-03' in provenance_label)>0) from app_public.store_fact_verifications where store_id=target),'truthful curated review kind, source date and protected review time';
 original_zone:=current_setting('TimeZone');
 perform set_config('TimeZone','Pacific/Honolulu',true);
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')->0->>'id'=target::text,'fact digest does not depend on session timezone';
 execute 'reset role';
 perform set_config('TimeZone',original_zone,true);
 perform public_test_private.prepare_macvicar_store();
 assert (select oldest_verified_at=reviewed_at from app_public.catalog_freshness(target,statement_timestamp())),'reusing identity does not reset verification clock';
 assert (select freshness_state='current' from app_public.catalog_freshness(target,reviewed_at+interval '180 days')),'day 180 remains current';
 assert (select freshness_state='overdue' from app_public.catalog_freshness(target,reviewed_at+interval '181 days')),'day 181 becomes overdue';
 assert (select freshness_state='overdue' from app_public.catalog_freshness(target,reviewed_at+interval '365 days')),'day 365 remains overdue';
 assert (select freshness_state='stale' from app_public.catalog_freshness(target,reviewed_at+interval '366 days')),'after day 365 becomes stale';
 assert not has_column_privilege('macvicar_catalog_reader','app_public.store_fact_verifications','provenance_label','SELECT'),'protected review receipt provenance is not granted to narrow public reader';
 assert has_column_privilege('identity_service','app_public.store_fact_verifications','provenance_label','UPDATE'),'negative tests exercise preexisting generic writer privilege';
 execute 'set local role identity_service';
 assert pg_temp.denied(format('update app_public.store_fact_verifications set provenance_label=''forged review'' where store_id=%L',target)),'generic writer cannot mutate curated review';
 assert pg_temp.denied(format('update app_public.store_fact_verifications set verifier_kind=''synthetic_fixture'' where store_id=%L',target)),'generic writer cannot downgrade protected verification kind';
 assert pg_temp.denied(format('delete from app_public.store_fact_verifications where store_id=%L',target)),'generic writer cannot delete curated review';
 execute 'set local role postgres';
 assert pg_temp.denied('update app_public.store_fact_verifications set verifier_kind=''administrator_curated_source'' where store_id=(select id from app_public.stores where synthetic order by id limit 1)'),'even operator cannot mint curated kind for another store';
 select * into fact from app_public.store_fact_verifications where store_id=target and verification_group='hours';
 delete from app_public.store_fact_verifications where store_id=target and verification_group='hours';
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'missing required group removes listing';
 execute 'set local role postgres';
 insert into app_public.store_fact_verifications values(fact.*);
 update app_public.store_fact_verifications set verified_at=verified_at+interval '1 second' where store_id=target and verification_group='hours';
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'unreviewed clock change breaks profile pin';
 execute 'set local role postgres';
 update app_public.store_fact_verifications set verified_at=fact.verified_at,provenance_label='Unreviewed source change' where store_id=target and verification_group='hours';
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'unreviewed provenance breaks profile pin';
 execute 'set local role postgres';
 update app_public.store_fact_verifications set provenance_label=fact.provenance_label where store_id=target and verification_group='hours';
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')->0->>'freshness_state'='current','restored pinned facts restore eligibility';
 execute 'set local role postgres';
 -- Simulate aged reviewed facts with a matching isolated receipt pin; this
 -- distinguishes normal freshness exclusion from the separate tamper denial.
 select public_profile_digest into original_pin from public_test_private.macvicar_admissions where admission_id=(select admission_id from macvicar_fixture);
 update app_public.store_fact_verifications set verified_at=statement_timestamp()-interval '366 days' where store_id=target;
 update public_test_private.macvicar_admissions set public_profile_digest=public_test_private.macvicar_profile_digest(target) where admission_id=(select admission_id from macvicar_fixture);
 assert public_test_private.macvicar_active(target),'aged fixture still has matching admission pin';
 execute 'set local role public_catalog_gateway';
 assert app_public.public_test_catalog_gateway_request(repeat('a',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'stale facts exclude Details despite valid admission pin';
 assert not exists(select 1 from jsonb_array_elements(app_public.public_test_catalog_gateway_request(repeat('a',64),'list','{}')) x where x->>'id'=target::text),'stale facts exclude Browse';
 execute 'set local role postgres';
 update app_public.store_fact_verifications set verified_at=reviewed_at where store_id=target;
 update public_test_private.macvicar_admissions set public_profile_digest=original_pin where admission_id=(select admission_id from macvicar_fixture);
 assert public_test_private.macvicar_active(target),'restored original review clock/pin retained';
end $proof$;$test$,'curated freshness derives from protected actual review without invented verification');
reset role;

select lives_ok($test$do $proof$declare original text;v_manifest jsonb;area_label text;begin
 select description into original from app_public.stores where id=(select store_id from macvicar_fixture);
 update app_public.stores set description='unreviewed change' where id=(select store_id from macvicar_fixture);
 assert app_public.public_test_catalog_gateway_request(repeat('d',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'changed profile fails closed';
 update app_public.stores set description=original where id=(select store_id from macvicar_fixture);
 select label into area_label from app_public.catalog_areas where id=(select area_id from app_public.stores where id=(select store_id from macvicar_fixture));
 update app_public.catalog_areas set label='unreviewed area' where id=(select area_id from app_public.stores where id=(select store_id from macvicar_fixture));
 assert app_public.public_test_catalog_gateway_request(repeat('d',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'changed public area metadata fails closed';
 update app_public.catalog_areas set label=area_label where id=(select area_id from app_public.stores where id=(select store_id from macvicar_fixture));
 select a.manifest into v_manifest from public_test_private.macvicar_admissions a where admission_id=(select admission_id from macvicar_fixture);
 update public_test_private.macvicar_admissions set manifest=jsonb_set(manifest,'{assets,1,caption}','"unreviewed caption"') where admission_id=(select admission_id from macvicar_fixture);
 assert app_public.public_test_catalog_gateway_request(repeat('d',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'changed stored manifest fails closed';
 update public_test_private.macvicar_admissions a set manifest=v_manifest where admission_id=(select admission_id from macvicar_fixture);
 update public_test_private.macvicar_admissions set expires_at=statement_timestamp()-interval '1 second',starts_at=statement_timestamp()-interval '1 hour' where admission_id=(select admission_id from macvicar_fixture);
 assert app_public.public_test_catalog_gateway_request(repeat('e',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'expired real admission denied';
 update public_test_private.macvicar_admissions set starts_at=(select starts_at from public_test_private.bindings where binding_id=(select binding_id from macvicar_fixture)),expires_at=(select expires_at from public_test_private.bindings where binding_id=(select binding_id from macvicar_fixture)) where admission_id=(select admission_id from macvicar_fixture);
end $proof$;$test$,'mutated profile and expired real admission fail closed');

select lives_ok($test$do $proof$declare n integer;begin
 for n in 1..60 loop perform app_public.public_test_catalog_gateway_request(repeat('2',64),'list','{}');end loop;
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('2',64)||''',''list'',''{}'')','P0001'),'61st list rate denied';
 for n in 1..120 loop perform app_public.public_test_catalog_gateway_request(repeat('1',64),'details','{"p_slug":"the-market-at-macvicar"}');end loop;
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('1',64)||''',''details'',''{"p_slug":"the-market-at-macvicar"}'')','P0001'),'121st detail rate denied';
end $proof$;$test$,'existing list/details rate limits apply to real projection');

select lives_ok($test$do $proof$declare a uuid;asset jsonb;hash text;metadata text;row jsonb;begin
 select admission_id into a from macvicar_fixture;
 select manifest::jsonb->'assets'->1 into asset from macvicar_fixture;
 hash:=asset->>'sha256';metadata:=encode(extensions.digest(convert_to(asset::text,'UTF8'),'sha256'),'hex');
 assert pg_temp.denied(format('select public_test_private.withdraw_macvicar_asset(%L,%L,%L,2)',a,repeat('0',64),metadata)),'unselected asset cannot be withdrawn';
 assert pg_temp.denied(format('select public_test_private.withdraw_macvicar_asset(%L,%L,%L,2)',a,hash,repeat('0',64))),'wrong metadata identity denied';
 assert pg_temp.denied(format('select public_test_private.withdraw_macvicar_asset(%L,%L,%L,1)',a,hash,metadata)),'stale withdrawal denied';
 assert public_test_private.withdraw_macvicar_asset(a,hash,metadata,2)=3,'protected monotonic withdrawal advances version';
 row:=app_public.public_test_catalog_gateway_request(repeat('5',64),'details','{"p_slug":"the-market-at-macvicar"}')->0;
 assert row->>'name'='The Market at Macvicar' and jsonb_array_length(row->'media')=50,'one withdrawal preserves real text and unrelated fifty images';
 assert not exists(select 1 from jsonb_array_elements(row->'media') x where x->>'src'=asset->>'path'),'withdrawn catalog URL absent';
 assert pg_temp.denied(format('select public_test_private.withdraw_macvicar_asset(%L,%L,%L,3)',a,hash,metadata)),'withdrawn asset cannot be reactivated through withdrawal';
end $proof$;$test$,'individual approved hash/metadata withdrawal retains valid listing');

select public_test_private.revoke_macvicar(admission_id,3) from macvicar_fixture;
select lives_ok($test$do $proof$begin
 assert app_public.public_test_catalog_gateway_request(repeat('f',64),'details','{"p_slug":"the-market-at-macvicar"}')='[]'::jsonb,'real stop removes Details and photo references';
 assert jsonb_array_length(app_public.public_test_catalog_gateway_request(repeat('f',64),'list','{}'))=12,'real stop retains unrelated synthetic catalog';
 assert pg_temp.denied(format('select public_test_private.activate_macvicar(%L,4)',(select admission_id from macvicar_fixture))),'revoked admission cannot reactivate';
end $proof$;$test$,'scoped revocation stops real record without disturbing fictional records');
select public_test_private.revoke(binding_id,(select version from public_test_private.runtime where id=1)) from macvicar_fixture;
select lives_ok($test$do $proof$begin
 assert pg_temp.denied('select app_public.public_test_catalog_gateway_request('''||repeat('f',64)||''',''list'',''{}'')'),'full binding stop denies catalog';
end $proof$;$test$,'binding stop remains authoritative');

select * from finish();
rollback;
