#!/usr/bin/env node
/* global AbortController, console, process */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createLocalService } from './configured-shopper-local.mjs'
import {
  classifyRpcError,
  diagnosticPassed,
  failureStatus,
  safeReportJson,
  statusAfterCleanup,
} from './diagnose-trip-invitation-acceptance-report.mjs'

const reportRoot = path.resolve(process.cwd(), 'artifacts', 'configured-shopper-issue342')
fs.mkdirSync(reportRoot, { recursive: true })

const report = {
  schemaVersion: 1,
  evidenceClass: 'real-local-auth-rpc',
  status: 'unavailable',
  phase: 'startup',
  cleanup: 'not-started',
  checks: {},
  errors: [],
}

const controller = new AbortController()
const interrupt = () => controller.abort()
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)

const uuid = (value) => {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Invalid fixture UUID')
  return value
}
const sqlText = (value) => String(value).replaceAll("'", "''")

async function snapshot(service, tripId, recipientId) {
  const raw = await service.sql(`
    select json_build_object(
      'recipientVerified', exists(
        select 1 from auth.users
        where id='${uuid(recipientId)}' and email_confirmed_at is not null
      ),
      'invitationCount', (
        select count(*) from trip_private.trip_invitations where trip_id='${uuid(tripId)}'
      ),
      'invitationState', coalesce((
        select state::text from trip_private.trip_invitations
        where trip_id='${uuid(tripId)}' order by created_at desc limit 1
      ), 'missing'),
      'acceptedRecipientMatches', coalesce((
        select accepted_user_id='${uuid(recipientId)}' from trip_private.trip_invitations
        where trip_id='${uuid(tripId)}' order by created_at desc limit 1
      ), false),
      'membershipCount', (
        select count(*) from trip_private.trip_participants
        where trip_id='${uuid(tripId)}' and user_id='${uuid(recipientId)}' and state='active'
      )
    );
  `)
  return JSON.parse(raw.trim())
}

let service
const secrets = []
try {
  service = createLocalService({ signal: controller.signal })
  const local = await service.start()
  report.phase = 'setup'
  Object.assign(report, {
    sourceSha: local.sourceSha,
    sourceDirty: local.sourceDirty,
    schemaIdentity: local.schemaIdentity,
    functionIdentity: local.functionIdentity,
    fixtureIdentity: local.fixtureIdentity,
    configIdentity: local.configIdentity,
    endpointClass: 'literal-loopback',
  })
  report.functionBoundary = JSON.parse(
    (
      await service.sql(`
        select json_build_object(
          'emailHmacOwner', pg_get_userbyid(p.proowner),
          'verifierOwner', pg_get_userbyid(v.proowner),
          'emailHmacExecutableByVerifierOwner', has_function_privilege(
            pg_get_userbyid(v.proowner),
            'trip_private.email_hmac(text,text,text,integer)',
            'EXECUTE'
          )
        )
        from pg_proc p
        join pg_namespace pn on pn.oid=p.pronamespace and pn.nspname='trip_private'
        cross join pg_proc v
        join pg_namespace vn on vn.oid=v.pronamespace and vn.nspname='trip_private'
        where p.proname='email_hmac'
          and pg_get_function_identity_arguments(p.oid)='normalized_email text, target_purpose text, target_environment text, target_version integer'
          and v.proname='current_verified_email_hmac'
          and pg_get_function_identity_arguments(v.oid)='target_purpose text, target_environment text, target_version integer';
      `)
    ).trim(),
  )

  const creator = local.users[0]
  const recipient = local.users[1]
  const tripId = crypto.randomUUID()
  const token = crypto.randomBytes(32).toString('base64url')
  secrets.push(token, creator.email, recipient.email)
  await service.sql(`
    insert into trip_private.trips(trip_id,owner_id,area_id,name,local_date)
      values ('${tripId}','${uuid(creator.id)}','00000000-0000-4000-8000-000000000001','Issue 342 diagnosis','2026-10-10');
    insert into trip_private.trip_participants(trip_id,user_id,participant_role)
      values ('${tripId}','${uuid(creator.id)}','creator');
    begin;
      set local role trip_email_key_manager;
      insert into trip_private.email_hmac_keys(environment,purpose,key_version,key_material,state)
        values ('shared_alpha','trip_invitation',1,extensions.gen_random_bytes(32),'active')
        on conflict (environment,purpose,key_version) do nothing;
    commit;
    begin;
      set local role trip_invitation_signer;
      select trip_private.produce_invitation_receipt(
        '${tripId}',
        '${sqlText(recipient.email)}',
        extensions.digest(convert_to('${sqlText(token)}','utf8'),'sha256'),
        'issue342-${crypto.randomUUID()}',
        statement_timestamp()+interval '1 day',
        'shared_alpha'
      );
    commit;
  `)

  const rpc = (actor, command, body) =>
    service.request(`/rest/v1/rpc/${command}`, {
      key: local.anonKey,
      token: actor.token,
      schema: 'app_public',
      body,
    })

  await rpc(creator, 'invite_trip_partner', {
    trip_id: tripId,
    verified_email: recipient.email,
  })
  report.before = await snapshot(service, tripId, recipient.id)
  report.phase = 'acceptance'

  try {
    await rpc(creator, 'accept_trip_invitation', { fragment_token: token })
    report.checks.wrongRecipient = { outcome: 'unexpected-pass' }
  } catch (error) {
    report.checks.wrongRecipient = classifyRpcError(error)
  }
  report.afterControl = await snapshot(service, tripId, recipient.id)

  try {
    await rpc(recipient, 'accept_trip_invitation', { fragment_token: token })
    report.checks.intendedRecipient = { outcome: 'accepted' }
  } catch (error) {
    report.checks.intendedRecipient = classifyRpcError(error)
  }
  report.afterAcceptance = await snapshot(service, tripId, recipient.id)

  report.phase = 'verification'
  report.status = diagnosticPassed(report) ? 'passed' : 'failed'
} catch {
  report.failedPhase = report.phase
  report.status = failureStatus(report.phase)
  report.errors.push({ phase: report.phase, reason: 'unclassified' })
} finally {
  if (service) {
    try {
      report.cleanup = await service.cleanup()
    } catch {
      report.cleanup = 'failed'
      report.errors.push({ phase: 'cleanup', reason: 'cleanup-failed' })
    }
  }
  report.status = statusAfterCleanup(report.status, report.cleanup)
  report.phase = 'complete'
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', interrupt)
  fs.writeFileSync(path.join(reportRoot, 'report.json'), safeReportJson(report, secrets))
}

console.log(`${report.status}: ${reportRoot}`)
process.exitCode = report.status === 'passed' ? 0 : 1
