-- #322 owns only these run-provisioned synthetic identifiers. The wrapper replaces
-- --REPRESENTATIVE-- and --STORE-- before executing this fixture on its own database.
-- It deliberately grants one Representative exactly one synthetic store.
insert into app_private.role_grants(subject_user_id,role,store_id,state)
values ('--REPRESENTATIVE--','representative','--STORE--','active');
