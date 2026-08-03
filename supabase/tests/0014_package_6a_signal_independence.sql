begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_column('partner_private','claim_authority_signals','authority_object_hmac','verified signals bind a normalized authority object');
select has_column('partner_private','claim_authority_signals','verification_event_id','verified signals bind a verification event');
select ok(exists(select 1 from pg_constraint where conname='claim_signal_independent_verification_shape'),'verified signals require object and event bindings');
select ok(exists(select 1 from pg_indexes where schemaname='partner_private' and indexname='claim_verified_authority_object_unique'),'one authority object cannot count twice for a claim');
select ok(exists(select 1 from pg_indexes where schemaname='partner_private' and indexname='claim_verified_event_unique'),'one verification event cannot count twice for a claim');
select ok(exists(select 1 from pg_trigger where tgname='listing_claim_signal_independence_guard' and not tgisinternal),'claim approval enforces independent channels, objects, and events');

select * from finish();
rollback;
