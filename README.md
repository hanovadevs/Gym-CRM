# Jym CRM

Gym administration on local PostgreSQL: staff authentication, scoped workspaces, persisted settings, staff/branch administration, and member registration/directory. Full member profiles, memberships, attendance and financial workflows are upcoming; the development dashboard uses fictional data.

Run npm.cmd ci, then npm.cmd run dev. Open http://localhost:3000/sign-in after owner setup below. The dashboard reference preview is at /dashboard.

Local development also accepts http://127.0.0.1:3000 on the same configured port. Production trusts only the configured APP_URL origin. Sign-in respects the server's retry delay and shows a countdown after throttling.

Node 24 and PostgreSQL are required. This workstation uses PostgreSQL 18.4. Generated credentials are in ignored .env.local. Never commit or print it. On another machine copy .env.example and provision separate migration/runtime roles. The one-time scripts/provision-local.mjs helper refuses existing roles; do not rerun it here.

Checks: npm.cmd run lint, npm.cmd run typecheck, npm.cmd test, npm.cmd run test:integration, npm.cmd run test:e2e, npm.cmd run build. Install browser once using npx.cmd playwright install chromium.

Migrations: npm.cmd run db:generate; review SQL; npm.cmd run db:migrate. Apply separately to isolated tests using node scripts/migrate.mjs --test. Never edit applied migrations. db:seed deliberately refuses generic seeding; use controlled auth:bootstrap for first-owner setup.

Set DEMO_MODE=false to disable fictional UI. Production plus demo mode fails validation. No database error falls back to demo rows.

Schemas: gym for business, app_auth for Better Auth, drizzle for migration history. Runtime has no ownership, DDL, superuser or RLS bypass. Tenant context must be transaction-local. Application session, active membership, role and branch authorization are required before protected operations are exposed.

No Supabase account, keys, Docker or cloud database needed. Future hosting changes retain services and IDs. See doc/ for scope and verification evidence.

Authentication is implemented locally. This workstation's first owner was created under the user's explicit setup instruction; access details are private in ignored .local/owner-access.json. Do not rerun bootstrap here. For a NEW database, set OWNER_NAME, OWNER_EMAIL, GYM_NAME and GYM_SLUG to your chosen values in PowerShell. Read OWNER_PASSWORD securely, then run npm.cmd run auth:bootstrap:

    $ownerSecret = Read-Host 'Choose owner password (12–128 characters)' -AsSecureString
    $env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $ownerSecret).Password
    try { npm.cmd run auth:bootstrap } finally { Remove-Item Env:OWNER_PASSWORD }

The CLI uses separate migration credentials and refuses an initialized workspace. Visit http://localhost:3000/sign-in. Organization, role and active-branch authorization is connected; /workspace shows your permitted workspace scope. Password reset instructions are captured as private files in .local/mail for a local administrator, never served publicly. Actual production email delivery is not configured. Run npm.cmd run test:auth for the isolated auth lifecycle; browser tests use gym_test and clean their own fixtures. Run browser tests and production build serially.


SEC-01 is now connected: /workspace and GET /api/workspace revalidate staff membership, action permission, organization and active branch scope against PostgreSQL on every operation. Owners have all active branches in their gym; other roles need explicit branch grants. Inaccessible selections return non-disclosing errors. Organization/branch selectors are kept in the URL. No role or scope supplied by the browser is trusted.

Run npm.cmd run test:security for the real-session two-gym suite. Its react-server condition respects the server-only package boundary; the test uses only guarded gym_test fixtures. Future business services must use getSecurity().run with a fixed server action, then filter repository rows by Scope.branchIds and validate resource-specific ownership/assignments. Runtime RLS is tenant defense in depth, not automatic branch filtering or protection against arbitrary SQL using compromised runtime credentials. Actual production recovery mail is still a release blocker.

SET-01 is connected at /settings through Open settings in the workspace. Owners save branding/contact, currency/locale/time zone, receipt and access policy; manage branches; create new staff accounts; and change roles, active status and branch grants. Managers may edit phone, gym email, address and receipt footer. Settings, staff and branch writes require a reason and reject stale versions. The latest administrative activity is read-only. Staff creation uses Better Auth with an owner-chosen initial password; no email is sent, and an existing global account cannot be attached or reset from another gym. Staff access is checked again on the next operation.

Migrations 0004_settings_staff_audit and 0005_settings_audit_security add configuration versions, policies and tenant-scoped append-only audit. Apply all six migrations on a new database using the existing migration scripts. No schema push/reset is used. Run npm.cmd run test:settings for real database settings, permission, audit rollback and concurrency checks. All tests use gym_test and clean their fictional data; GYM is never seeded by the suite.

Branding currently uses saved gym name and derived initials. Private logo uploads belong to the file workflow. Saved access policies require future enrollment/attendance consumers; receipt settings currently drive a formatting example, with paid receipts and atomic numbering reserved for billing. SaaS billing and notifications controls are hidden.

MEM-01 is connected at /members through Open members in the workspace. Owners, managers and receptionists register/edit members only in permitted active branches. Registration requires name, usable phone or email, home branch and a gym-local joining date. Review then save assigns an org-unique member code. Possible shared contacts require a reasoned confirmation; existing family contacts remain valid. No membership, invoice, payment or account login is created for the member. Full profiles/notes/archive are MEM-02.

Directory search matches name/code/phone/email; branch and sort filters, 25/page pagination and counts are server-side. Search stays in the tab while branch/order/page are retained in the URL. Edits require a reason/version. Registration retry uses the same actor-scoped key, so a lost response does not duplicate the person; changing a completed registration payload conflicts. Member/counter/audit commit atomically, with tenant RLS and composite branch FK. Migrations 0006_member_directory and 0007_member_security bring the journal to eight entries. Run npm.cmd run test:members for the real-session PostgreSQL suite. The next task is MEM-02.
