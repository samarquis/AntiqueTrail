# Local email signup journey

Run `npm run test:e2e:local-signup` with Docker Desktop's Linux engine ready. The runner creates a uniquely named Supabase project with random, non-overlapping loopback API, database, Inbucket web, SMTP, POP3, and inspector ports, serves the real registration Edge Functions, builds the app against that local project, and drives signup in Chromium. Supabase Auth sends confirmation to the run's local Inbucket mailbox; the browser follows that message through `/auth/callback`, checks active Shopper admission, saves Clockwork Cabinet, and retries both registration and the private save.

No hosted endpoint or external inbox is used. The runner removes only its labeled containers, volumes, and network, then deletes its temporary project. Its report is written under `artifacts/local-signup/` and includes the source SHA, provider/callback/admission/save outcomes, failure stage, and cleanup result. It omits account credentials and confirmation links.

`npm ci` installs the locked project dependencies before the first run. A failed run keeps `journey.json` with the last provider, callback, admission, or save stage; cleanup still targets only the temporary project identified by its ownership marker.
