# Jym CRM

Gym administration on local PostgreSQL: staff authentication, scoped workspaces, settings/staff administration, member profiles/notes/archival, immutable plans and membership enrollment/renewal/freeze/cancellation. SMTP recovery/invitations use the shared sender. Enrollment issues an invoice atomically; payment collection, receipts and attendance are upcoming. The development dashboard uses fictional data.

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

The CLI uses separate migration credentials and refuses an initialized workspace. Visit http://localhost:3000/sign-in. Organization, role and active-branch authorization is connected; /workspace shows your permitted workspace scope. SMTP recovery is configured privately on this workstation. The owner login remains intentionally local-only by the user's choice; it is not a deliverable recovery mailbox. Run npm.cmd run test:auth for the isolated auth lifecycle; browser tests use gym_test and clean their own fixtures. Run database suites and browser tests serially because they share gym_test.


SEC-01 is now connected: /workspace and GET /api/workspace revalidate staff membership, action permission, organization and active branch scope against PostgreSQL on every operation. Owners have all active branches in their gym; other roles need explicit branch grants. Inaccessible selections return non-disclosing errors. Organization/branch selectors are kept in the URL. No role or scope supplied by the browser is trusted.

Run npm.cmd run test:security for the real-session two-gym suite. Its react-server condition respects the server-only package boundary; the test uses only guarded gym_test fixtures. Future business services must use getSecurity().run with a fixed server action, then filter repository rows by Scope.branchIds and validate resource-specific ownership/assignments. Runtime RLS is tenant defense in depth, not automatic branch filtering or protection against arbitrary SQL using compromised runtime credentials. Deployment-specific HTTPS/proxy/recovery reachability still requires release verification.

SET-01 is connected at /settings through Open settings in the workspace. Owners manage settings, branches and staff grants; managers have a contact/footer allowlist. Writes require a reason and reject stale versions. New staff can use an owner-chosen initial password or receive an emailed, one-use password setup link. An existing global identity cannot be claimed or have its password replaced from another gym. Staff access is checked again on the next operation. Invitation delivery status is shown separately from the saved staff record.

Migrations 0004_settings_staff_audit and 0005_settings_audit_security added configuration versions, policies and tenant-scoped audit. Apply all committed migrations on a new database using the existing scripts. No schema push/reset is used. Run npm.cmd run test:settings for real database settings/permission/rollback/concurrency checks. All test suites use gym_test and clean their fictional data; GYM is never seeded by the suite.

Branding currently uses saved gym name and derived initials. Private logo uploads belong to the file workflow. Saved access policies require future enrollment/attendance consumers; receipt settings currently drive a formatting example, with paid receipts and atomic numbering reserved for billing. SaaS billing and notifications controls are hidden.

MEM-01 is connected at /members. Owners, managers and receptionists register/edit members in permitted active branches. Review then save assigns an org-unique member code. Shared contacts require reasoned confirmation. Registration creates no membership, invoice, payment or account login.

Directory search, branch/record/sort filters, 25/page pagination and counts are server-side. Search stays in the tab; other filters are in the URL. Registration retry uses an actor-scoped key, so a lost response does not duplicate the person. Member/counter/audit commit atomically. Run npm.cmd run test:members for the real-session PostgreSQL suite.

MEM-02 profiles open through View in the directory. Emergency contacts use the member version; operational notes are visible to permitted branch staff, management notes only to owners/managers. Reception can withdraw its own notes; owners/managers can withdraw permitted notes. Originals remain stored and withdrawn bodies are hidden. Archiving/restoring requires owner/manager, reason, confirmation and version; archive keeps contacts/notes/history and blocks profile edits/new notes. Registered/archived/all filters retain access to history. Restoration does not create enrollment or payment. Membership history is connected; visit/payment history will follow those services. Run npm.cmd run test:profiles.

All account mail uses contact@hanovadevs.com; gyms cannot override the sender. .env.example documents private SMTP settings; this workstation uses Hostinger TLS on port 465. New staff invitations queue atomically with auth identity/grants/audit and are delivered after commit. Recovery uses maintained Better Auth one-use links (30 minutes). SMTP acceptance is a delivery attempt, not proof of receipt: actual inbox receipt and single-use reset were verified, with token-free metadata in doc/evidence/mail-delivery.json.

Private app_auth.mail_outbox records pending/sending/sent/failed/uncertain/expired status. Successful sends clear the reset payload. Failed invitations can be retried by an authorized owner; uncertain sends are held for provider/inbox reconciliation, never automatically retried. Expired links can be replaced through normal staff password recovery. Run npm.cmd run mail:deliver to drain up to 20 pending jobs, classify interrupted sends and clear expired link payloads; schedule this maintenance on a deployment before live rollout. No generic browser send/outbox endpoint exists. Automated tests force MAIL_TRANSPORT=capture and never send real test traffic. Capture is forbidden in production.

Migrations 0008_member_profiles_and_mail and 0009_profile_mail_security add profiles and mail. Run npm.cmd run test:mail for transactional invitation/delivery/uncertainty tests. SMTP credentials and private owner access must remain ignored.

PLAN-01 is connected at /plans (Open plans in the workspace). Owners/managers publish branch-scoped plans, new immutable versions and reasoned archive/restore. Reception/accountants have assigned-branch read-only access. Every version preserves its integer rate/currency, calendar-month or fixed-day term, branch access and benefits. Only owners publish all-gym-branch access. Stable plan codes cannot be reused after archive. Same save key safely replays a lost response; stale edits cannot overwrite newer publications.

Migrations 0010_plan_catalog and 0011_plan_security add the plan catalog. Runtime cannot update/delete published versions or change plan code/branch identity. Run npm.cmd run test:plans for real-session PostgreSQL scope/concurrency/rollback/snapshot checks. Exact decimal parsing follows ISO accounting units (PKR has two) independently of locale display defaults. Plan preview/publication never creates an enrollment.

SUB-01 is connected in each member profile's Overview/Memberships section. Registration success links to the profile. Search current home-branch plans, review charge/exact dates, then confirm enrollment or renewal. A membership, immutable plan snapshot, numbered issued invoice, request result and audit commit together. Same-key retries return the original result; stale or simultaneous confirmations cannot charge twice. Dates are inclusive start/exclusive end. Existing rates/access remain unchanged when a plan is edited or archived.

Default paid activation leaves a nonzero charge pending. Owner/manager can explicitly activate with debt and reason; reception can enroll/renew only. Configured unpaid activation/free plans may start active. Separate due-debt blocking, grace, freezes, future start, cancellation and archival still govern access. Freeze extends once and rejects collision with future renewal; prospective reversal removes its extension once. Cancellation preserves the invoice and debt, with no automatic refund/credit. Actual payment-driven activation will connect in PAY-02. Attendance visit enforcement is ATT-01 work.

Migrations 0012_membership_lifecycle, 0013_membership_security and 0014_membership_snapshot_shape bring the journal to fifteen entries. No prior migration is edited. Runtime cannot change issued invoices, plan snapshots or original membership dates; tenant constraints/RLS and a member-locking overlap trigger protect stored data. Run npm.cmd run test:memberships for the real-session concurrency/policy/rollback/ledger suite. Tests use isolated gym_test and run serially. PAY-01 continues invoice lists/lines/balances; PAY-02 actual collection and paid receipts. Never call an issued unpaid invoice a receipt.

Shared navigation now has outline icons, a collapsible desktop rail and mobile Menu drawer. The non-sensitive collapse preference is saved in your browser. Unauthorized live links stay hidden; preview-only unsupported controls remain disabled. No icon dependency, decorative dot or blinking indicator added. Next task: PAY-01.
