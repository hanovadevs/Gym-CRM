# Decision log

Append decisions; supersede rather than silently rewriting history. Proposed engineering defaults do not mean the user explicitly chose each library.

| ID | Date | Status | Decision / consequence |
| --- | --- | --- | --- |
| ADR-001 | 2026-11-20 | USER_CONFIRMED | Local PostgreSQL now, easy Supabase move later; no local cloud requirement |
| ADR-002 | 2026-11-20 | PROPOSED | Next.js/TypeScript modular monolith; inspect existing repo first |
| ADR-003 | 2026-11-20 | PROPOSED | Drizzle/node-postgres with committed SQL; portable DB access |
| ADR-004 | 2026-11-20 | PROPOSED | Better Auth app tables; database-host move does not replace auth |
| ADR-005 | 2026-11-20 | DESIGN_DIRECTION | White/sage rounded reference, minimal icons; written rules fix image data errors |
| ADR-006 | 2026-11-20 | PROPOSED | Tenant isolation day one, one visible branch initially |
| ADR-007 | 2026-11-20 | PROPOSED | Minor-unit money, date ranges, UTC events/local reports |
| ADR-008 | 2026-11-20 | PROPOSED | Manual payments first; gateways deferred |
| ADR-009 | 2026-11-20 | PROPOSED | Core Release A then expanded modules |
| ADR-010 | 2026-11-20 | PROPOSED | gym/app_auth app schemas; no Data API or auth.uid dependency |
| ADR-011 | 2026-11-20 | OPEN | Inspect local/target PG versions before cloud rehearsal |

Entry template:

```text
ID/title:
Date/time/time zone:
Status: proposed / accepted / superseded
Context:
Decision and authorization:
Alternatives and reason:
Behavior/schema/security consequences:
Affected tasks/files:
Validation/follow-up:
```

Record exact package/tool versions after inspection, not guessed values. Nothing here proves a package installed, login worked or data migrated.

## ADR-012 — Foundation stack accepted after repository audit

Date: 20 November 2026, Asia/Karachi. Status: ACCEPTED. Supersedes proposed status of ADR-002/003 for the foundation; ADR-004 remains selected for future auth workflows, not an implemented login.

There was no application or package manager to preserve. Adopted a modular Next.js App Router application with TypeScript, Tailwind PostCSS and semantic shared CSS tokens. System Arial/Helvetica avoids runtime font downloads. Runtime dependencies pinned exactly: Next 16.4.6; React/React DOM 19.3.1; Drizzle ORM 0.45.4; pg 8.23.1; Better Auth 1.7.27; Zod 4.6.7; dotenv 18.0.10; server-only 0.0.1. Tooling: TypeScript 6.0.3, Tailwind/PostCSS 4.3.5, Drizzle Kit 0.31.11, ESLint 9.39.5 with eslint-config-next 16.4.6, Vitest 5.1.1, Playwright 1.65.1, tsx 4.23.15, Prettier 3.10.1. Complete pinned type-package versions are in package.json/package-lock.json. Workstation Node 24.19.0/npm 11.17.0.

Official sources checked: https://nextjs.org/docs/app/getting-started/installation ; https://orm.drizzle.team/docs/get-started/postgresql-new ; https://better-auth.com/docs/adapters/drizzle . Installed Next routing, server/client-component and devIndicators guides were also read. Current Drizzle web examples suggest release candidates; stable 0.45.4/0.31.11 were retained and verified via generated SQL, real migrations and adapter checks. No guessed prerelease APIs adopted.

## ADR-013 — Safe local database baseline

Date: 20 November 2026, Asia/Karachi. Status: ACCEPTED under the user's authorization to use local PostgreSQL. Source server is PostgreSQL 18.4; GYM had no user tables. Created distinct generated-password gym_runtime and gym_migrator login roles plus isolated gym_test. Runtime owns no application tables and cannot create tables or bypass RLS. Migration credentials never enter application runtime setup. Local secrets are ignored in .env.local; no supplied password is written in source or docs.

Applied reviewed generated migration 0000_aberrant_vance_astro and custom 0001_tenant_security to GYM and empty gym_test. Namespaces gym/app_auth/drizzle; no Supabase API, managed auth, extensions, Docker or external infrastructure. Auth table mapping derives from installed Better Auth getAuthTables({}); real installed adapter create/read was tested against app_auth under runtime credentials. No public auth route, owner account or staff session exists yet. Active membership/action/branch checks and narrowly scoped staff-directory bootstrap belong to AUTH-01/SEC-01. Runtime RLS is tenant defense in depth, not a substitute for those checks. No new migration should edit these applied files.

## ADR-014 — Honest reference dashboard preview

Date: 20 November 2026, Asia/Karachi. Status: ACCEPTED. M00 is a visibly fictional development preview, not M07 dashboard completion. Explicit DEMO_MODE is mandatory; APP_ENV=production or NODE_ENV=production with fixtures is rejected. With preview disabled, an unavailable-workspace message is rendered. There is no database-error fixture fallback.

Retained the reference's white/sage/charcoal structure and panels. Sidebar future modules are disabled in this preview; no disconnected routes. Used working scoped demo-member lookup in the recent-member panel instead of fake universal header search. Single branch is plain context. Classes show an honest future-module empty state. Friday chart check-ins match the daily metric; future days are blank. No invented percentage trends. Date is fixed to the fictional fixture snapshot, 20 November 2026, Asia/Karachi. Actual operations will use gym-local dates and authorized data later.

## ADR-015 — Verification tooling and dependency remediation

Date: 20 November 2026, Asia/Karachi. Status: ACCEPTED. Browser tests start their own loopback server on port 3100 and never silently reuse another application. Direct Next CLI invocation avoids an orphaned npm wrapper on Windows. Wait for actual client interactions before screenshots, so screenshot caret styling does not produce a hydration warning. Native modal dialogs close before trigger-focus restoration; an explicit Tab loop preserves focus when only one control is enabled.

Initial npm audit found four moderate entries through Drizzle Kit's old esbuild-kit nested esbuild. Added a narrow override for @esbuild-kit/core-utils → esbuild 0.25.12; retained stable Drizzle Kit instead of accepting npm's proposed incompatible downgrade. Advisory checked: https://github.com/advisories/GHSA-67mh-4wv8-2f99 . Verified Drizzle generation still reports no schema changes and npm audit now reports zero vulnerabilities. npm reported legacy esbuild-kit/ESLint support warnings; no audit vulnerability remains. Recheck tooling compatibility on upgrades.

## ADR-016 — User-requested section help and uncluttered labels

20 November 2026, Asia/Karachi. ACCEPTED. The user explicitly overrides the original persistent Demo badge requirement: remove Demo indicators everywhere and use small info icons for each section, with no blinking dots or replacement decorative indicators. Removed the header badge, sidebar preview label, repeated preview banners and demo wording in search/empty-state copy. Nine dashboard section buttons explain metrics, illustrative records and workflow availability; Account access has the same shared component. Native popovers support keyboard/touch, Escape and light dismissal. Business statuses (Active, renewal dates) remain meaningful text, not decoration. Fixture-mode configuration and production prohibition stay in place. This supersedes ADR-014 only for presentation; no fake persistence is introduced.

## ADR-017 — Local authentication lifecycle

20 November 2026, Asia/Karachi. ACCEPTED. Implemented Better Auth 1.7.27 with the existing restricted runtime role and app_auth mapping. /api/auth/[...all] disables public signup, validates trusted origin, uses library password hashing, hashed recovery identifiers, 30-minute reset expiry, 8-hour sessions without cookie cache, reset-driven session revocation and library throttling. Configuration is initialized lazily on requests so production build inspection does not activate local fixture configuration.

CLI-only auth:bootstrap provisions first identity/org/main branch/owner/grant in one administrative transaction, with advisory serialization and refusal when any organization exists. Signup is enabled only in this unexposed setup instance, not HTTP. No actual owner identity or password was invented for GYM. Use chosen owner inputs in README instructions. Tests create and clean fictional accounts only in gym_test.

Local recovery writes private .local/mail files outside public/ and Git; no external messages sent. The real browser test follows that captured link and resets the password. Production delivery deliberately fails until a real adapter is configured; live email remains a release blocker. /workspace validates the actual database session and shows identity only. Organization/active membership/action/branch authorization belongs to SEC-01 before any business data is exposed. Local shared per-path rate buckets are a single-process baseline; distributed/live throttling needs deployment review. Official Next/Better Auth integration and email-password documentation were checked; relevant installed types/schema contracts were inspected.

## ADR-018 — Ongoing GitHub progress updates

20 November 2026, Asia/Karachi. USER_CONFIRMED. User supplied https://github.com/hanovadevs/Gym-CRM and requested ongoing updates. origin points there, main tracks origin/main. Push verified coherent milestones, including current tracker/handoff evidence; retain secrets/recovery capture exclusions. No force-push or public app deployment is authorized by source publishing.

Initial large smart-HTTP upload stalled. Authenticated repository API published the verified snapshot, and five remaining original references were sent as individual small Git commits. Blob-free metadata fetch avoided re-transferring local content. All 98 tracked files were verified by identical local/remote tree hashes before reconciling histories with a merge. Both original local development history and published history are retained. Reconciliation commit 8c680d4 was pushed successfully. Local Git uses HTTP/1.1, buffered uploads and a low-speed timeout for reliability; ordinary incremental pushes then succeeded. No credentials printed, committed or placed in public files. Temporary publishing helpers stayed in ignored .local and are removed after completion.

## ADR-019 — SEC-01 authorization boundary and directory bootstrap

20 November 2026, Asia/Karachi. ACCEPTED. Protected operations use server-only createSecurity/run through getSecurity. Each call validates a current Better Auth session, strictly validates untrusted organization/branch selectors, resolves the caller's accessible memberships, and checks the active membership/role/action inside one checked-out database transaction. Tenant context uses parameterized set_config with is_local=true; business queries use that same client. No session-wide SET, browser SQL, user-editable role metadata or Supabase auth dependency.

Migration 0002_staff_directory adds a narrow SECURITY DEFINER lookup owned by gym_migrator. It returns organization ID/name and membership ID only for the supplied caller ID. The caller ID is always derived from the authenticated server session, never an HTTP parameter. The function has a fixed pg_catalog,pg_temp search_path with fully qualified app tables; PUBLIC execute is revoked and only gym_runtime receives execution. General business tables remain under their existing tenant RLS. This is a trusted-server bootstrap, not a defense against arbitrary SQL after runtime credentials are compromised.

Migration 0003_accessible_directory filters out memberships with no active permitted branch, so losing the first gym's final branch grant cannot lock a multi-gym user out of another permitted gym. 0002 had already been applied during the slice; it was preserved and the refinement shipped as a separate reviewed migration. Both were applied to GYM/gym_test; neither 0000 nor 0001 was edited. Both databases now have four journal entries.

Owners are explicitly organization-wide over active branches. Manager/receptionist/trainer/accountant require explicit active branch grants. A selected branch narrows the current query; unknown, inactive or unauthorized gyms/branches yield the same NOT_FOUND result. Membership and branch/grant rows are held with shared locks during operations, serializing revocation with work already authorized; the next operation observes the change. The real PostgreSQL test verifies blocking via pg_blocking_pids, subsequent denial, rollback and connection reuse with pool max=1.

The permission matrix in src/server/security/permissions.ts is the shared coarse action boundary. Only owners may invoke billing.adjust or staff.manage. Trainer assignment-specific filtering, member/finance ownership checks, settings field-level limits, owner safeguards, exports and file authorization remain requirements of their later module services. Future repositories must filter Scope.branchIds; RLS adds tenant protection, not automatic branch filtering. Do not treat the generic transaction callback as a public interface or accept a Scope/action/caller ID from a browser.

Workspace UI and GET /api/workspace now share this boundary. API returns sanitized DTOs, request IDs and no-store responses; invalid selectors, missing sessions, forbidden access and unknown resources map to 422/401/403/404. POST is unavailable (405); no fictional staff/refund mutation endpoints were created to claim authorization completion. The workspace reads real org/branch/role records, supports permitted gym/branch selection and has a non-disclosing access-denied state. Public /dashboard still contains only the production-guarded fictional preview.

References inspected: installed Next route-handler and streaming redirect guides; PostgreSQL 18 CREATE FUNCTION and set_config documentation at https://www.postgresql.org/docs/18/sql-createfunction.html and https://www.postgresql.org/docs/18/functions-admin.html . No packages or database extensions added.

Additional SEC-01 runtime safeguard: each protected transaction validates actual connection privileges and rejects an overprivileged/owner runtime configuration rather than relying on the expected DATABASE_URL username. The integration suite proves rejection using real migration credentials. Runtime credentials are never replaced automatically on failure.

## ADR-020 — Versioned settings and controlled staff administration

20 November 2026, Asia/Karachi. ACCEPTED for SET-01. Reused the existing Next/Drizzle/pg/Better Auth stack and pinned lockfile; no packages, external services or cloud dependencies added. Generated and reviewed 0004_settings_staff_audit plus custom 0005_settings_audit_security, then applied both to GYM and gym_test. Prior applied migrations remain unchanged. Organization contact/receipt/policy fields and organization/staff/branch versions are additive. Defaults: paid initial activation, zero expiry grace and separately disabled debt blocking, consistent with the written access rules; services must consume these settings when enrollment/attendance are implemented.

Every settings/staff/branch mutation uses a fixed server action through the existing authorization transaction, strict Zod allowlists, validated versions and required bounded reason. Managers can update only phone, gym email, address and receipt footer; owners control branding, currency/locale/time zone and access policy. Settings reads are owner/manager only. Accountants will read receipt presentation through authorized billing DTOs when billing exists; the administrative settings/staff feed is not exposed. Administrative activity here is owner-only; operational/financial scoped audit views belong to the corresponding modules.

An organization advisory transaction lock is acquired before membership/branch share locks for administrative writes. This serializes last-owner/last-branch checks and avoids two owners holding each other's share lock while demoting themselves. Fresh membership checks happen after the mutex, so waiting writers cannot retain revoked privileges. Staff creation also locks the normalized email across organizations. All branch IDs resolve under tenant RLS. Version checks reject stale forms rather than silently overwriting. Real stale-save, duplicate-account and concurrent owner-demotion tests passed.

New staff use a server-only, unexposed Better Auth provisioning instance on the same transaction client (autoSignIn false); auth identity, password credential, membership, grants and audit commit together. Public HTTP signup stays disabled. Existing global accounts cannot be attached or have credentials replaced by another gym's owner; a consent-based invitation/join flow is deferred with R04. Initial credentials are owner-chosen; no external email is sent or claimed. Normal recovery remains the existing maintained lifecycle.

Audit records include actor, organization, request ID, UTC timestamp, action, entity, reason and limited before/after JSON. Passwords and contact values are excluded from payloads; settings audit records version and changed field names. Runtime may SELECT/INSERT under tenant RLS and cannot UPDATE/DELETE audit rows. Audit failure aborts the entire mutation, including identity creation. Controlled initial-owner bootstrap now records organization.bootstrap. Migration/admin credentials remain separate and can perform guarded test-fixture cleanup.

Reference adaptation: white/sage panels, editable gym name/derived initials, two-column settings and responsive forms; functional Branches, Team & roles and Activity tabs. Private logo upload awaits IMP-01 instead of a fake upload control. SaaS billing and notifications remain hidden. Receipt display is explicitly a formatting example; financial issuance belongs to PAY-02. Settings name/time zone/currency affect real workspace data now. M02 remains VERIFYING until SUB-01/PAY-02/ATT-01 verify actual policy/receipt consumers. Staff list is bounded to 25/page; activity is explicitly latest 20. Small info buttons explain each section, with no Demo badges or decorative dots.

Official contracts checked: https://orm.drizzle.team/docs/sql-schema-declaration ; https://www.better-auth.com/docs/authentication/email-password ; https://www.postgresql.org/docs/18/explicit-locking.html . Installed Next guides and maintained adapter/configuration contracts were also inspected. Actual real-session/database/browser evidence is in the SET-01 module card and session log.

## ADR-021 — Member registration before enrollment

20 November 2026, Asia/Karachi. ACCEPTED for MEM-01, using the existing pinned stack, local PostgreSQL and shared authorization boundary. New reviewed migrations 0006_member_directory/0007_member_security are additive; prior 0000–0005 preserved. Members are separate business UUID records without an auth account. Registration stores only name, usable phone/email, permitted home branch, joining calendar day, version and actor/UTC events; full profile/emergency contact/notes/archive follow in MEM-02. Registration never creates a membership, invoice or payment. UI therefore shows actual contact/branch/joining data, not invented active/expired/balance/plan columns. Export and future-module controls are hidden.

Member display codes use a fixed M- prefix and per-org atomic bigint counter; UUID IDs remain the permanent identity. Codes may repeat across gyms; used codes remain unique within a gym. Registration, counter and sanitized audit share one transaction. Client-generated registration key is unique per org/actor with a hash of canonical submitted registration fields. Same-key retries return the same authorized member; different fields conflict. This handles an ambiguous/lost response without silently adding another person. The browser test commits through the actual route, drops its response, retries and verifies one member. Financial numbering/idempotency is still separate future work.

Phone normalization removes presentation punctuation and validates 7–15 digits, without guessing country aliases. Email is trimmed/lowercased. Either contact method is required; contacts deliberately are not unique. Possible exact normalized phone/email matches in authorized active branches cause a bounded review/confirmation response, then allow a reasoned shared-contact registration. Sorted contact locks ensure two simultaneous registrations sharing a contact see the first committed member. Existing unchanged family contacts do not prompt again on unrelated edits. No foreign-tenant/unauthorized-branch suggestions are exposed. Contact values are omitted from automatic audit payloads; explicit user reasons remain bounded text.

Directory access uses members.manage (owner/manager/receptionist) plus active org membership and explicit repository branch filters under tenant RLS. Source and destination branches must both be permitted for edits. Trainer/accountant full-contact directory access is denied until assignment/billing-specific DTOs exist. Versioned edits prevent stale overwrite. List counts, clamping and paginated rows use a single statement snapshot; query/sort/page are bounded and sorts allowlisted with stable ID tie breakers. Search escapes literal wildcard characters and stays in component state; only org/branch/order/page are saved in browser URL history. No new database extension, cloud integration or browser SQL.

Reused shared errors/HTTP/audit helpers for both settings and members; existing settings regression suite still passes. Client abort/response guards discard obsolete searches. Failed writes retain inputs; a confirmed save followed by failed refresh hides old results and requires successful reload before editing again. Reused white/sage/charcoal panels, sidebar, drawer and small section info buttons; removed a legacy dashboard search CSS collision during visual review. Applied PostgreSQL and React skill checks; installed Next route/page contracts inspected. Official sources checked: https://orm.drizzle.team/docs/column-types ; https://www.postgresql.org/docs/18/transaction-iso.html ; https://www.postgresql.org/docs/18/functions-matching.html .

## ADR-022 — User-authorized local owner setup

20 November 2026, Asia/Karachi. USER_CONFIRMED: while MEM-01 was active, the user explicitly requested choosing OWNER_NAME/OWNER_EMAIL/GYM_NAME/GYM_SLUG. Chose local-only setup values and generated a strong application password; used the existing controlled auth:bootstrap procedure against previously empty GYM. Maintained auth creates the hash, org, Main branch, active owner/grant and bootstrap audit atomically. Verified actual login, owner workspace and empty authorized member directory, then signed out the verification session. No member fixtures were added to GYM. Credentials were given privately to the user and saved only in ignored .local/owner-access.json; no values/password/default login are published in source. Local-only email does not represent a live delivery mailbox. R04 delivery remains a release blocker. Future sessions must preserve this initialized workspace and never rerun bootstrap or reset it.

## ADR-023 — Exact local origin aliases and sign-in retry feedback

20 November 2026, Asia/Karachi. ACCEPTED to fix the user's observed sign-in failure. Actual local server logs showed 403 Invalid origin for 127.0.0.1 while APP_URL used localhost; repeated requests then reached the unchanged five/minute sign-in limit (429). Initial library-level credential verification passed; the first actual browser flow failed and is not counted as a pass. Added shared trustedOrigins helper: only an explicitly enabled local configuration accepts localhost/127.0.0.1 with the same scheme and configured port. APP_ENV=production or NODE_ENV=production disables aliases. No wildcard host, arbitrary Origin trust or CSRF bypass. Auth and business mutation boundaries use the same policy; sec-fetch-site rejection remains. Both actual local browser addresses then passed owner login, authorized directory/drawer and sign-out without creating members.

The sign-in form now honors the maintained library's X-Retry-After (or standard Retry-After), disables submit during a bounded countdown, retains inputs and never auto-retries credentials. A 403 uses an app-address message rather than incorrectly blaming credentials. No backend rate limit was removed/raised; direct-connection/shared-bucket and future trusted-proxy/distributed deployment concerns remain. Regression coverage includes real alias login/registration, strict production alias rejection, helper boundaries and the countdown's single request/input retention. Official docs and installed code checked: https://better-auth.com/docs/concepts/rate-limit and https://better-auth.com/docs/reference/options .
