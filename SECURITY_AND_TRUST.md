# Security, Privacy, Trust, and Operations

Security is a product requirement and launch gate.

## Security objectives

- Prevent unauthorized access to private user data
- Prevent store owners from accessing shopper-private data
- Prevent clients from bypassing authorization
- Limit abuse of ratings and reviews
- Protect account recovery
- Protect uploaded images
- Protect administrative functions
- Minimize precise location collection
- Maintain recoverability and auditability
- Support responsible vulnerability reporting

## Data classification

### Public

- Approved store details
- Approved public reviews
- Approved public store photos
- Store-owner public responses
- Public event details
- Aggregate public rating
- Claimed-listing indicator

### Pilot-restricted

- Pilot Store Record core listing data
- Store Partner identity and contact needed for the pilot
- Pilot consent and participation status

Pilot-restricted data is readable only by invited Private Beta participants and authorized operational roles. Approval inside the pilot does not make it anonymously or publicly readable.

The Initial Private Beta Cohort contains only Scott's separate shopper and Administrator accounts, Scott's wife's shopper account, and one Store Representative account. AI and Agent-Assisted Test Accounts cannot read Pilot Store Records or other pilot-restricted data.

Expansion requires a passed Initial Private Beta Expansion Gate. No additional account or Pilot Store Record is authorized merely because time has elapsed.

Controlled Private Beta Expansion adds one Store Partner and Pilot Store Record at a time, repeats the same security and acceptance checks, and stops at three total stores for a separate public-readiness review. Pilot passage never changes pilot-restricted data to public data automatically.

### Private to user

- Personal rating
- Private notes
- Saved stores
- Finds
- Purchases
- Collection
- Trip history
- Preference profile
- Home photos
- Location-derived itinerary details unless explicitly shared

### Household-shared

Only records explicitly shared with an accepted household member.

### Sensitive operational data

- Moderation cases
- Business verification evidence
- Audit logs
- Fraud signals
- Account-recovery events
- Security alerts
- Administrative actions

## Privacy by default

Private content must never become public because it is connected to a public store record.

Every new field must receive:

- Data classification
- Allowed readers
- Allowed writers
- Retention period
- Deletion behavior
- Logging restrictions
- Export behavior

## Location privacy

- Request only while needed
- Explain the feature purpose
- Prefer while-in-use permission
- No background tracking in MVP
- Do not sell or share precise location
- Do not include exact location in analytics logs
- Save trips only through explicit user action
- Allow deletion of saved trip history
- Avoid storing raw movement history

## Authentication

- Email verification
- Secure managed authentication
- Optional passkeys
- Optional social sign-in
- Optional MFA for users
- Required MFA for administrators and verified business accounts
- Login rate limiting
- Password-recovery rate limiting
- Session revocation
- Recent-auth checks for sensitive operations
- No account enumeration
- No password storage in application tables

## Authorization

Use deny-by-default policies.

Authorization must be enforced at:

- Database
- Storage
- Server function
- Administrative tool

Never rely only on frontend visibility.

Required authorization test cases:

- User A cannot read User B private records
- Test User A and Test User B may create duplicate values without sharing record ownership or private-data visibility
- Representative Test Account is scoped to one Synthetic Store and cannot read either Test User's private records
- Store Representative can directly change only Representative-Managed Fields for the assigned store
- Controlled Store Fields remain unchanged until an authorized reviewer approves a Store Change Request
- Store Representative cannot approve their own Store Change Request
- Administrator Test Account alone approves Store Change Requests and grants or revokes representative roles during Internal Alpha and Private Beta
- Administrator Test Account uses MFA, a separate session, and no shopper-private access
- Primary Internal Tester completes two Privileged Workflow Acceptance Cycles; AI execution is supervised and cannot approve a gate
- Independent Internal Tester uses her own shopper account and phone and is not required to access privileged accounts
- Every Representative-Managed Field publishes directly only for the assigned Synthetic Store
- Approved Controlled Store Fields publish; rejected and pending changes do not
- Representative self-approval is denied
- Representative writes from an existing session are denied after the Administrator revokes store scope
- Every privileged action produces an audit record
- Representative and Administrator Test Accounts cannot read or modify either Test User's shopper-private data
- During the Initial Private Beta Cohort, the Store Representative account cannot perform shopper activity; a separately approved shopper account is required
- AI and Agent-Assisted Test Accounts cannot read Pilot Store Records or pilot-restricted participant data
- Only Initial Private Beta Cohort accounts can read the Pilot Store Record
- Scheduled representative revoke/regrant test denies the existing session during revocation and restores only the approved store scope after regrant
- Initial Private Beta Expansion Gate retains dated evidence for owner workflow, shopper Pilot Store Record trips, support intake, audit completeness, recovery controls, defect status, and owner usability confirmation
- Former household member loses access immediately
- Store owner cannot read user notes or trips
- Store owner cannot alter reviews
- Reviewer cannot alter aggregate rating directly
- Client cannot assign roles
- Client cannot approve its own public photo
- Moderator scope is limited
- Administrator actions are audited
- Signed private image URLs expire

## Database separation

Prefer separation between public and private entities.

Suggested domains:

- Public stores
- Public hours
- Public reviews
- Public photos
- Private profiles
- User-store preferences
- Private notes
- Private finds
- Private collections
- Private trips
- Households
- Business claims
- Moderation
- Auditing

## Upload security

- Private and public buckets separated
- Private buckets by default
- Expiring signed URLs
- File-size limits
- Dimension limits
- MIME validation by file contents
- Re-encoding images
- EXIF and GPS removal
- Malware scanning where feasible
- Server-side thumbnails
- Rate limits
- Abuse reporting
- Public publication requires explicit action and moderation rules
- No AI training use without explicit consent

## Reviews and abuse

- One active review per user per store
- Edit history
- Rate limiting
- Bot protection
- Spam detection
- Suspicious-rating analysis
- Report workflow
- Moderation queue
- Appeals
- Soft deletion
- Audit history
- Conflict-of-interest disclosure
- Store-owner response
- No owner editing of reviews
- No purchase of rating improvements

## Business claims

First Store Partner pilot:

- Use Synthetic Stores for the demonstration; do not create a real record during initial interest
- Obtain Store Partner Pilot Consent before creating a real store record or representative account
- Verify authority in person and through a published business contact
- Require owner-controlled verified email and MFA; prohibit shared credentials
- Audit consent, verification result, scope grant, withdrawal, and revocation without logging unnecessary identity evidence
- On withdrawal, revoke access and remove the real store from the active pilot
- Administrator creates the Pilot Store Record from owner-confirmed core fields with provenance and verification date
- Deny anonymous/public access to the Pilot Store Record
- Exclude photos, ratings/reviews, events, owner responses, and analytics

Verification options may include:

- Published business phone
- Business-domain email
- Postcard
- Business documents
- Trusted third-party source
- Manual review

A social-media account alone should not automatically grant ownership.

## API security

- Input schema validation
- Parameterized database access
- Strict CORS
- Secure headers
- CSRF protections when applicable
- Rate limits
- Request-size limits
- Output encoding
- Short-lived tokens
- Idempotency for critical writes
- Secret rotation
- No secrets in clients
- No private data in errors
- Server-side rating aggregation
- Server-side role assignment
- Server-side signed URL generation

## Supply-chain security

Every change should pass:

- Type checking
- Unit tests
- Integration tests
- Authorization tests
- Static security analysis
- Dependency scanning
- Secret scanning
- License checks
- Infrastructure checks
- Migration review
- Build verification

## Git and release controls

- Private repository during development
- Protected main branch
- Pull requests required
- Reviews required
- CI checks required
- No direct production deployment from a developer machine
- Separate development, test, staging, and production
- Production secrets only in deployment secret storage
- Traceable releases
- Rollback procedure

## Required pre-launch testing

- Threat model review
- Authorization matrix review
- OWASP ASVS-based review
- OWASP MASVS review for Android package
- File-upload testing
- Account-recovery testing
- Review-abuse testing
- Business-claim testing
- Manual penetration test
- Backup restore test
- Incident-response exercise
- Accessibility testing

## External Testing Readiness

Before first-owner contact, retain dated evidence that:

- Solo Agent-Assisted Alpha and Two-Person Acceptance passed
- The complete authorization and security test set passed
- No Blocking Defect or known privacy, security, or data-loss defect remains open
- Backup restore and rollback rehearsals passed
- Pilot-environment monitoring, error reporting, and support intake work
- The pilot privacy notice and owner consent are ready
- One External Testing Dress Rehearsal passed end to end

The Primary Internal Tester approves every check. AI Test Agents may execute tests and collect evidence but cannot approve the gate. Any failed check blocks owner outreach, real-store import, and external participation.

## Operations

### Backups

- Automated
- Encrypted
- Retention documented
- Restore tested
- Recovery targets documented
- Emergency export procedure

### Monitoring

Detect:

- Login abuse
- Signup spikes
- Review spam
- Authorization failures
- Upload abuse
- API cost spikes
- Database failures
- Storage failures
- Administrative anomalies
- Background-job failures
- Stale business data

Do not log:

- Passwords
- Tokens
- Private notes
- Full private image URLs
- Exact location history
- Sensitive verification documents

### Incident response

Required:

- Security contact
- Vulnerability intake
- Severity levels
- Credential revocation
- User notification process
- Store notification process
- Containment playbook
- Rollback and recovery
- Post-incident review

## User controls

- Export data
- Delete account
- Delete private photos
- Delete trip history
- Delete finds and collections
- Leave household
- Revoke household members
- Manage public reviews
- Manage personalization
- Manage location permission
- Manage notifications

## Legal and trust documents

Before public marketing:

- Privacy policy
- Terms of service
- Community guidelines
- Review policy
- Store-owner terms
- Photo and copyright policy
- Data deletion policy
- Data export policy
- Analytics disclosure
- Vulnerability disclosure policy
- Support contact and dispute process
