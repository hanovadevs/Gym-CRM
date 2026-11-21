# Local setup and operations

Target developer workstation: Windows/VS Code and installed local PostgreSQL. Docker optional. Discover actual versions, service/port and paths; do not guess a password or assume a fixed PostgreSQL directory.

## Setup sequence for Codex

1. Inspect repository/package manager/Node compatibility; record actual versions.
2. Locate psql/pg_dump/pg_restore. Use installed tools or document the actual bin path.
3. Provision separate dev/test databases, migration/runtime roles and app schemas with an authorized admin connection. App runtime never uses postgres/table owner.
4. Create ignored .env.local from a validated .env.example. Generate auth secret locally.
5. Install locked dependencies, generate/review/apply committed migrations, explicitly seed fictional dev data if requested.
6. Start app, verify runtime connection/auth/tenant-denial/core flow and persistence after restart.

Use PowerShell-compatible instructions on Windows; no CMD caret continuation or Unix-only assumptions. Write actual commands after discovering real tool paths and scripts.

## Proposed server-only environment contract

| Variable | Purpose |
| --- | --- |
| APP_ENV / APP_URL | Environment and canonical origin |
| DATABASE_URL | Restricted runtime connection |
| MIGRATION_DATABASE_URL | DDL/migration connection |
| TEST_DATABASE_URL | Separate disposable test target |
| BETTER_AUTH_URL / BETTER_AUTH_SECRET | Auth origin/secret |
| DEMO_MODE | Explicit fictional preview, forbidden in production |
| MAIL_TRANSPORT | smtp for delivery; capture permitted only outside production |
| SMTP_HOST / SMTP_PORT / SMTP_USE_SSL | SMTP server/port and true for direct TLS; false requires STARTTLS |
| SMTP_USERNAME / SMTP_PASSWORD | Fixed contact@hanovadevs.com identity and private credential; no tenant sender override |

No NEXT_PUBLIC_DATABASE_URL, database password in client code, or Supabase keys required locally. Startup fails clearly on missing required configuration. No owner-credential or cloud fallback after connection failure. Keep seed/reset tools environment/database guarded.

Private file storage stays outside public directories and is backed up separately. A future object-storage adapter transfers bytes separately from DB migration. Mail capture is development-only; live recovery/invitations need configured sender/domain/provider, safe callback URLs, expiry/throttling and tested delivery.

## Deployment and recovery

Localhost is one PC. LAN/public deployment needs deliberate app host, HTTPS/origins, private DB connectivity, process supervision, backups and support ownership. Browsers connect to app, not directly to an exposed PostgreSQL port.

Before pilot, agree recovery time/data-loss tolerance. Proposed starting baseline: encrypted daily off-machine backup and pre-migration backup; adapt to payment volume. Restore into a separate DB and verify users/auth, constraints, counts, balances and attachment bytes. A copy on the same disk is insufficient for disk failure. Production needs an appropriate managed backup/PITR or equivalent strategy for agreed targets.

Release checks: locked build, reviewed migrations, restricted roles, secure cookies, functioning recovery, private uploads, minimal health endpoint, safe request-ID logs, backup/restore evidence, rollback and pilot workflow. Apply migrations in controlled release steps, never on every request/cold start.

Monitor payment/check-in failures, DB connection pressure, failed auth, backup/export/storage failures. Logs must omit credentials/cookies/raw contacts and private notes.

First gym onboarding: create org/branch/owner; confirm brand/time zone/currency/access/refund policies; plans; validate/import members and audited opening balances; train receptionist; test receipt printing, permissions/recovery and backup; document support and limits. No deployment is performed by this document pack.

Foundation setup verified on 20 November 2026: PostgreSQL tools 18.4 in C:/Program Files/PostgreSQL/18/bin; app GYM and isolated gym_test. Generated runtime/migration credentials are in ignored .env.local. Migrations run with MIGRATION_DATABASE_URL, application runtime uses DATABASE_URL; tests use TEST_DATABASE_URL/TEST_MIGRATION_DATABASE_URL. No Supabase keys required. Do not rerun one-time provisioning on this machine. See README.md for scripts and 15_SESSION_LOG.md for results. Browser tests own port 3100; production smoke test owns port 3200. Normal dev server is localhost:3000.

MEM-02/MAIL-01 operations: apply through committed 0009 on a new database; preserve initialized GYM. Account callbacks enqueue before immediate delivery. Schedule npm.cmd run mail:deliver on the deployed host to process pending messages, expire old link payloads and mark interrupted claims uncertain. It handles at most 20 pending jobs per invocation. Failed invitations can be explicitly retried by the authorized owner through Team & roles; uncertain outcomes require mailbox/provider reconciliation and are never automatically resent. Do not run delivery commands casually against valued data merely as a test. Test suites use capture and must run serially against gym_test. Private captures in .local/mail contain links and must not enter Git or screenshots. Production requires SMTP and a reachable trusted APP_URL. Local SMTP receipt/reset verification does not establish delivery or callback reachability from a future deployment. The real owner's local-only email remains unchanged by explicit user choice.

SUB-01 operations — 21 November 2026: new installations apply all committed migrations through 0014 (15 journal entries). Existing GYM must migrate incrementally; never reset or bootstrap it again. Membership verification is npm.cmd run test:memberships against guarded gym_test, serially with other database/browser suites. Enroll from a registered member's profile after creating a home-branch plan. Paid activation policy initially creates a pending membership and an issued charge; owner/manager activation with debt requires an explicit reason. No payment is collected by that action. Until PAY-01/02 settlement exists, nonzero due invoices remain outstanding and the saved debt-block policy can deny access. Cancellation and freeze preserve charges; refunds/credits belong to PAY-03. Desktop sidebar collapse is saved only as a non-sensitive browser preference.
