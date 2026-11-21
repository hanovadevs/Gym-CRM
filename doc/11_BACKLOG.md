# Task backlog

Initial implementation tasks began NOT_STARTED. Current states below reflect verified evidence. Dependencies and acceptance evidence determine eligibility, not page count. Independent tasks may proceed after prerequisites pass. Expanded Release B can follow the first local pilot.

| Task | Module | Depends on | Outcome | Status | Evidence/blocker |
| --- | --- | --- | --- | --- | --- |
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
| PLAN-01 | M04 | MEM-01 | Immutable plan versions and snapshots | NOT_STARTED | None yet |
| SUB-01 | M04 | PLAN-01 | Enrollment/renewal/freeze/cancel and overlap checks | NOT_STARTED | None yet |
| PAY-01 | M05 | SUB-01 | Invoices/balances/atomic numbering | NOT_STARTED | None yet |
| PAY-02 | M05 | PAY-01 | Partial/full payment/allocation/receipt/activation/retry safety | NOT_STARTED | None yet |
| PAY-03 | M05 | PAY-02 | Owner refunds/credits/corrections/contention checks | NOT_STARTED | None yet |
| ATT-01 | M06 | SUB-01 + PAY-03 | Eligibility/check-in/out/duplicate scan protection | NOT_STARTED | None yet |
| DASH-01 | M07 | MEM-02 + PAY-03 + ATT-01 | Replace fixtures with persisted aggregates | NOT_STARTED | None yet |
| EXP-01 | M11 | SET-01 | Expenses/categories/reversals/private attachments | NOT_STARTED | None yet |
| RPT-01 | M12 | DASH-01 + EXP-01 | Reports and source reconciliation | NOT_STARTED | None yet |
| IMP-01 | M13 | MEM-02 + PAY-03 + EXP-01 | Previewed CSV import/scoped exports/file access/audit | NOT_STARTED | None yet |
| REL-01 | M14 | RPT-01 + IMP-01 | Core acceptance/mail recovery/restore/local pilot | NOT_STARTED | None yet |
| TRN-01 | M08 | MEM-02 + SET-01 | Trainer directory/assignments/PT schedules | NOT_STARTED | None yet |
| CLS-01 | M09 | TRN-01 + ATT-01 | Timetable/bookings/capacity/trainer-room contention | NOT_STARTED | None yet |
| LEAD-01 | M10 | MEM-02 | Pipeline/trials/follow-ups/idempotent conversion | NOT_STARTED | None yet |
| DB-MIG-01 | M14 | REL-01 + authorized target | Future Supabase rehearsal/reconciliation/cutover plan | NOT_STARTED | None yet |
| MAIL-01 | M01 | AUTH-01 + SET-01 | Fixed-sender SMTP recovery/invitation delivery and verification | DONE | TLS auth + actual INBOX recovery receipt/reset/reuse denial; transactional invitations and safe delivery status tested; owner unchanged |

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
