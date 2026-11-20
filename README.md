# Jym CRM

Local PostgreSQL foundation and fictional dashboard preview. Staff authentication works locally; live gym workflows are not available yet.

Run npm.cmd ci, then npm.cmd run dev. Open http://localhost:3000/dashboard.

Node 24 and PostgreSQL are required. This workstation uses PostgreSQL 18.4. Generated credentials are in ignored .env.local. Never commit or print it. On another machine copy .env.example and provision separate migration/runtime roles. The one-time scripts/provision-local.mjs helper refuses existing roles; do not rerun it here.

Checks: npm.cmd run lint, npm.cmd run typecheck, npm.cmd test, npm.cmd run test:integration, npm.cmd run test:e2e, npm.cmd run build. Install browser once using npx.cmd playwright install chromium.

Migrations: npm.cmd run db:generate; review SQL; npm.cmd run db:migrate. Apply separately to isolated tests using node scripts/migrate.mjs --test. Never edit applied migrations. db:seed explicitly refuses until controlled owner provisioning exists.

Set DEMO_MODE=false to disable fictional UI. Production plus demo mode fails validation. No database error falls back to demo rows.

Schemas: gym for business, app_auth for Better Auth, drizzle for migration history. Runtime has no ownership, DDL, superuser or RLS bypass. Tenant context must be transaction-local. Application session, active membership, role and branch authorization are required before protected operations are exposed.

No Supabase account, keys, Docker or cloud database needed. Future hosting changes retain services and IDs. See doc/ for scope and verification evidence.

Authentication is now implemented locally. Choose an owner identity before signing in; no shared account/password was seeded. In PowerShell, set OWNER_NAME, OWNER_EMAIL, GYM_NAME and GYM_SLUG to your chosen values. Read OWNER_PASSWORD securely, then run npm.cmd run auth:bootstrap:

    $ownerSecret = Read-Host 'Choose owner password (12–128 characters)' -AsSecureString
    $env:OWNER_PASSWORD = [System.Net.NetworkCredential]::new('', $ownerSecret).Password
    try { npm.cmd run auth:bootstrap } finally { Remove-Item Env:OWNER_PASSWORD }

The CLI uses separate migration credentials and refuses an initialized workspace. Visit http://localhost:3000/sign-in. Organization, role and active-branch authorization is connected; /workspace shows your permitted workspace scope. Password reset instructions are captured as private files in .local/mail for a local administrator, never served publicly. Actual production email delivery is not configured. Run npm.cmd run test:auth for the isolated auth lifecycle; browser tests use gym_test and clean their own fixtures. Run browser tests and production build serially.


SEC-01 is now connected: /workspace and GET /api/workspace revalidate staff membership, action permission, organization and active branch scope against PostgreSQL on every operation. Owners have all active branches in their gym; other roles need explicit branch grants. Inaccessible selections return non-disclosing errors. Organization/branch selectors are kept in the URL. No role or scope supplied by the browser is trusted.

Run npm.cmd run test:security for the real-session two-gym suite. Its react-server condition respects the server-only package boundary; the test uses only guarded gym_test fixtures. Future business services must use getSecurity().run with a fixed server action, then filter repository rows by Scope.branchIds and validate resource-specific ownership/assignments. Runtime RLS is tenant defense in depth, not automatic branch filtering or protection against arbitrary SQL using compromised runtime credentials. Settings/staff administration is SET-01; actual production recovery mail is still a release blocker.
