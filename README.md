# Jym CRM

Local PostgreSQL foundation and fictional dashboard preview. Staff authentication and live gym workflows are not available yet.

Run npm.cmd ci, then npm.cmd run dev. Open http://localhost:3000/dashboard.

Node 24 and PostgreSQL are required. This workstation uses PostgreSQL 18.4. Generated credentials are in ignored .env.local. Never commit or print it. On another machine copy .env.example and provision separate migration/runtime roles. The one-time scripts/provision-local.mjs helper refuses existing roles; do not rerun it here.

Checks: npm.cmd run lint, npm.cmd run typecheck, npm.cmd test, npm.cmd run test:integration, npm.cmd run test:e2e, npm.cmd run build. Install browser once using npx.cmd playwright install chromium.

Migrations: npm.cmd run db:generate; review SQL; npm.cmd run db:migrate. Apply separately to isolated tests using node scripts/migrate.mjs --test. Never edit applied migrations. db:seed explicitly refuses until controlled owner provisioning exists.

Set DEMO_MODE=false to disable fictional UI. Production plus demo mode fails validation. No database error falls back to demo rows.

Schemas: gym for business, app_auth for Better Auth, drizzle for migration history. Runtime has no ownership, DDL, superuser or RLS bypass. Tenant context must be transaction-local. Application session, active membership, role and branch authorization are required before protected operations are exposed.

No Supabase account, keys, Docker or cloud database needed. Future hosting changes retain services and IDs. See doc/ for scope and verification evidence.
