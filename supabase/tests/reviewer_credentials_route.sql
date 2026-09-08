begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('review_private','reviewer_verifier_allow_credentials','verifier-owned raw IDs are isolated for option projection');
select has_column('review_private','reviewer_verifier_allow_credentials','allow_credential_id','projection stores the exact browser credential ID');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='review_private.reviewer_verifier_allow_credentials'::regclass),'projection table forces RLS');
select ok(not exists(select 1 from information_schema.role_table_grants where table_schema='review_private' and table_name='reviewer_verifier_allow_credentials' and grantee in ('anon','authenticated','service_role')),'projection is not directly browser-readable');
select ok(has_function_privilege('review_credential_verifier','review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)','EXECUTE'),'only the verifier can submit the exact raw ID');
select ok(not has_function_privilege('authenticated','review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)','EXECUTE'),'authenticated cannot submit verifier results');
select has_function('app_public','reviews_complete_reviewer_registration',array['uuid','bytea','bytea','text','text','text','text','boolean','bigint'],'forward registration boundary accepts verifier-derived raw ID');
select ok(position('allowcredentials' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))>0,'challenge RPC projects allowCredentials');
select ok(position('provider_credential_id' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))>0 and position('allow_credential_id' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))>0,'projection joins opaque provider IDs to verifier-owned raw IDs');
select ok(position('accepted.version=v.verifier_version' in replace(lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)),' ',''))>0,'only the accepted verifier configuration can project IDs');
select ok(position('registrationcompletedcount' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))>0,'setup progress is returned for resumable interruption');
select ok(position('registration_target_count' in lower(pg_get_functiondef('app_public.reviews_request_reviewer_capability_challenge(text,text,uuid)'::regprocedure)))>0,'setup target remains exactly two');
select ok(exists(select 1 from pg_trigger where tgrelid='review_private.reviewer_credentials'::regclass and tgname='reviewer_credentials_scrub_verifier_mapping'),'retirement removes raw verifier mapping immediately');
select ok(position('p_allow_credential_id' in lower(pg_get_functiondef('review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)'::regprocedure)))>0,'registration persists only verifier-supplied option material');
select ok(position('p_discoverable' in lower(pg_get_functiondef('review_private.complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)'::regprocedure)))>0,'registration remains non-discoverable');
select ok(position('p_allow_credential_id' in lower(pg_get_functiondef('app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)'::regprocedure)))>0,'Edge completion forwards the exact option ID');
select ok(position('p_allow_credential_id' in lower(pg_get_functiondef('app_public.reviews_complete_reviewer_registration(uuid,bytea,bytea,text,text,text,text,boolean,bigint)'::regprocedure)))>0,'PostgREST boundary does not accept a browser-generated verifier claim');

grant review_automation to postgres;
alter table review_private.reviewer_credentials disable trigger reviewer_registration_consume_capability;
do $$
declare identity_id uuid:='72000000-0000-4000-8000-000000000001'; cap_id uuid:='72000000-0000-4000-8000-000000000002'; c1 uuid:='72000000-0000-4000-8000-000000000003'; c2 uuid:='72000000-0000-4000-8000-000000000004';
begin
  perform review_private.configure_reviewer_verifier('reviewer.test','https://localhost','provider-key',decode(repeat('aa',32),'hex'),1);
  insert into auth.users(id) values('72000000-0000-4000-8000-000000000005');
  insert into review_private.reviewer_identities(reviewer_identity_id,state,qualification_receipt_digest,active_credential_count)
    values(identity_id,'pending',decode(repeat('bb',32),'hex'),2);
  update review_private.reviewer_identities set user_id='72000000-0000-4000-8000-000000000005',state='active'
    where review_private.reviewer_identities.reviewer_identity_id=identity_id;
  insert into review_private.reviewer_management_capabilities(capability_id,reviewer_identity_id,scope,token_hash,delivery_verification_id,issuance_idempotency_key,expires_at)
    values(cap_id,identity_id,'management',extensions.digest(convert_to(repeat('T',43),'utf8'),'sha256'),'route-test','72000000-0000-4000-8000-000000000005',statement_timestamp()+interval '10 minutes');
  insert into review_private.reviewer_credentials(credential_record_id,reviewer_identity_id,credential_id_digest,public_key_digest,provider_credential_id,provider_verification_id,discoverable,sign_count)
    values(c1,identity_id,decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),'opaque-provider-one','verification-one',false,1),
          (c2,identity_id,decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),'opaque-provider-two','verification-two',false,1);
  insert into review_private.reviewer_verifier_allow_credentials(provider_credential_id,allow_credential_id,verifier_version)
    values('opaque-provider-one','raw-id-one',2),('opaque-provider-two','raw-id-two',2);
end $$;
alter table review_private.reviewer_credentials enable trigger reviewer_registration_consume_capability;

select lives_ok($$select app_public.reviews_request_reviewer_capability_challenge(repeat('T',43),'assertion','72000000-0000-4000-8000-000000000006')$$,'accepted management capability receives an assertion challenge');
select is((app_public.reviews_request_reviewer_capability_challenge(repeat('T',43),'assertion','72000000-0000-4000-8000-000000000006')->'allowCredentials'->0->>'id'),'raw-id-one','first exact raw credential ID is projected');
select is((app_public.reviews_request_reviewer_capability_challenge(repeat('T',43),'assertion','72000000-0000-4000-8000-000000000006')->'allowCredentials'->1->>'id'),'raw-id-two','second exact raw credential ID is projected');
select ok(position('opaque-provider' in (app_public.reviews_request_reviewer_capability_challenge(repeat('T',43),'assertion','72000000-0000-4000-8000-000000000006'))::text)=0,'opaque provider IDs are never projected to the browser');
select * from finish();
rollback;
