# Task backlog

Initial implementation tasks began NOT_STARTED. Current states below reflect verified evidence. Dependencies and acceptance evidence determine eligibility, not page count. Independent tasks may proceed after prerequisites pass. Expanded Release B can follow the first local pilot.

| Task | Module | Depends on | Outcome | Status | Evidence/blocker |
| --- | --- | --- | --- | --- | --- |
| PERF-02 | M00/M01 | SEC-01 | Reduce hosted query latency without stale authorization | DONE | Reuse locked request-local records, workspace14 to10 queries; identicalDTO, hosted pooler5samples median3513 to2497ms; security/platform/full72 browsers/build/hosted production checks PASS; broader performance tuning remains ongoing |
| ADMIN-02 | M00/M15 | PLAT-01 | Workspace launchpad and platform console redesign | DONE | Role-aware client workflow cards, platform rail/counts/contact inspector/manual refresh/responsive gym cards; responsive mobile cards, full72 browser/build/hosted checks PASS; further admin scenarios stay in future scope |
| UI-05 | M00 + all implemented modules | ADMIN-02 | Dashboard default and compact mobile/tablet shell, bottom navigation and responsive workflows | DONE | Full73 browsers5.7m, final3 populatedplan/profile/32route-width checks1.4m,40units/lint/typecheck/build/production/hosted PASS; responsive labels/cards, role/branch-aware bottomnav/More; desktop/theme preserved; no DB changes |
| ADMIN-03 | M15 | ADMIN-02 + UI-05 | Direct suspension/reactivation and scoped gym analytics | DONE | Real financial/source/negative/context checks,3browser+finalanalyticsrecapture,40units/lint/typecheck/build/production/hostedHanova checks PASS; no migration |
| PBILL-01 | M15 | ADMIN-03 | Gym-to-platform monthly charges, payments and paid/unpaid status | DONE | 0033/0034 immutable platformledger + service/API/UI implemented; test:platform,4 focused browser tests,40units,typecheck/lint PASS; source/hosted35 hashes verified after private backup. Full75 browsers4.1m, production build/401/client-secret checks, actual hosted Hanova no-charge/form/analytics reconciliation PASS. No invented Hanova fee |
| HR-01 | M08/M11 | PBILL-01 + trainer profiles | Employee/trainer profiles and monthly salary rates, payroll payments and history | DONE | 0035/0036 reviewed employee/payroll schema + authorized service/API/UI implemented; test:payroll and focusedbrowser PASS, one bounded SQL screen snapshot; full77 browsers4.5m/40units/typecheck/lint/drift/build/production32assets/actualhosted Hanova PASS;5 retainedwalkthrough employees/monthlydues/partialfullpayments/correction. No automatic wages or transfers |
| AUTH-02 | M01/M02/M15 | PLAT-01 | Separate gym login identifier from real owner recovery/notification email | DONE | 0039-0041 committed and applied all3DB42; real owner-contact service/UI, maintained recovery browser and hosted Hanova contact/login preservation verified; full78 browsers3.8m and actual live owner-contact/login/settings checks PASS at f439a4f |
| MEM-03 | M03/M04/M05/M07 | MEM-02 + SUB-01 + PAY-01 | Owner-set monthly fees/start date during registration, member billing timeline and upcoming fee reminders | DONE | Owner registration/atomic invoice, saved-rate renewals/repricing/catalog opt-out, profile timeline/owner schedule/dashboard, daily deduplicated real-owner digest and safe retry implemented; all3DB49, integration/full79/focused15/production/hosted retained examples PASS; live2d37789, InboxUID63 actual owner delivery and authenticated cron no-duplicate PASS |
| UI-06 | M00 + implemented modules | UI-05 | Final shared visual hierarchy, compact mobile filters/record actions, reachable drawers and all-page review | DONE | Shared polish/tablet calendar/billing help/punctuation fixes; final focused4+strict1 PASS after full79PASS/1corrected drawer assertion.40units/typecheck/lint/build/production PASS. Canonical live63603f9 actual17Hanova/admin routes x320/390/768/1440 and flush opaque drawer PASS, no client errors/overflow/business writes/mail |
| DOC-PRODUCT-01 | Product documentation | Current module tracker | Agent-ready Mojym product handoff and How to use website guide | DONE | doc/MOJYM_WEBSITE_PRODUCT_HANDOFF.md plus MOJYM_HOW_TO_USE_WEBSITE_GUIDE.md; linked website pages requested; full current workflow steps/troubleshooting and public copy/FAQ/assets/SEO/agent brief, explicit unfinished scope and commercial claim limits;4asset paths/UTF-8/diff verified. No website changes |
| UI-07 | M00 | UI-06 | Public Mojym overview, how-to and assisted registration | DONE | Production build and visitor browser flow PASS at 320/390/768/1440 with four loaded screenshots and verified navigation |
| FND-01 | M00 | None | Audit repo/tooling/local PG; record baseline/version choices | DONE | doc/20_FOUNDATION_AUDIT.md; empty baseline, Node/npm/PG discovery verified |
| FND-02 | M00 | FND-01 | Adapt/init app, strict types, scripts, lockfile, env validation | DONE | Locked Next/TS/Tailwind app; env validation; lint/typecheck/unit/build pass |
| FND-03 | M00 | FND-02 | Reference shell/primitives and labeled fixture dashboard | DONE | Shared preview shell/primitives, explicit fixtures; 6 browser tests pass; doc/evidence/ |
| DB-01 | M01 | FND-02 | Discover local PG; safe dev/test roles/schemas/connections | DONE | GYM + isolated gym_test; distinct non-owner runtime/migration roles; restricted-role checks pass |
| DB-02 | M01 | DB-01 | Reviewed initial/core/auth migrations; clean-DB apply | DONE | 0000_aberrant_vance_astro + 0001_tenant_security applied to both DBs; FK/RLS/auth adapter checks pass |
| AUTH-01 | M01 | DB-02 | Real staff login/logout/recovery/provisioning; no public signup | DONE | Local lifecycle DB/browser checks pass; real owner setup requires chosen identity |
| SEC-01 | M01 | AUTH-01 | Org/branch context, RBAC, runtime RLS, two-gym negative checks | DONE | Real session/DB/browser isolation and revocation pass; 0002/0003; next SET-01 |
| SET-01 | M02 | SEC-01 | Persisted settings/staff grants/owner safeguards/audit | DONE | Real persistence/RBAC/audit rollback/concurrency pass; 0004/0005; 22 browser tests; M02 operational consumers remain VERIFYING |
| MEM-01 | M03 | SET-01 | Persisted list/create/edit/search/registration | DONE | 0006/0007; scoped real-session DB suite, 15 unit and 30 browser checks pass; member code/retry/audit concurrency verified |
| MEM-02 | M03 | MEM-01 | Profile/contact/notes scope/archive/required states | DONE | Real profile/contact/notes/archive suite; 36 browser tests; 0008/0009; future histories/access integration in SUB/PAY/ATT |
| PLAN-01 | M04 | MEM-01 | Immutable plan versions and snapshots | DONE | 0010/0011; scoped immutable catalog/snapshot contract; 43 browser/24 unit + DB suite; build/production PASS; next SUB-01 |
| SUB-01 | M04 | PLAN-01 | Enrollment/renewal/freeze/cancel and overlap checks | DONE | 0012–0014; atomic enrollment invoice/snapshot/audit, policy/lifecycle/overlap/replay verified; 52 browser/30 unit and real-DB regression PASS; final gates in session log |
| PAY-01 | M05 | SUB-01 | Invoices/balances/atomic numbering | DONE | 0015–0017; scoped draft/issue/lines/balances/numbering and private invoice PDF; 59 browser/35 unit + real-DB regression/build/production PDF PASS |
| PAY-02 | M05 | PAY-01 | Partial/full payment/allocation/receipt/activation/retry safety | DONE | 0018/0019; atomic collection, immutable paid receipts/print/PDF, valid activation; 64 browser/36 units + serial real-DB/production checks PASS |
| PAY-03 | M05 | PAY-02 | Owner refunds/credits/corrections/contention checks | DONE | Reviewed 0020–0022, raw DB caps/immutability, two correction browsers and production refund/credit/void/PDF flow pass; corrected void header rendered/reviewed |
| ATT-01 | M06 | SUB-01 + PAY-03 | Eligibility/check-in/out/duplicate scan protection | DONE | Reviewed0026/0027 all3 DBs28; acceptance DB suite, full68 browsers, independent downloaded QR decode, responsive review and actual production attendance/replay/checkout/private QR PASS |
| DASH-01 | M07 | MEM-02 + PAY-03 + ATT-01 | Replace fixtures with persisted aggregates | DONE | One-snapshot persisted branch/local-date aggregates, refund/currency/source reconciliation, role limits;10 focused browsers/40 units/production/hosted checks and four widths PASS |
| EXP-01 | M11 | SET-01 | Expenses/categories/reversals/private attachments | DONE | Reviewed0028/0029 all3 DBs30; real service/raw finance/file/cleanup checks, full72 browsers, production nativeimage/ledger/private download and hosted page/API PASS |
| RPT-01 | M12 | DASH-01 + EXP-01 | Reports and source reconciliation | NOT_STARTED | None yet |
| IMP-01 | M13 | MEM-02 + PAY-03 + EXP-01 | Previewed CSV import/scoped exports/file access/audit | IN_PROGRESS | Private image receipts/storage/authorization/maintenance verified with EXP-01; CSV preview/import/exports remain unimplemented |
| REL-01 | M14 | RPT-01 + IMP-01 | Core acceptance/mail recovery/restore/local pilot | NOT_STARTED | None yet |
| TRN-01 | M08 | MEM-02 + SET-01 | Trainer directory/assignments/PT schedules | DONE | Directory/availability/effective assignments/eligible PT service/API/UI, branch/own-trainer scope and conflicts verified; all3DB50, integration/full80 browsers/build/production PASS; retained Hanova3assignments/6sessions/1cancellation and canonical live PASS2612d67 |
| CLS-01 | M09 | Trainer profiles/shared resource guards + ATT-01 | Timetable/bookings/capacity/trainer-room contention | DONE | 0037/0038 applied all3DB39 before AUTH42; timetable/resources/availability/rosters/dashboard, UTC integration races, full78/focused12 browsers and actual hosted53steps PASS; actual live53step retained class/booking/dashboard/mobile verification PASS at f439a4f |
| LEAD-01 | M10 | MEM-02 | Pipeline/trials/follow-ups/idempotent conversion | NOT_STARTED | None yet |
| DB-MIG-01 | M14 | REL-01 + authorized target | Supabase reconciliation and host change | VERIFYING | Authorized hosted configuration; initialized workspace copied and hashes reconciled, restricted TLS/pooler verified; application/restore/release gates remain |
| MAIL-01 | M01 | AUTH-01 + SET-01 | Fixed-sender SMTP recovery/invitation delivery and verification | DONE | TLS auth + actual INBOX recovery receipt/reset/reuse denial; transactional invitations and safe delivery status tested; owner unchanged |
| UI-03 | M00 | PLAN-01 | Icon sidebar with desktop collapse and accessible mobile navigation | DONE | Shared live/preview sidebar; desktop clearance/persistence, mobile focus/Escape/routes and final regression PASS; reviewed retained evidence |
| UI-04 | M00 | UI-03 | Silver & Midnight theme, liquid glass surfaces and sharp buttons across app | DONE | Shared palette/glass/square controls, four widths, reduced-transparency/print/focus/regression and production captures verified; ADR-030 |

## Task evidence card

Task ID/module:
Status:
Acceptance scenarios/test IDs:
Dependencies verified:
Implementation files/migrations:
Actual checks/results:
Visual/manual evidence:
Remaining work/blocker:
Next action:

New requests get task IDs/module/dependencies. BLOCKED means the exact missing input is documented; move to another eligible task rather than calling fixtures DONE. Keep completed evidence. Map tasks to full module criteria, not only one-line outcomes.



## Foundation verification — 20 November 2026, Asia/Karachi

FND-01–03 are complete within M00 preview scope; persistence is not applicable to fictional dashboard data. DB-01/02 persist the initial schema, not operational CRM behavior. AUTH-01 and SEC-01 remain NOT_STARTED. No owner account was seeded.

Checks: npm.cmd run lint (0 errors/warnings); npm.cmd run typecheck (pass); npm.cmd test (4 pass); npm.cmd run test:integration (both real-PostgreSQL scripts pass); npm.cmd run test:e2e (6 pass); npm.cmd run build (pass); npm.cmd run db:generate (no changes); npm.cmd audit (0 vulnerabilities). Final contrast-only drawer change: mobile browser test rerun, 1 pass. Full command history/corrections in session log.

| Task | Module | Depends on | Outcome | Status | Evidence/blocker |
| --- | --- | --- | --- | --- | --- |
| QA-FND-01 | M00 | FND-03 | User-requested implementation/UI bug review | DONE | Fixed drawer focus restoration/trap, config error handling and production demo guard; screenshots at 4 widths and clean browser runtime check |

Next: AUTH-01 controlled owner setup, actual sign-in/logout/recovery with no public signup; then SEC-01 session/org/branch scope and membership-directory bootstrap.


| UI-02 | M00 | FND-03 | Remove Demo indicators; accessible section info icons | DONE | 9 dashboard popovers; keyboard/Escape and no-Demo-text browser check pass; ADR-016 |

AUTH-01 verification: real DB lifecycle and 13-browser-test suite pass; local recovery capture/reset UI verified. No real owner auto-created; run auth:bootstrap with chosen identity. Production mail is still a release blocker. Next SEC-01.


## SEC-01 evidence card

Status: DONE (local service/security scope). Dependencies AUTH-01/DB-01/02 verified. Implementation: src/server/security/*, /workspace, GET /api/workspace; migrations 0002_staff_directory and 0003_accessible_directory. Acceptance checks T01–T06 within existing operations pass; future member/finance/file/export routes must add module-specific tests when implemented, not inherit a claimed pass.

Actual checks: test:security passes against real gym_test with a max-1 runtime pool and real sessions; test:unit 8 pass; test:e2e 16 pass; lint/typecheck/build/production smoke pass; baseline database/auth integration pass; db:generate no changes. Role/grant/membership revocation is rechecked while cookies remain valid, branch scope is enforced by the workspace repository, no-context direct business access is denied, and cross-tenant mutation attempts affect zero rows. Shared-lock revocation ordering verified on actual PostgreSQL. See module card and session log for files/evidence/limits. Next eligible local task: SET-01.
## SET-01 evidence card

Status: DONE for persisted configuration and staff/branch administration. SEC-01 dependency verified. Implementation: src/modules/settings/*, /settings, /api/settings, /api/staff, /api/branches; schema/migrations 0004_settings_staff_audit and 0005_settings_audit_security; audit on first-owner bootstrap. Actual saved branding/context reaches /workspace; configured receipt format appears after reload. Access policy is stored for future consumers. Owner-only staff/branch writes, manager field allowlist, version conflict detection and reasoned atomic audit are enforced server-side.

Checks: test:settings PASS (real PostgreSQL/sessions, two gyms, maintained account hash/login, live role/grant/branch revocation, foreign IDs/forbidden changes, last-owner/last-branch guards, audit denial rollback, concurrent stale writes/account creation/owner demotion). Unit 11 PASS; full browser 22 PASS (59.6s), settings-only recapture 6 PASS (32.3s); existing DB/auth/security suites PASS; lint/typecheck/build/production smoke PASS; db:generate no changes. Six migration journal entries in GYM and gym_test; both organization counts zero after fixture cleanup. Responsive screenshots reviewed in doc/evidence/settings-*.png, including four widths, branches/team/activity and mobile owner guard. Browser failure tests retain inputs and require reload when the commit succeeded but refresh failed.

Remaining: M02 QA/overall VERIFYING for SUB-01/PAY-02/ATT-01 policy/receipt consumption. No paid receipt or attendance decision exists yet. Private logo upload deferred to IMP-01; SaaS billing deferred. Existing-account consent/invitations and actual recovery mail remain R04. No real owner credential invented. Next eligible task MEM-01: scoped persisted member directory/create/edit/search/registration; see M03 and references/02_members.png.

## MEM-01 evidence card

Status: DONE for persisted member directory/registration/basic contact edit. Prerequisite SET-01 verified. M03 stays IN_PROGRESS for MEM-02 profiles/contacts/notes/archive. Files: src/modules/members/*, /members, GET/POST/PATCH /api/members, shared workspace frame/HTTP/errors/audit, scoped navigation. Migrations 0006_member_directory/0007_member_security, applied to GYM and gym_test (8 entries each). No prior migration edits or valued data resets.

Acceptance: T07 plus relevant T01–T06/T24–T25/T34–T37 pass for existing member operations. Real persisted data after reload; UUID identity/org-unique atomic code; usable contact/local joining date/branch validation; reasoned scoped family-contact review; unauthorized direct writes and foreign resource IDs rejected; stale forms cannot overwrite; counter/member/audit roll back together; same actor/key replay returns one registration after lost response. Single SQL snapshot keeps pagination/count consistent; latest browser query wins. No enrollment/payment/access/paid receipt is claimed.

Actual checks: test:members PASS with real restricted PostgreSQL/sessions and concurrent registrations/edits; 15 unit tests PASS; full 30-browser-test suite PASS (1.3m). Baseline DB/auth/security/settings suites PASS; lint/typecheck/build PASS; db:generate no changes. Responsive directory/drawer/failure screenshots reviewed at required widths in doc/evidence/members-*.png and member-registration-390.png. User-authorized real owner initialized separately from fictional gym_test fixtures; private credentials never committed. Local alias/origin fix and retry countdown have real-browser and production-boundary evidence (ADR-023). Next exact task MEM-02.

## MEM-02 / MAIL-01 evidence card

Status: DONE for local profiles, notes, archival and account email. Dependencies MEM-01, AUTH-01 and SET-01 verified. Files: src/modules/members/profile*, /members/[id], /api/members/[id] and contact/archive/notes routes; src/server/mail/*, /api/staff/mail, settings/auth integration, scripts/deliver-mail.ts. Reviewed additive migrations 0008_member_profiles_and_mail and 0009_profile_mail_security applied to GYM and gym_test; existing migrations unchanged. ADR-024/025 record scope and operational limits.

Acceptance T38–T41: persisted emergency contacts with stale-version protection; operational vs management note scope including hidden counts/history; idempotent append and immutable reasoned withdrawal; archive/restore preserves history and denies archived edits; branch/tenant/role enforcement and atomic audit rollback. Reference-like overview/notes/history and directory archived filtering work at 390/768/1280/1440, with help icons and retained failure drafts. Future membership/visit/payment history and attendance enforcement await their modules; M03 overall remains VERIFYING for those integrations.

Checks actually run: test:profiles and test:mail PASS against restricted PostgreSQL and maintained real sessions; existing test:members/settings/security/auth/integration PASS. Unit 17 PASS; final full browser suite 36 PASS (1.8m), targeted profile recapture 6 PASS. Lint/typecheck/build/production smoke PASS; 20 client assets checked for configured database/auth/SMTP secrets. db:generate no changes; production dependency audit zero vulnerabilities. Responsive profile and archived screenshots retained in doc/evidence/profile-*.png. Final GYM: 10 migrations, one real organization, zero members/queued mail; gym_test: 10 migrations, zero organizations/members/queued mail after cleanup.

All gyms use fixed contact@hanovadevs.com sender. Recovery and new-staff password setup use maintained single-use tokens; transactional private outbox records survive delivery failure, and ambiguous sends are held without automatic resend. Automated suites capture mail. One actual recovery email reached the supplied mailbox INBOX; its received link reset an isolated test identity and rejected reuse (doc/evidence/mail-delivery.json). Owner login/email/password unchanged by explicit instruction. Deployment scheduling, reachable HTTPS links and production-host delivery remain REL-01; existing-account consent/join is deferred. Next eligible task PLAN-01.

## PLAN-01 evidence card

Branch-scoped persisted catalog at /plans; create, publish immutable versions, history, archive/restore, literal search/branch/status filters and bounded pagination. Owner/manager writes; reception/accountant assigned-branch read-only; trainer denied. Only owners publish all-gym access. Permanent codes/branches and immutable version rows protected by scoped constraints, RLS and column grants. Parent lock/revision and scoped actor/key/hash protect concurrent and lost-response writes. Audit commits atomically. Shared pure snapshot/date/money contract is ready for SUB-01; actual membership/invoice snapshot persistence belongs to SUB-01/PAY-01. No invented members/renewals in the catalog.

Files: src/modules/plans/*, /plans, /api/plans and version-history/archive routes; shared workspace/settings/member navigation; migrations 0010_plan_catalog and 0011_plan_security applied to GYM/gym_test (12 entries). ADR-026. Relevant T42–T44 plus role/tenant/security regression. test:plans PASS with two real gyms/sessions, same codes across gyms, direct RLS denial, scoped roles/branches, currency mismatch, replay/stale/archive races, immutable history/snapshots, forced audit rollback, paging and grant restrictions. Existing profiles/members/settings/security/mail/auth/integration suites PASS serially. Final unit 24 PASS; full browser 43 PASS (2.0m). Final lint/typecheck/build/production smoke PASS, including 21 client asset secret checks. db:generate no changes; audit --omit=dev zero vulnerabilities. Screenshots opened/reviewed at 390/768/1280/1440 and narrow editor: doc/evidence/plans-*.png. Publishing/runtime confirmation in session log. Next eligible task SUB-01.

## SUB-01 / UI-03 task evidence — 21 November 2026, Asia/Karachi

SUB-01 DONE: persisted enrollment/renewal with exact-date/charge review, immutable selected-plan snapshot and atomic issued invoice/counter/audit/request result. Active/pending access, owner/manager reasoned activation with debt, prospective freeze/reversal and effective cancellation; charge history remains intact. Same-key replay cannot duplicate a charge or extension; concurrent distinct-key confirmations/stale versions reject; service and database independently prevent overlap. Archived member/plan, branch, role, origin and tenant boundaries enforced. Actual saved activation/grace/debt policy reaches profile eligibility. Home-branch transfers cannot silently change current/future/grace entitlement attribution.

Files: src/modules/memberships/*, membership API/preview, member profile/directory integration, schema and migrations 0012–0014. Real-DB membership and prior profile/member/plan/settings/security/mail/auth/database suites PASS serially; 30 unit checks PASS; final full 52 browser scenarios PASS. Lint/typecheck PASS; final build/production result in session log. No schema drift; zero production dependency vulnerabilities. All 15 migrations applied to both local databases, prior applied SQL preserved. T45–T47 and related regression checked; attendance/payment settlement remains a later consumer.

UI-03 DONE: shared icon sidebar, expanded/compact desktop modes, saved preference, real permitted navigation and mobile focus/Escape/return-focus behavior. T48 and prior responsive regression pass; geometry checks prevent content being covered. New reviewed screenshots: doc/evidence/membership-*.png and sidebar-*.png. User-approved sidebar override in ADR-028. Captures wait for hydration; layout animation removed after observed resize overlap/overflow.

Next exact task PAY-01, currently IN_PROGRESS only for the enrollment invoice foundation. Complete scoped invoice list/detail/lines and real balance contract/numbering before PAY-02 collection, allocations/paid receipts/automatic activation and PAY-03 corrections. Preserve existing issued enrollment invoices and IDs through additive reviewed migrations. No payment/receipt/credit/refund, check-in or operational dashboard completion claimed. Full module integration gates remain explicit in the tracker.

## PAY-01 task evidence — 21 November 2026, Asia/Karachi

DONE: persisted invoice/outstanding lists, exact line quantities/fixed discounts, unnumbered draft creation/revisions, reasoned review/atomic issuance/numbering/audit/request replay, immutable issued identity/charge and per-currency balances. Historical charge dates/branches preserved; archived members retain history, drafts do not count as debt. Scoped accountant billing uses minimum recipient DTO with no full-profile privilege. Additive 0015–0017 applied to both databases, old 0000–0014 unchanged. Shared balance view already feeds saved debt policy.

User-added PDF requirement DONE: issued invoice Download PDF saves a shareable private attachment with branded bill/recipient details, item charges/discounts/total/outstanding/due date/original membership term when applicable. Permission rechecked; draft 409/anonymous 401; no public link/email or extra charge on retries. PDFKit/fonts pinned and licensed; original financial snapshots survive later name/brand edits. New font assets verified in production trace.

Evidence T49–T51: real-DB billing plus previous module/security/mail/auth suites PASS serially; unit 35 PASS; full browser 59 PASS (2.6m); lint/typecheck/build/anonymous production smoke and actual authenticated production PDF flow PASS. db:generate no drift; audit --omit=dev zero vulnerabilities. Actual page/PDF review and retained files in the module tracker; earlier failures/corrections/current data counts/runtime/publishing in session log. Automated tests capture mail and seed only gym_test. No local blocker. Next PAY-02: exact partial/full manual payments, allocations, committed paid receipts, safe retries and automatic valid membership activation; PAY-03 owner corrections/refunds/credits/void remains separate.


## PAY-02 / UI-04 task evidence

DONE: partial/full manual payments, atomic allocations/audit/receipt numbering/snapshot/member version/eligible paid activation; exact outstanding debt view, currency-separated collections and profile/invoice receipt history. Same-key replay after lost response, changed payload/stale review/overpayment/concurrent caps and direct DB invariants verified. Historical receipt balance and original billing branch/issuer/recipient survive later changes. Current role/branch revocation applies to replay and download. Share via printable/private downloadable paid-receipt PDF; failed rendering cannot charge twice. Saved settings branding consumes real receipt flow.

0018/0019 bring local databases to20 migrations, old0000–0017 unchanged. test:payments plus all previous real-DB suites PASS serially; full64 browsers/36 units PASS; final four focused visual/workflow recaptures PASS; lint/typecheck/build/anonymous production and actual authenticated production payment/receipt/PDF/profile checks PASS. Font traces/private headers, extracted/rendered standard/stress/print PDFs and four-width screenshots retained. UI-04 includes exact supplied palette, readable glass panels/drawers/sidebar, sharp buttons, info icons and no decorative indicators. See module card/session for actual commands, failures/corrections and scope.

Next PAY-03 owner corrections/refunds/credits/void; full M05 remains IN_PROGRESS. Attendance, operational dashboard and release/recovery are separate gates. No external sends, owner-email change, valued-data reset or public deployment.


## Mojym completion programme — 21 November 2026

User authorizes completing all remaining Release A/B CRM modules in one sustained programme, navigation performance, Mojym branding and a separate platform administrator console. Delivery target confirmed: Vercel + hosted PostgreSQL; local GYM remains authoritative until reviewed cutover. No bug-free or production-complete claim without verification.

| Task | Module | Depends on | Outcome | Status | Evidence/blocker |
| --- | --- | --- | --- | --- | --- |
| PERF-01 | M00 | UI-04 | Client navigation, scoped prefetch, shared bounded DB pool; production reload/timing evidence | DONE | Production client transitions/window continuity verified; full64 and post-removal12 browsers pass; shared-pool mail lifetime regression fixed |
| BRAND-01 | M00 | UI-04 | Mojym name, editable twin-arch logo, favicon and consistent UI/mail brand | DONE | Native SVG/PNG mark/wordmark/favicon integrated; production screenshot reviewed, build and browser checks pass |
| PLAT-01 | M15 | SEC-01 + SET-01 | Separately authorized platform admin, create/manage gyms and scoped activity | DONE | Explicit grants, maintained auth, atomic new gym/owner, contacts, suspend/reactivate, activity; isolated DB/browser and production-build hosted admin/owner checks pass |
| REL-02 | M14 | All remaining modules + PLAT-01 | Remove every preview route/content; production Vercel/PostgreSQL release checks | IN_PROGRESS | mojym.hanovadevs.com verified on Vercel; Supabase TLS/runtime/pooler verified and private production import prepared; live env/deploy and remaining modules still open |

Remaining core execution order: PAY-03 -> ATT-01 -> DASH-01; independent EXP-01/TRN-01/LEAD-01; CLS-01 after attendance/trainers; RPT-01/IMP-01 then recovery/release gates. PLAT-01 must use separate platform privileges; gym owner role must never imply cross-gym administrator access. Preserve initialized user data and all applied migrations.

## User-requested client-testing workspace —22 November2026

DATA-01 IN_PROGRESS: retained Hanova owner account and core dataset now created/verified through production services; trainer/class/lead/report/import extensions and final other-gym removal remain. After finishing current verification, audit and complete the full doc scope, then create retained Hanova Fitness Gym in Supabase, owner Ali Haider, supplied gym/owner email, Lahore contact/address and private password. All creation options must be available in the platform console. Populate multiple members and connected plans/enrollments/invoices/payments/receipts, trainers/classes/bookings and other implemented workflows for client demonstration. This is explicitly authorized retained test data, not a disposable automated fixture; do not clean it up later or claim invented people are real customers. User expressly requests removing other gyms. Inventory/backup/reconcile first, verify Hanova workspace/owner before removal, preserve platform administrator and credential separation. Private request inputs must never enter git/audits/logs; no external emails authorized by data population.
