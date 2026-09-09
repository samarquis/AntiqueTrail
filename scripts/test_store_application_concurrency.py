"""Run against a disposable, migrated local database; never a hosted database.
Usage: python scripts/test_store_application_concurrency.py CONTAINER DATABASE
Requires the repository's local antique_trail_test_runner fixture role.
"""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys

container, database = sys.argv[1:]
if not database.startswith('issue171_'):
    raise SystemExit('Use a disposable issue171_ database')
base = ['docker', 'exec', '-i', '-e', 'PGPASSWORD=local-pgtap-only', '-e', 'PGOPTIONS=-c search_path=public,extensions', container,
        'psql', '-h', '127.0.0.1', '-w', '-U', 'antique_trail_test_runner', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At']
def sql(text):
    result = subprocess.run(base, input=text, text=True, capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout
source = Path('supabase/tests/0085_issue_171_store_applications.sql').read_text()
actor = source[source.index('create function pg_temp.actor'):source.index("select pg_temp.actor('17100000")]
setup = source[:source.index('reset role;\ncreate function pg_temp.fail_application_audit')]
sql(setup + '\nreset role; create table public.issue171_race_payload as select * from approval171; grant select on public.issue171_race_payload to identity_service; create table public.issue171_race_draft as select d from state171; grant select on public.issue171_race_draft to identity_service; commit;')
def race(operation, user, namespace):
    prefix = 'begin; ' + actor + f"select pg_temp.actor('{user}'); set local role identity_service; "
    call = prefix + f"select {namespace}('{operation}',payload,true) from public.issue171_race_payload; commit;"
    # Hold the shared applicant root while both requests enter the same pre-lock state.
    owner = '17100000-0000-4000-8000-000000000001' if operation == 'approve' else user
    lock = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    lock.stdin.write(f"begin; select applicant_id from partner_private.store_owner_intake_roots where applicant_id='{owner}' for update;\n")
    lock.stdin.flush()
    while lock.stdout.readline().strip() != owner:
        if lock.poll() is not None: raise RuntimeError('Root lock failed')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        jobs = [executor.submit(sql, call) for _ in range(2)]
        lock.stdin.write('select pg_sleep(1); commit;\n')
        lock.stdin.close()
        results = [job.result() for job in jobs]
    lock.wait(timeout=10)
    snapshots = [next(json.loads(line) for line in result.splitlines() if line.startswith('{')) for result in results]
    if snapshots[0] != snapshots[1]: raise AssertionError('Concurrent retries differ')
    print(operation + ': simultaneous exact retries returned the same outcome')
race('approve', '17100000-0000-4000-8000-000000000002', 'partner_private.store_application_admin_command')
start = source.index("insert into auth.users(id,email,email_confirmed_at) values ('17100000-0000-4000-8000-000000000003'")
end = source.index("select throws_ok($q$select partner_private.store_application_command('convert'")
sql('begin; select no_plan(); create temp table state171 as select d,null::jsonb s,null::jsonb a from public.issue171_race_draft; grant all on state171 to identity_service; ' + actor + source[start:end] + '\nreset role; update public.issue171_race_payload set payload=(select payload from conversion171); commit;')
race('convert', '17100000-0000-4000-8000-000000000003', 'partner_private.store_application_command')
print(sql("select count(*) from app_public.stores where name='Synthetic New Antiques 171';"))
# Competing claim and add starts must share the same applicant serialization root.
new_user = '17100000-0000-4000-8000-000000000004'
identity_setup = source[start:source.index('update state171 set s=', start)].replace('000000000003', '000000000004').replace('duplicate171', 'race171')
sql('begin; ' + actor + identity_setup + " create temp table state171 as select d from public.issue171_race_draft; reset role; update public.issue171_race_payload set payload=(select jsonb_build_object('draft',d,'searchId',partner_private.store_application_command('search',jsonb_build_object('draft',d),true)->>'searchId') from state171); insert into partner_private.store_owner_intake_roots(applicant_id) values('" + new_user + "'); commit;")
prefix = 'begin; ' + actor + f"select pg_temp.actor('{new_user}'); set local role identity_service; "
commands = [prefix + "select partner_private.store_application_command('start',payload,true) from public.issue171_race_payload; commit;",
            prefix + "select app_public.partner_start_claim((select id from app_public.stores where name='Synthetic New Antiques 171'),'Owner','Synthetic authority','claim-vs-add171'); commit;"]
lock = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
lock.stdin.write(f"begin; select applicant_id from partner_private.store_owner_intake_roots where applicant_id='{new_user}' for update;\n")
lock.stdin.flush()
while lock.stdout.readline().strip() != new_user:
    if lock.poll() is not None: raise RuntimeError('Root lock failed')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    jobs = [executor.submit(subprocess.run, base, input=command, text=True, capture_output=True) for command in commands]
    lock.stdin.write('select pg_sleep(1); commit;\n'); lock.stdin.close()
    outcomes = [job.result() for job in jobs]
lock.wait(timeout=10)
assert sum(result.returncode == 0 for result in outcomes) == 1, [(r.returncode, r.stderr) for r in outcomes]
assert sql(f"select (select count(*) from partner_private.store_add_applications where applicant_id='{new_user}')+(select count(*) from partner_private.listing_claims where claimant_id='{new_user}');").strip() == '1'
print('claim versus add: exactly one intake succeeded')
