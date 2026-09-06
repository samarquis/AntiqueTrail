-- Only run by verify-paid-activation-concurrency.mjs on its disposable database.
begin;
\ir paid_servicing.inc
reset role;
create schema issue180_concurrency;
create function issue180_concurrency.authorize(action text,v bigint,aid uuid,fid uuid) returns uuid language plpgsql as $$ declare rid uuid:=extensions.gen_random_uuid(); begin
  insert into partner_private.photo_tier_transition_authorizations(receipt_id,action,expected_sales_version,reason,expires_at,activation_receipt_id,finality_id)
    values(rid,action,v,'synthetic_race',statement_timestamp()+interval '10 minutes',case when action='resume' then aid end,fid);
  insert into partner_private.photo_tier_transition_signatures(receipt_id,responsibility,signer_id,payload_digest,provider_verification_id)
    select rid,r,extensions.gen_random_uuid(),partner_private.billing_transition_payload(rid),extensions.gen_random_uuid()::text from unnest(array['Operations','ProductOwner']) r;
  return rid;
end $$;
create function issue180_concurrency.finality(v bigint) returns uuid language plpgsql as $$
declare fid uuid:=extensions.gen_random_uuid(); inv jsonb; e jsonb; begin
  inv:=partner_private.billing_transition_inventory();
  e:=jsonb_build_object('history_complete',true,'balance_settled',true,'provider_account_digest',repeat('1',64),'finality_digest',repeat('2',64),
    'horizon_policy_version','synthetic-v1','historical_charge_digest',inv->'photo_tier_charge_refunds'->>'digest',
    'historical_charge_count',inv->'photo_tier_charge_refunds'->'count',
    'obligations',jsonb_build_object('open_checkout',0,'live_subscription',0,'refund',0,'dispute',0,'invoice',0,'payment',0,'webhook',0,'outbox',0,'reconciliation',0,'unknown',0),
    'horizon_ends_at',jsonb_build_object('dispute',now()-interval '1 day','reversal',now()-interval '1 day','adjustment',now()-interval '1 day','settlement',now()-interval '1 day'));
  insert into partner_private.photo_tier_provider_finality values(fid,v,extensions.digest(convert_to(inv::text,'utf8'),'sha256'),statement_timestamp(),e,statement_timestamp());
  return fid;
end $$;
commit;
