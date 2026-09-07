/* global URL */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const container = process.argv[2] ?? process.env.OWNER_INTAKE_TEST_CONTAINER
if (!container || !/^supabase_db_pr253-owner-intake-[a-z0-9]{8}$/u.test(container))
  throw new Error(
    'Pass the isolated pr253-owner-intake-XXXXXXXX Supabase container as argv[2] or OWNER_INTAKE_TEST_CONTAINER.',
  )

const sql = readFileSync(
  new URL('../supabase/tests/owner_intake_availability.sql', import.meta.url),
  'utf8',
)
execFileSync(
  'docker',
  [
    'exec',
    '-i',
    '-e',
    'PGPASSWORD=local-pgtap-only',
    '-e',
    'PGOPTIONS=-c search_path=public,extensions',
    container,
    'psql',
    '-X',
    '-w',
    '-U',
    'antique_trail_test_runner',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  { input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
)
