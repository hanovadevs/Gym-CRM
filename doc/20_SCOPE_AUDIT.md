# Mojym scope audit

22 November2026, Asia/Karachi. This is a working acceptance audit against doc/01–12 and the user's subsequent requirements. A route, screenshot or database connection alone does not complete a module. The module tracker/backlog and recorded command results remain authoritative.

| Scope | Implemented evidence | Remaining gate |
| --- | --- | --- |
| Foundation / Mojym / UI | Shared responsive shell, user palette/glass/square buttons, help icons, collapsible sidebar, native SVG/PNG brand, Next client navigation, fictional dashboard removed | Keep new module layouts consistent; actual dashboard still DASH-01 |
| Authentication / tenant security | Maintained Better Auth, login/logout/reset/invitations, fresh role/branch checks, restricted SQL role/RLS, audit and real two-gym tests; hosted owner/admin browser checks pass after bounded pool adjustment | Deployed origin/mail operations/recovery checks |
| Settings / staff | Versioned persisted gym configuration, roles/branches, last-owner controls, fixed mail sender | Actual attendance policy consumer; hosted release/mail maintenance |
| Members / profiles | Registration/directory/search/paging, emergency contact, role-scoped notes/withdrawal, archive/restore, membership/invoice/payment history | Visits/history and actual archived check-in denial; final navigation readiness rerun |
| Plans / memberships | Immutable rates/access/term snapshots, enrollment/renewal, freeze/reversal/cancel, invoice and paid activation | Actual attendance enforcement of all policies |
| Billing / receipts / corrections | Drafts/issue/exact money/numbering, balances, payments/allocations/paid receipts/private PDFs, owner credit/refund/combined/void, immutable history, concurrency/rollback tests; corrected void PDF rendered/reviewed and production flow passes | Reports must include net refunds; final release regression |
| Attendance / access | Eligibility calculation exists in membership services | ATT-01 actual persisted visits, lookup tokens, check-in/out/override and duplicate scan contention |
| Operational dashboard | Preview route removed; protected workspace landing exists | DASH-01 real scoped/local-date aggregates, chart/source reconciliation and useful actions |
| Trainers / personal training | No directory/scheduling implementation | TRN-01 staff-linked or standalone trainer records, assignments, availability, own-trainer scope, conflict-safe PT sessions |
| Classes / booking | No timetable/booking implementation | CLS-01 trainer/room conflicts, capacity, eligibility, bookings/cancellation and last-seat contention |
| Enquiries / trials | No pipeline implementation | LEAD-01 persisted stages/tasks/trial follow-up, safe member conversion and retained history |
| Expenses | No expense implementation | EXP-01 categories/cash expenses, private attachments, immutable reversal/replacement and reconciliation |
| Reports | No reporting implementation | RPT-01 date/branch filters, net cash/refund/expense/source reconciliation, membership/attendance reports and scoped CSV/print |
| Imports / exports / files | Invoice/receipt PDFs download privately | IMP-01 CSV preview/map/duplicates/repeat-safe commit, formula-safe exports, validated private uploads/swappable storage |
| Platform administration | Separate explicit admin grant; protected console, isolated gym/owner/main-branch creation, name/contact/suspend/reactivate, bounded activity; DB/browser tests | Final contact-field/browser/hosted regression; live deployed code/config verification |
| Vercel / Supabase / recovery | Trusted restricted hosted pooler, migrations-first transfer preserving owner IDs/hash, exact baseline reconciliation, private backups/import file, canonical domain verified, user imported env/pushed code | Final runtime API investigation, backup restore rehearsal, remaining module/security/finance/release/pilot gates |
| Retained Hanova client workspace | User request/input retained privately; admin contact creation options added | Complete missing workflows, create Hanova via protected services, populate and reconcile retained connected examples, backup then remove other gyms, verify owner/admin login and client walkthrough |

The retained Hanova data is expressly authorized for testing/client walkthroughs and must survive fixture cleanup. It must use persisted application workflows and repeat-safe request keys, not bypass financial/tenant constraints. Do not send emails to generated member contacts. Keep provisioning credentials and dataset manifests private; record sanitized IDs/counts/reconciliation evidence in the session log. Do not describe generated people or example cash receipts as verified real customer activity.

Execution resumes after the current finance/platform/hosting verification with ATT-01, then DASH-01; EXP-01/TRN-01/LEAD-01, CLS-01, RPT-01/IMP-01, recovery/release. Keep every incomplete task visible until acceptance evidence exists. No all-scope DONE claim is currently justified.
