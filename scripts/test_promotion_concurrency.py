"""Actual PostgreSQL races on an empty, disposable issue173_ database with migration applied.
Usage: python scripts/test_promotion_concurrency.py CONTAINER DATABASE
"""
import concurrent.futures
from pathlib import Path
import subprocess
import sys
import time

container, database = sys.argv[1:]
if not database.startswith('issue173_'):
    raise SystemExit('Use a disposable issue173_ database')
base = ['docker', 'exec', '-i', '-e', 'PGPASSWORD=local-pgtap-only', '-e',
        'PGOPTIONS=-c search_path=public,extensions', container, 'psql', '-h', '127.0.0.1',
        '-U', 'antique_trail_test_runner', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At']

def sql(command):
    return subprocess.run(base, input=command, text=True, capture_output=True, timeout=30)

def checked(command):
    result = sql(command)
    assert result.returncode == 0, result.stderr
    return result.stdout

source = Path('supabase/tests/0086_issue_173_promotion.sql').read_text(encoding='utf-8')
result = checked(source.replace('rollback;', 'commit;'))
assert 'not ok' not in result, result
actor = source[source.index('do $$ begin'):source.index('select ok(not (select distribution_enabled')]
checked("update partner_private.store_partner_grants set state='active',revoked_at=null where grant_id='76000000-0000-4000-8000-000000000007';")
prefix = 'begin; ' + actor + 'set local role authenticated; '
checked(prefix + "select app_public.promotion_channel_command('flyer','consent',6); commit;")

def held(command):
    process = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    process.stdin.write("begin; " + command + "; select 'HELD';\n")
    process.stdin.flush()
    while process.stdout.readline().strip() != 'HELD':
        if process.poll() is not None:
            raise AssertionError(process.stderr.read())
    return process

def release(process):
    process.stdin.write('commit;\n')
    process.stdin.close()
    process.wait(timeout=15)
    assert process.returncode == 0, process.stderr.read()

def wait_blocked(name):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if checked(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';").strip() == '1':
            return
        time.sleep(0.1)
    raise AssertionError(name + ' did not reach the expected lock')

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    withdrawal = held(actor + "set local role authenticated; select app_public.promotion_channel_command('flyer','withdraw',7)")
    reprint = executor.submit(sql, "set application_name='issue173_reprint'; " + prefix +
                              "select app_public.promotion_channel_command('flyer','reprint',7); commit;")
    wait_blocked('issue173_reprint')
    release(withdrawal)
    denied = reprint.result()
    assert denied.returncode != 0 and 'promotion_changed' in denied.stderr, denied
    print('withdrawal versus queued reprint: stale authorization denied')

    counter = held("select count from promotion_private.daily_counts where code=repeat('a',32) and day=(statement_timestamp() at time zone 'UTC')::date for update")
    count = executor.submit(sql, "set application_name='issue173_count'; set role anon; select app_public.promotion_count(repeat('a',32),'open');")
    wait_blocked('issue173_count')
    pause = executor.submit(sql, "set application_name='issue173_pause'; update promotion_private.capability set measurement_enabled=false;")
    wait_blocked('issue173_pause')
    release(counter)
    counted, paused = count.result(), pause.result()
    assert counted.returncode == paused.returncode == 0, (counted.stderr, paused.stderr)
    assert counted.stdout.strip().endswith('t'), counted.stdout
    assert checked("set role anon; select app_public.promotion_count(repeat('a',32),'open');").strip().endswith('f')
    print('measurement pause waits for prior count; later counts deny')
