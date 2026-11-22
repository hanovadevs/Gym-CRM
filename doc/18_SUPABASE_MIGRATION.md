# Local PostgreSQL → Supabase-hosted PostgreSQL

This is a future runbook, not an executed migration. Change the database host while keeping app services, Drizzle contracts, Better Auth users/hashes and business IDs. Supabase Auth adoption is a separate project.

## Prepare for portability now

Use app-owned gym/app_auth/migration schemas. Avoid Supabase system-schema names, source-major-specific features and unsupported extensions. Keep host/TLS/credentials in server configuration. No browser DB access or auth.uid dependency. Attachments use opaque storage keys; moving DB metadata does not move file bytes.

## 1. Inventory and compatibility

Record source/target server_version, client tool versions, encoding/collation/timezone, extensions, tables/row counts per organization, migration journal, triggers/functions/RLS/grants, counters/sequences and file counts. Keep current app commit/configuration names, not secrets.

Prefer matching supported PostgreSQL majors. If local is 18 and hosted target is older, do not assume a raw dump will downgrade. Rehearse on the target major, avoid unsupported SQL, and use reviewed migration/schema/data transfer. pg_dump client must support reading the source; older-than-source client is not assumed to work.

Never restore an entire source cluster or its superuser roles into managed Supabase. Transfer only authorized application data.

## 2. Choose one schema strategy

**A — migrations first, preferred for a clean target:** provision app roles/schemas, apply the reviewed Drizzle migrations once, then load application data in dependency order and reconcile counters. Target journal is created by migrations; do not overwrite it with source journal rows. Explicitly handle cyclic/deferred references in a rehearsed procedure, not casual global trigger disabling.

**B — compatible full app-schema restore:** restore allowlisted app schemas and their matching migration journal into an empty target, with ownership/ACL handling reviewed. Validate journal parity before future migrations. Do not apply baseline migrations over already restored tables.

Choose and record one. Mixing full schema restore with baseline migration execution risks duplicate tables and invalid history.

## 3. Rehearse on disposable staging

1. Provision an authorized empty staging target, approved region and data handling. Real customer data requires authorization for that destination.
2. Use documented direct connection for migration/dump/restore, or verified session-pooler alternative where direct networking is unavailable. Do not blindly use transaction pooling for transfer tools.
3. Verify TLS/certificate settings; do not disable verification to bypass connection failures.
4. Take protected source backup outside git/public folders; pause target jobs.
5. Execute selected strategy, allowlisting app schemas and preserving Supabase-managed auth/storage/extensions. Do not restore source global roles.
6. Provision custom restricted runtime login, required grants and tenant RLS. Ensure runtime does not own tables, bypass RLS or perform DDL.
7. Keep custom app schemas outside exposed Data API schemas; do not assume RLS protects privileged owner connections.
8. Configure runtime/migration URLs separately. Validate driver pools and transaction-local org context on reused pooled connections.
9. Transfer attachment bytes separately if changing storage; verify hashes/counts/private access and retain rollback copies.

## 4. Reconcile and prove readiness

Compare every table's counts per gym, IDs, member/membership periods, document numbers/counters, invoice totals/credits, allocation/refund sums, outstanding balances, period cash collections/expenses, open visits, auth tables/login, migration journal and attachment links/bytes. Counts alone are insufficient.

Run relevant T01–T25 plus T28 against target. Specifically prove missing-context denial, cross-gym IDs, revoked users, forbidden direct actions, pooled context reuse, payment retries/concurrency, receipt generation, expiry boundaries, and private downloads. Record sanitized commands, failures/fixes, duration, expected downtime, restore and rollback steps.

## 5. Authorized live cutover

Prepare a concrete checklist and obtain authorization for changing the live environment if one exists. Agree maintenance arrangements through an authorized channel; do not send external messages automatically.

Stop source writes, drain requests, pause jobs, take final backup. Repeat rehearsed transfer and reconcile critical totals. Deploy tested target configuration, smoke-test, then enable target writes/jobs. Keep source read-only. Never allow unsynchronized writes to both.

## Rollback

Before target writes, point back to unchanged source if needed. After target writes, source is stale: freeze writes and reconcile/export new changes before reverting. Blind URL reversal can lose payments/visits. Preserve both datasets and backups; document recovery owner and decision threshold. Do not immediately delete the old source.

## Illustrative matched-version archive commands

These PowerShell examples are **not** a complete cutover script. Adapt/inspect for chosen strategy, true schema names, authorized credentials, version compatibility, and an empty target. Variables hold secrets and must not be printed.

```powershell
pg_dump --dbname=$env:JYM_SOURCE_DB_URL --format=custom --no-owner --no-acl --schema=gym --schema=app_auth --schema=drizzle --file=jym-app-backup.dump
pg_restore --list jym-app-backup.dump
# After archive inspection, role setup, and empty-target confirmation:
pg_restore --dbname=$env:JYM_TARGET_MIGRATION_DB_URL --no-owner --no-acl --exit-on-error --single-transaction jym-app-backup.dump
```

No --clean, global-role restore or system-schema overwrite. With --no-acl, grants must be reapplied separately. Reassign/configure ownership so runtime remains restricted. This transfers neither private file bytes nor external mail configuration.

Completion evidence updates DB-MIG-01, M14 cloud substate, decision log, operations configuration and handoff with versions/strategy/reconciliation/tests/retained limitations. Successful connection alone is not migration completion.


## Target selected —21 November2026

Vercel + Supabase-hosted PostgreSQL selected by user. Credentials retained only in ignored local target configuration, not app/browser/git. App runtime still uses local GYM. Connected Supabase MCP lacks project access; direct read-only PG probe reached certificate validation and failed SELF_SIGNED_CERT_IN_CHAIN. No successful authentication/schema inventory or remote changes yet. Need actual dashboard root CA and transaction-pooler connection details. Do not weaken TLS verification. Obtain restricted hosted runtime role and verify current grants/RLS, schema compatibility, backups/data reconciliation and all acceptance before live cutover. Local20 applied migrations remain authoritative; draft0020/0021 not applied/review-complete.


Target inspection resolved: user supplied actual Supabase Root2021 CA file. Parsed as CA with expiry26April2031; direct PG connection verified with rejectUnauthorized=true. Read-only transaction confirms target PostgreSQL17.12 and no gym/app_auth/drizzle schemas/tables. No hosted DDL/data/auth changes. SourcePG18.4 means reviewed migrations-first + explicit data reconciliation, not blind downgrade restore. Need scoped runtime credentials and actual transaction-pooler URL before Vercel runtime configuration; local GYM remains active authority. Supabase public client key is unused by this server-only architecture.


## Authorized connection update —22 November2026

User explicitly requested .env.local hosted connections and selected https://mojym.hanovadevs.com. Earlier target-inspection-only notes above are historical. Current target PG17.12 has reviewed migrations0000–0024 (25 entries); local source GYM and isolated gym_test also have25. Existing applied SQL was preserved. Restricted gym_runtime was provisioned separately with no superuser, BYPASSRLS, role/database creation, app-schema CREATE or table ownership. Direct and supplied shared transaction-pooler connections pass trusted TLS. Runtime missing tenant context sees zero organization rows; scoped read sees only initialized gym; context clears after transaction release.

One-time guarded transfer: .local/transfer-initial-workspace.mjs, .local/initial-workspace-source-backup.json, .local/hosted-transfer-evidence.json and original .local/env-before-hosted.env. Source has1 user/account/organization/branch/membership/grant/audit,0 counters/outbox/operational records. Each copied table's canonical SHA256 matched source/target, with source rechecked unchanged. Source snapshot retained; no destructive reset or role/cluster overwrite. Sessions/reset tokens remain local and are not portable login sessions. New platform administrator subsequently created only on target through maintained auth and explicit grant. Source snapshot is now stale for new hosted writes.

Private .env.local uses hosted restricted direct runtime + migration owner + trusted CA; local application origins and TEST_* remain local. Private .env.vercel is the clean Production import using the actual transaction-pooler endpoint and canonical domain; migration/test/OIDC values excluded. Never import the entire development file into Vercel. No provider env variables have been changed by the agent; no new production deployment claimed. Vercel project domain is already verified and DNS resolves to Vercel, confirmed by read-only inspection. Final hosted browser/runtime/restore/full module release gates remain open until recorded below.


Current checkpoint —22 November2026: source/test/hosted26 reviewed matching journal hashes through0025; attendance0026 is a local unapplied draft. Hosted owner/admin full browser and API checks pass using a local production artifact and restricted TLS transaction pooler after observed acquisition timeout led to bounded pool2. Original owner hash/ID preserved. User imported14 provider vars into production and preview and pushed c0e85c0; domain Ready is not final release evidence. Isolate previews before treating them as safe testing targets. Retained Hanova setup/removal of other gyms is expressly requested but not executed yet. Restore rehearsal/full CRM release are not complete.

22 November2026 attendance addition: sourceGYM, isolatedgym_test and hostedSupabase now28 reviewed migration entries through0027_attendance_security, all applied hashes compared. Source/host addition was guarded against exact database identity and previous26 hashes; no reset/data rewrite. Retained baseline backups remain private. This additive schema check does not complete restore rehearsal or full release gates.
