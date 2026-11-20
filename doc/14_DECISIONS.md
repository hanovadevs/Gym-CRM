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
