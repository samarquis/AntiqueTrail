# S-01 support and incident-status path

Status: **DRAFT / BETA-READY PLAN**
Issue: [#7](https://github.com/samarquis/AntiqueTrail/issues/7)

## Beta support channels

- **Primary support:** authenticated in-app support form.
- **Security/privacy intake:** the same form, with an urgent security/privacy
  category that routes to the Administrator/operator alert path.
- **Incident/status communication:** in-app status page/banner for planned and
  unplanned incidents. Status updates are owned by Scott as Operations Owner;
  Codex prepares technical impact, mitigation, and recovery details.
- **Fallback:** no public support address is enabled by this receipt. Add a
  monitored external address before first owner contact or public release.

## Beta response targets

| Severity/category | Target |
| --- | --- |
| Security/privacy report | Acknowledge within 4 clock hours |
| Other beta support ticket | Acknowledge within 2 business days |
| Incident status | Post an initial in-app status update when an incident is confirmed; update on material change and closure |

## Privacy-safe ticket contract

The form may attach only account/store identifiers, app version, timestamp,
and basic device/browser details. It must not attach tokens, shopper-private
content, precise location, or internal logs. Screenshots are optional and must
be previewed/sanitized by the submitter before sending. Replies and lifecycle
status remain authenticated to the submitting representative and authorized
administrators.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Operations decision, escalation, and final status wording | Scott |
| Technical triage, reproduction, security analysis, and recovery evidence | Codex |
| Support form workflow and ticket lifecycle | Scott + Codex |
| Backup/restore, rollback, deletion, and outage rehearsal | Scott + Codex |

## Closure checks

- [ ] Submit a synthetic bug ticket and verify authenticated visibility, reply,
  status change, reopen, and closure.
- [ ] Submit a synthetic security/privacy ticket and verify urgent routing,
  minimized diagnostics, and no private-data leakage.
- [ ] Publish a synthetic incident status, update it, resolve it, and preserve
  a content-minimized evidence record.
- [ ] Rehearse backup/restore, rollback, deletion-receipt replay, and outage
  communication before first owner contact.
- [ ] Add a monitored external support/security contact before external use.

This receipt supports controlled synthetic/beta preparation. It does not
authorize owner outreach, public access, public promotion, or production
incident commitments until the closure checks and applicable gates pass.
