-- Package 2B state values are additive; this migration intentionally contains
-- only enum changes so later constraints can use the new values safely.
alter type app_private.account_status add value if not exists 'pending_verification';
alter type app_private.account_status add value if not exists 'deletion_scheduled';
alter type app_private.session_state add value if not exists 'cancellation_only';
alter type app_private.grant_state add value if not exists 'pending';
