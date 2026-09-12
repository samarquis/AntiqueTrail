-- Let the existing verified-email SECURITY DEFINER verifier call the private HMAC helper.
-- Browser, transport, and unrelated trip-service roles retain no direct helper access.

revoke all on function trip_private.email_hmac(text,text,text,integer)
  from public,anon,authenticated,service_role,authenticator,
       trip_email_key_manager,trip_invitation_signer,trip_grant_signer;

grant execute on function trip_private.email_hmac(text,text,text,integer) to postgres;
