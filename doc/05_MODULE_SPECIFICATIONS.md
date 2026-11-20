# Module specifications

Read with design, data, business rules, security and tests. Every enabled page needs loading/empty/error/permission/responsive states. A visible page does not prove server/database completion.

## M00 — Foundation and shell

Reference: `references/01_dashboard.png`. Tasks FND-01–03.

Audit repository/tooling; establish tokens, routing, sidebar/header, reusable forms/table/drawer/pills/feedback. Build a faithful dashboard preview with explicit fictional fixture mode. Hide unfinished production navigation.

Acceptance: coherent shared components, usable keyboard/responsive shell, honest demo label, documented tooling and verified baseline. No backend completion claim from this preview.

## M01 — Identity, organization isolation, roles

Reference: `references/13_sign_in.png`. Tasks DB-01/02, AUTH-01, SEC-01.

Email/password login/logout/recovery, controlled staff setup/invitation, session validation/revocation; org/branch context, RBAC, restricted database runtime role and tenant RLS. No public staff signup endpoint.

Acceptance: real session behavior; revoked/unauthenticated users denied; direct forbidden mutations rejected; two gyms cannot cross-read/write/export/download. Missing production email delivery remains a release blocker.

## M02 — Settings and staff

Reference: `references/12_settings.png`. Task SET-01.

Gym branding/contact, currency/locale/time zone, receipt prefix/footer, access/grace/debt rules. Owner manages staff roles and branch grants; prevent self-promotion and last-owner lockout. Hide picker for single branch.

Acceptance: persisted validated settings affect actual behavior; changes audited; direct unauthorized writes denied; stale forms do not overwrite silently. SaaS Billing is deferred, not a requested gateway integration.

## M03 — Members and profiles

References: `references/02_members.png`, `references/03_member_profile.png`. Tasks MEM-01/02.

Search/filter/sort/paginate; add/edit/archive; profile with memberships/visits/payments and scoped operational notes. Registration collects name, usable contact and branch, then connects to enrollment/payment without duplicating either.

Acceptance: persisted directory/detail after reload; org-unique member code; duplicates warned without forbidding legitimate shared family contact; cross-gym codes allowed; fields restricted by role; archive preserves history and blocks access.

## M04 — Plans and memberships

References: `references/04_plans.png`, `references/03_member_profile.png`. Tasks PLAN-01, SUB-01.

Enable/archive plans, create immutable used versions, show price/duration/access clearly; enrollment/renewal/activation/freeze/cancel with exact dates, charge preview and reasons.

Acceptance: old records keep snapshots after price change; concurrent renewals never overlap; calendar/fixed-day rules and leap dates pass; freeze extends once and rejects future-renewal collision. Debt and dates remain separate.

## M05 — Billing, payments, receipts

Reference: `references/06_payments.png`. Tasks PAY-01–03.

Invoice/outstanding lists, payment drawer, partial/full payments, branded printable receipt. Owner-approved refunds/credits and auditable corrections. Every payment appears in member history.

Acceptance: atomic allocations/audit/numbering, no receipt for unpaid invoice, correct balances after refund/credit, capped payments under concurrency and safe retries. Receipt rendering can retry after payment commit without charging again.

## M06 — Attendance and access

Reference: `references/05_attendance.png`. Task ATT-01.

Fast keyboard search/check-in, supported keyboard-scanner/QR token lookup, currently inside/history, checkout; clear eligibility reason and authorized override. Do not claim biometric/turnstile compatibility.

Acceptance: one open visit across branches under duplicate/concurrent scans, safe repeated checkout, correct denied cases, no visit on denial. A member QR ID is a lookup token, not proof of valid access.

## M07 — Dashboard

Reference: `references/01_dashboard.png`. Task DASH-01.

Active members, check-ins, collections, overdue count, weekly activity, recent members, upcoming renewals and functional quick actions. Show classes only when class module is actually enabled.

Acceptance: authorized persisted aggregates reconcile with source lists and local boundaries; no fixtures in production; useful labels/readable chart and restrained density.

## M08 — Trainers and PT

Reference: `references/08_trainers.png`. Task TRN-01. Release B.

Directory, specialties, optional login, member assignments and effective dates, personal-session agenda/availability. Trainer sees own relevant members/sessions and no gym-wide finance.

Acceptance: assignments persist and respect scope; no concurrent trainer scheduling overlaps; inactive trainer behavior clear. A trainer record does not automatically create a staff login.

## M09 — Classes and booking

Reference: `references/07_classes.png`. Task CLS-01. Release B.

Week/day/list timetable, branch/coach filters, create/edit/cancel sessions, capacity and attendee management. Eligible members book/cancel without duplicates.

Acceptance: concurrent last-seat requests cannot overbook; cancellation releases seat; trainer/room conflict handling; adjacent sessions valid; usable keyboard and narrow-screen list alternatives.

## M10 — Enquiries and trials

Reference: `references/09_enquiries.png`. Task LEAD-01. Release B.

Pipeline/list: new/contacted/trial booked/joined/lost; contact/permission, assignee, due follow-up and Mark done. Convert to member with explicit enrollment choice.

Acceptance: persistent stage/task changes, idempotent conversion to one member, retained history and scoped access. No automatic WhatsApp/email sending in this scope.

## M11 — Expenses

Reference: `references/10_expenses.png`. Task EXP-01.

Categories, date/branch filters, cash expense and private receipt attachment. Corrections via reversal/replacement. Upcoming recurrence may be added later; do not auto-post unimplemented schedules.

Acceptance: totals/reversals reconcile, unauthorized users/files denied, amount/date validation, protected swappable storage, expense history not erased.

## M12 — Reports

Reference: `references/11_reports.png`. Task RPT-01.

Overview, collections, membership and attendance reports; date/branch filters and scoped CSV/print export. Label cash flow accurately; show rate denominator/provisional state.

Acceptance: exact reconciliation including refunds/reversals and local boundaries, correct branch attribution, no unauthorized rows/columns in export.

## M13 — Import, export, attachments

Reference: member directory workflow. Task IMP-01.

CSV upload/map/preview, validation and duplicate policy, explicit commit with truthful totals; repeat-safe batch IDs. Scope exports and private downloads. Opening balances use audited invoices, not fake historic payments.

Acceptance: preview writes nothing, repeat commit safe, documented atomic/chunk policy, formula-safe exports, validated uploads/private storage and scoped audit.

## M14 — Release, recovery, future migration

Tasks REL-01 and later DB-MIG-01; no dedicated page.

Repeatable setup, owner onboarding/recovery, production configuration, backup/restore evidence, pilot instructions. Future Supabase migration follows its own runbook without changing auth.

Acceptance: local operating release passes core/security/finance/restore checks. Cloud migration requires actual rehearsal/reconciliation. Track these as separate substates; documentation alone completes neither.
