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
| SEC-01 | M01 | AUTH-01 | Org/branch context, RBAC, runtime RLS, two-gym negative checks | NOT_STARTED | None yet |
| SET-01 | M02 | SEC-01 | Persisted settings/staff grants/owner safeguards/audit | NOT_STARTED | None yet |
| MEM-01 | M03 | SET-01 | Persisted list/create/edit/search/registration | NOT_STARTED | None yet |
| MEM-02 | M03 | MEM-01 | Profile/contact/notes scope/archive/required states | NOT_STARTED | None yet |
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
