# Module tracker

Updated 20 November 2026 (Asia/Karachi): local identity/security and persisted gym/staff administration verified. Member, attendance and financial workflows remain unimplemented.

## State rules

Allowed: NOT_STARTED, IN_PROGRESS, BLOCKED, VERIFYING, DONE, DEFERRED. UI/server/DB/QA are independent. Use N/A only with a documented reason. Overall DONE requires all applicable acceptance criteria, persisted behavior and passing checks with evidence. Do not calculate percentage from route count.

| ID | Module | Release | Dependencies | UI | Server/API | DB | QA | Overall | Next task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M00 | Foundation & shell | A | None | DONE | DONE | N/A | DONE | DONE | MEM-01 |
| M01 | Identity, org isolation & roles | A | M00 + DB-01/02 | DONE | DONE | DONE | VERIFYING | VERIFYING | R04 live mail before release |
| M02 | Settings & staff | A | M01 | DONE | DONE | DONE | VERIFYING | VERIFYING | SET-01 DONE; policy/receipt consumers in SUB-01/PAY-02/ATT-01 |
| M03 | Members & profiles | A | M01 + M02 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | MEM-01 → MEM-02 |
| M04 | Plans & memberships | A | M03 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | PLAN-01 → SUB-01 |
| M05 | Billing, payments & receipts | A | M04 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | PAY-01 → PAY-03 |
| M06 | Attendance & access | A | M04 + M05 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | ATT-01 |
| M07 | Operational dashboard | A | M03 + M05 + M06 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | DASH-01 |
| M08 | Trainers & PT | B | M03 + M02 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | TRN-01 |
| M09 | Classes & bookings | B | M08 + M06 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | CLS-01 |
| M10 | Enquiries & trials | B | M03 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | LEAD-01 |
| M11 | Expenses | A | M02 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | EXP-01 |
| M12 | Reports | A | M05 + M06 + M11 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | RPT-01 |
| M13 | Imports, exports & files | A | M03 + M05 | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | IMP-01 |
| M14 | Release, recovery & migration | A/cloud | Core modules | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | NOT_STARTED | REL-01; DB-MIG-01 later |

## Evidence card template

Module ID:
Implemented behavior:
Routes/files:
Migrations/constraints/permissions:
Connected workflows:
Acceptance passed:
Actual checks: command → result → date
Visual states/evidence paths:
Incomplete criteria:
Blockers/dependency task IDs:
Next exact action:
Last updated/date/time zone:

Before work, mark the selected task IN_PROGRESS. After a slice update each affected layer and its evidence. A finished UI may coexist with NOT_STARTED server/DB. Use VERIFYING for implemented but unverified work; BLOCKED needs an exact cause/unblock action. Record actual commands, not assumptions.

Update backlog and session handoff in the same session. Preserve finished task evidence when later replacing fixtures. M14 needs separate local-release and cloud-migration substates: local readiness does not complete DB-MIG-01. Nothing is DONE from these documents alone.

## M00 evidence — foundation preview

- Routes/files: / redirects to /dashboard; src/components/preview-shell.tsx, dashboard.tsx, ui/primitives.tsx; app loading/error boundaries; server configuration validation.
- UI: reference-style responsive shell, metrics/chart, scoped fixture lookup, empty schedule, drawers and disabled workflow states. Shared field/table/pill/drawer patterns. No actual registration/payment/check-in actions.
- Server/API DONE means foundation routing/configuration only. M00 does not include protected business APIs; see M01/M02 for those services. DB N/A because this module explicitly renders fictional fixtures; schema persistence belongs to M01.
- QA: lint/typecheck/build pass; 4 unit tests, 6 browser tests; visual review of 390/768/1280/1440 captures and mobile drawer. Evidence: doc/evidence/dashboard-*.png, drawer-390.png. See session log for commands and resolved failures.
- Remaining: real aggregates tracked separately as DASH-01/M07; no operational-module completion inferred.

## Historical M01 snapshot — DB-01/02 before auth/security

Current M01 state is recorded in the SEC-01 card below; retain this original database evidence for continuity.

- DB-01/02: PostgreSQL 18.4; GYM and separate gym_test; gym_runtime is not table owner, superuser or BYPASSRLS; gym_migrator owns new schemas/tables. Generated secrets stay ignored.
- Migrations: drizzle/0000_aberrant_vance_astro.sql (core + library-derived auth tables); 0001_tenant_security.sql (runtime grants and tenant policies). Both applied once on empty databases.
- Real DB checks: runtime DDL denied; no tenant context returns no business rows; cross-tenant writes rejected; composite org foreign keys reject cross-gym grants; reused connection clears transaction-local context. Installed Better Auth Drizzle adapter writes/reads app_auth user with runtime credentials. Test fixtures cleaned up/rolled back.
- QA IN_PROGRESS: these DB checks pass, but sessions, revocation, action/branch RBAC, staff-directory bootstrap and complete two-gym application flows do not yet exist. No auth endpoint or owner login is exposed. Overall M01 IN_PROGRESS.
- Next: AUTH-01, then SEC-01. Last updated: 20 November 2026, Asia/Karachi.

## Historical authentication and UI update — before SEC-01, 20 November 2026

AUTH-01: local lifecycle complete; see session log and tests/integration/auth-lifecycle.ts plus tests/e2e/auth.spec.ts. M01 UI/Server/API/QA now IN_PROGRESS, DB remains DONE, overall IN_PROGRESS until SEC-01. Current entry routes /sign-in, /forgot-password, /reset-password, /workspace; latter verifies session but exposes no business data. No actual GYM owner has been provisioned. Info icon presentation supersedes the persistent Demo label at the user's request; fixture mode remains internal and production-guarded. Nine section help popovers tested; current screenshots in doc/evidence/.

## SEC-01 evidence — 20 November 2026, Asia/Karachi

Completed local behavior: server-validated sessions, accessible organization membership bootstrap, explicit RBAC actions, owner-wide vs assigned active branch scope, transaction-local tenant context, fresh membership/grant/role validation and safe permission failures. GET /api/workspace and /workspace use the same server service; actual persisted role/org/branch data replaces the former identity-only workspace. UI adds small information buttons and URL-based permitted selectors; single-branch/gym selectors are hidden.

Files: src/server/security/{service,index,permissions,errors,http}.ts; src/app/api/workspace/route.ts; src/app/workspace/page.tsx; tests/integration/security.ts, tests/helpers/security-fixture.ts, tests/unit/permissions.test.ts, tests/e2e/security.spec.ts. Migrations 0002_staff_directory and 0003_accessible_directory applied to GYM and isolated gym_test. Four total migration entries verified in each database.

Checks: npm.cmd run test:security passes with real Better Auth sessions and restricted PostgreSQL runtime, no mocked identities. Covers two gyms, cross-gym reads/writes, branch tampering, action denial, role changes, grant/membership/branch revocation, expired/forged sessions, multi-gym fallback, fixed function ACL/search_path, shared-lock revocation ordering, rollback and max-1 pooled connection reuse. npm.cmd test: 8 pass. npm.cmd run test:e2e: 16 pass (45.6s final full run). Existing DB/auth integration scripts pass. Lint/typecheck/build pass. Production smoke verifies protected API 401/no-store, sign-in redirect and no configured secrets in client assets. db:generate reports no changes after custom migrations.

Visual evidence: doc/evidence/workspace-{390,768,1280,1440}.png and workspace-forbidden.png; loaded layouts reviewed at all four widths, no page overflow. Screenshot tests explicitly wait for completed navigation/loading before capture. Existing dashboard/auth workflows remain passing.

SEC-01 DONE. M01 local identity/security implementation is complete; module release verification remains VERIFYING because live recovery/invitation email delivery (R04) is not configured/tested. This does not block local SET-01 development. No real GYM owner was auto-created; chosen owner setup remains an onboarding action using auth:bootstrap. No financial/member/export/file workflow is claimed implemented or tested from this slice. Next task SET-01: persisted settings/staff grants/last-owner protections/audit using this boundary.

Final runtime hardening: the authorization transaction refuses roles with superuser/BYPASSRLS, role/database creation, app-schema CREATE or inherited app-table ownership privileges. A real migration-role pool is rejected before protected business queries. The restricted runtime still passes the full real-session security suite and all 16 browser checks.

## SET-01 evidence — 20 November 2026, Asia/Karachi

Implemented configuration/administration slice: validated persisted gym name/contact, currency/locale/time zone, receipt prefix/footer and access/grace/debt policy; version conflicts; reasoned atomic audit; owner-only staff creation/role/grant/active changes and branch management. Last active owner and branch safeguards survive concurrent administration. Manager updates are limited to phone, gym email, address and receipt footer. New accounts use maintained Better Auth signup only in an unexposed server provisioning instance; public signup remains disabled. Existing identities cannot be claimed or reset. Real new-account login and next-operation revocation pass.

Files: src/modules/settings/*; /settings; GET/PATCH /api/settings; POST/PATCH /api/staff and /api/branches; security permissions/administrative lock; controlled owner bootstrap audit. Reviewed migrations 0004_settings_staff_audit and 0005_settings_audit_security applied to both GYM and gym_test, six journal entries each. Runtime audit grants permit SELECT/INSERT under tenant RLS, no UPDATE/DELETE. Audit failure rolls back settings and entire account provisioning. Payloads omit passwords and contact values; reasons and changed field names are retained. Settings, staff and branch version checks prevent stale overwrites.

QA: test:settings passes on actual restricted PostgreSQL with real sessions, two gyms, stale-save/duplicate-provisioning races and concurrent owner demotion. Eleven unit tests pass. Full browser suite: 22 pass; settings-only recapture: 6 pass. Existing DB/auth/security integration suites pass. Lint/typecheck pass. db:generate reports no changes. Visual review: settings at 390/768/1280/1440, team table and narrow owner-protection drawer; loaded screenshots retained in doc/evidence/settings-*.png. Section help icons, tab keyboard navigation, inline validation, permission states, failed-save input retention and committed-save/failed-refresh recovery are connected. No decorative indicators added.

Production build passes. Production smoke: workspace/settings/staff/branch APIs reject anonymous reads/writes with 401/no-store; workspace redirects to sign-in; fixture dashboard disabled; 16 client assets contain no configured database URLs/auth secret. T29–T32 pass within SET-01; T33 remains pending with the listed consumer tasks.

Connected effects: saved name/time zone/currency reach actual authorized workspace data; locale/currency/prefix/footer drive formatting; staff/grant/branch changes affect existing sessions on the next operation. SET-01 configuration task DONE. M02 QA/overall remain VERIFYING for cross-module effects: SUB-01/PAY-02/ATT-01 must consume saved policy and receipt settings and add operational acceptance tests. Those services do not exist yet; no access decision, paid receipt or numbering guarantee is claimed from this page. Logo uploads await private file handling (IMP-01); SaaS billing deferred. Live recovery/invitation mail remains R04, and GYM owner identity must still be chosen through auth:bootstrap. Next eligible local task MEM-01.
