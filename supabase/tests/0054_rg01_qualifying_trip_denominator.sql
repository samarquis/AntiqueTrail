begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_function('rg01_private','freeze_run_derived_core',array['uuid'],'derived freeze core exists');
select ok(
  position(
    'count(*)intofirst_count,second_count,trip_countfromq;'
    in regexp_replace(lower(pg_get_functiondef('rg01_private.freeze_run_derived_core(uuid)'::regprocedure)),'\s','','g')
  )>0,
  'all qualifying trips, including third and later trips, feed the support denominator'
);
select ok(
  position(
    'count(*)intofirst_count,second_count,trip_countfromqwherern<=2;'
    in regexp_replace(lower(pg_get_functiondef('rg01_private.freeze_run_derived_core(uuid)'::regprocedure)),'\s','','g')
  )=0,
  'the obsolete two-trip denominator cap is absent'
);
select ok(
  position('where rn<=2 group by subject_id' in lower(pg_get_functiondef('rg01_private.freeze_run_derived_core(uuid)'::regprocedure)))>0,
  'first and second shopper flags remain explicitly limited to two trips'
);
select ok(
  not has_function_privilege('rg01_calculation_service','rg01_private.freeze_run_derived_core(uuid)','EXECUTE'),
  'the derived core remains unreachable outside its automation-owned wrapper'
);

select * from finish();
rollback;
