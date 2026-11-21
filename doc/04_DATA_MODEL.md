# Logical data model

This is a schema specification, not executable DDL. Codex must create reviewed migrations and test them on real disposable PostgreSQL.

Use UUIDs for business IDs; preserve the auth library's supported ID type. Business rows normally include organization_id, timestamps and actor fields. Events use timestamptz, membership/due dates use date. Money uses BIGINT minor units plus currency; serialize as decimal strings, not unsafe JS numbers.

Scoped parents have unique (organization_id, id); child foreign keys include the same organization_id. Branch references must belong to that organization. This prevents cross-gym references even with valid global UUIDs.

| Table | Important fields/constraints |
| --- | --- |
| app_auth user/session/account/verification | Library-generated private identity/session tables; preserve hashes/IDs |
| organizations | name, unique slug, currency, time_zone, locale, settings_version |
| branches | org, code/name/address, active; org+code unique |
| staff_memberships | org, auth_user_id, role, active; org+user unique |
| staff_branch_grants | org, staff_membership_id, branch_id; unique grant |
| staff_invitations | org, email/role/grants, token_hash, expires_at, accepted_at |
| members | org, home_branch_id, unique org+member_code, name, normalized_phone, email, joined_on, archived_at |
| member_contacts / member_notes | org/member, emergency contact; note author/content/visibility |
| plans / plan_versions | Stable plan code; immutable used version, amount/currency, duration unit/count, access rules |
| memberships | org/member/plan_version, home branch, start_on/end_on_exclusive, lifecycle, price/name snapshots, cancellation_effective_on |
| membership_freezes | org/membership, date range, reason, extension_days, reversed_at |
| invoices / invoice_items | org/member/membership, originating_branch_id snapshot, unique number, issue/due dates, currency, total, draft/issued/void; line snapshots |
| credit_notes | org/invoice, unique number, amount, reason, actor; immutable |
| payments | org/member, received_at, amount/currency/method/reference, unique receipt_number, actor |
| payment_allocations | org/payment/invoice, amount; same member/currency |
| refunds / refund_allocations | original payment/allocation, cash date, amount, reason, approving actor/reference |
| attendance_visits | org/branch/member, check-in/out instants, eligibility snapshot, override actor/reason |
| trainers / trainer_assignments | org, optional auth linkage, specialty/active; member assignment dates |
| trainer_sessions | org/trainer/member/branch, instants/state; Release B |
| classes / class_sessions | org/class/branch/trainer/room, instants/capacity/state; Release B |
| class_bookings | org/session/member/status; one active booking per pair |
| enquiries / follow_up_tasks | org/branch/contact/stage/assignee/permission/converted_member, due/completed dates |
| expense_categories / expenses | org/branch/category, cash date, positive amount/currency/method, attachment, reversal linkage |
| attachments | org, opaque object_key, filename/type/size/actor; private |
| audit_events | org/actor/action/entity, sanitized before/after/reason/time; insert-only runtime access |
| idempotency_records | org/actor/operation/key/request_hash/result_reference; scoped unique |
| number_counters | org/kind/value; atomic numbering |
| import_batches | org/source fingerprint/state/summary/actor/commit time |

All business table names above live in gym. Create deferred tables with their module, not merely because they appear here.

## Enforced invariants

- Date ranges are [start, end), end > start. A member may have at most one effective base membership at a time: reject overlapping pending/active non-cancelled ranges. Serialize period writes by locking the member row and validating cancellation/freeze effects.
- Freeze is prospective, non-overlapping, extends once. If extension overlaps an existing future period, reject and require renewal rescheduling.
- Partial unique index permits one open attendance visit per org/member across branches. Checkout cannot predate check-in.
- Issued invoices/payments/refunds/credits are immutable except controlled correction operations. Member archival never cascade-deletes finance.
- Allocation sums equal payment total in MVP; no unapplied wallet credits. Refund allocation sums equal refund total. Aggregate caps require transaction locks/procedures, not a row CHECK pretending to validate another table.
- Credit cannot exceed original charge or create negative outstanding; pair settled-charge refund/credit atomically when required.
- Idempotency and audit commit/roll back with the operation. Number issuance uses counters/sequences, never row count.
- Safe deletes/archive behavior and unique/scoped references are explicitly migrated and tested.

Indexes start with org and common filters: members normalized_phone/name; membership member/start; invoices member/due; payments received_at; visits branch/check-in; audit time; child FKs and scoped uniqueness. Use actual EXPLAIN evidence before extra search extensions.

Seed fictional Crown Fitness and an unrelated second gym. Include active/expired/frozen/unpaid cases, overlapping display codes across gyms, consistent financial data. Generate demo credentials locally; no shared production password. Seed/reset tools must refuse production.

## Implemented SET-01 schema

Migrations 0004_settings_staff_audit and 0005_settings_audit_security add organization contact, receipt prefix/footer, paid_activation, grace_days, debt_blocks_access and settings_version; branches and staff_memberships have version. Grace is bounded 0–30; versions are positive. gym.audit_events has org/actor FKs, UUID entity/request IDs, action/reason, bounded service payloads in before/after JSON and occurred_at timestamptz, with org/time index. Runtime SELECT/INSERT are tenant-scoped; UPDATE/DELETE are not granted. All administrative services commit audit and mutation atomically. Organization/staff/branch version changes are checked under locks; the organization administrative mutex serializes last-owner and last-active-branch checks.

The MEM-01 addition below extends these core/admin tables. Finance/attendance and other future tables remain planned. Tests create and clean fictional two-gym fixtures only in gym_test.

## Implemented MEM-01 schema

0006_member_directory adds members (UUID ID, org/home branch, org-unique member_code, name/raw+normalized phone/email, joined_on date, optimistic version, registration key/hash, actor references, UTC creation/update events, reserved archived_at) and number_counters (org/kind unique, positive bigint). Composite org/branch FK prevents cross-gym home branches; name/version/usable-contact/normalized-phone constraints protect rows. Contacts deliberately have non-unique org-leading lookup indexes; legitimate shared contacts are allowed. Registration keys are unique per org/creating actor. DTOs exclude key/hash, normalized contact and actor internals.

0007_member_security adds tenant RLS for both tables, restricted SELECT/INSERT/UPDATE only and actor-FK indexes. DELETE is not granted; future archival will preserve history. Counters are updated atomically inside registration, not derived from row count. Member, counter and audit roll back together. Table versions gate contact/branch edits; source and destination branches must both be authorized. No emergency-contact/notes tables or membership/finance tables are added in this slice; those belong to later tasks. The user-authorized owner setup initialized one real GYM workspace without fictional member rows.

## Implemented MEM-02 / MAIL-01 additions

Reviewed 0008_member_profiles_and_mail and 0009_profile_mail_security add gym.member_contacts (one emergency contact per scoped member), member_notes (author, visibility/body, scoped replay key, UTC event) and member_note_withdrawals (one immutable actor/reason/time per scoped note). Composite organization/member and organization/note foreign keys prevent tenant-crossing relationships. Runtime notes/withdrawals allow SELECT/INSERT under tenant RLS, no UPDATE/DELETE; withdrawals retain original note bodies privately. Contact removal is explicit. Existing members.archived_at/version implement archive/restore; no historical member deletion or finance tables added.

Private app_auth.mail_outbox binds recipient auth identity, optional invitation organization, kind, link payload, delivery status, Message-ID and timestamps/error code. It is global server-only identity infrastructure alongside auth tables. Atomic claims transition pending (or explicitly retried failed) to sending; acceptance clears payload and marks sent. Unknown outcomes, including acceptance/status-write failure, remain uncertain. Maintenance clears expired links and never blindly retries uncertain sends. No SMTP credentials are stored in these rows or audit payloads.

## PLAN-01 catalog additions

0010_plan_catalog adds gym.plans: permanent UUID, organization/owning branch composite FK, org-unique reserved code, revision, archive timestamp and actor/UTC creation. gym.plan_versions holds immutable org/plan/version identity, name, exact bounded bigint minor units/currency, calendar-month or fixed-day duration, branch access mode, benefit flags, reason, actor, request key/hash and UTC creation. Scoped unique version and actor/key constraints prevent duplicate publication; plan lock/revision serializes writers. Branch/archive and actor-FK indexes support scoped queries and constraints. No memberships/invoices or fabricated snapshot ledger are created here.

0011_plan_security enables tenant RLS on both tables. Runtime can SELECT/INSERT but cannot UPDATE/DELETE versions. Plans permit UPDATE only on revision/archive, preserving branch/code/identity; no runtime DELETE. Immutable version rows supply the snapshot contract for SUB-01; enrollment must persist those fields and version ID atomically with the real membership/invoice. Old version rows survive catalog changes/archive. Twelve migration entries expected after applying both new reviewed migrations.

## Implemented SUB-01 additions

0012_membership_lifecycle adds memberships, membership_freezes, membership_requests and the minimal single-line issued invoices foundation. Memberships store immutable plan snapshot/version, exact price/currency, owning home branch, original dates, extended end, activation/cancellation state and optimistic version. Invoice has an org-unique number, immutable description/total/currency/local issue/due dates and a composite FK matching its membership/member/branch/currency/amount. One invoice per enrollment. Invoice counter, membership, snapshot, request key/hash/result and sanitized audit are committed together. No payment/receipt/credit/refund table or fake balance is introduced.

0013_membership_security enables tenant RLS and restricted grants: no runtime invoice/request UPDATE/DELETE, no snapshot/start/original-end/identity edits, lifecycle/end/version updates only; freeze reversals update only reversal metadata. A portable trigger locks the parent member and rejects overlapping effective [start,min(end,cancellation)) ranges, including concurrent raw inserts. Service locking/version checks additionally stop accidental duplicate adjacent renewals under different keys. Freeze extension/removal/cancel/audit all share the parent transaction. Original freeze records and issued charges are retained.

0014_membership_snapshot_shape explicitly requires JSON keys and guards missing money/access values with COALESCE false, avoiding nullable CHECK acceptance. Its negative insertion test proves rejection. Fifteen applied migration entries per local database after this slice. Broader invoices/items/settlement/corrections are continued in PAY-01/02/03; preserve these actual enrollment invoices when extending the schema.

## PAY-01 database slice

Reviewed migrations 0015_invoice_drafts_and_lines, 0016_invoice_security and 0017_invoice_currency extend issued enrollment invoices without changing original monetary/date/number identities. Standalone drafts use a nullable membership link plus independent tenant-scoped member/branch FKs. Draft state has null number/issued_on, version and current line_revision; issued state requires number/day. Currency shape independently constrained. Issue-time recipient name/code/origin branch and issuer JSON preserve billing presentation after later edits. Legacy issued identity is populated from available metadata at migration time; GYM had no invoices before this migration.

invoice_items are immutable scoped invoice/revision/position snapshots of description, whole quantity, exact unit/discount/total. Draft edits append revisions, keeping old rows. Restricted runtime SELECT/INSERT only; no UPDATE/DELETE. billing_requests retain scoped actor/key/hash/operation/invoice/result for create/edit/issue replay; no runtime UPDATE/DELETE. Invoice UPDATE grants are limited to draft-edit/issue fields; trigger rejects any change to an already issued header or immutable identity and enforces revision transitions. Enrollment invoice insertion automatically adds the equivalent single line in its transaction.

Deferred constraint triggers compare current line totals/count/gross caps with the header at commit, while immediate item guards lock/check the parent revision. Empty, incomplete or mismatched invoices cannot commit. New tables have tenant RLS; missing context denies reads/writes. invoice_balances uses security_invoker=true and existing invoice RLS, exposing issued total / zero draft debt until actual PAY-02/03 settlement tables extend the formula. Runtime SELECT only on the view. Branch/date/member/due/actor/child FK indexes support real scoped operations. No payment/credit/refund ledger is invented. Eighteen journal entries per local database; previous 0000–0014 preserved. Future PostgreSQL host needs PG15+ for invoker-rights views and the existing restricted-role/migration rehearsal checks.


## PAY-02 settlement ledger (0018–0019)

Immutable gym.payments and gym.payment_allocations use organization/business UUIDs and original invoice member/branch/currency identity. Unique org receipt number and org/actor/request key with canonical SHA256 support replay. Positive bigint minor units (bounded per payment); local paid_on and UTC created_at. Payment saves immutable receipt issuer/original recipient/invoice snapshot, balance immediately afterward, reference/member-facing note and activation result. Runtime SELECT/INSERT only, tenant RLS, no update/delete. Composite FK binds allocation invoice/member/branch/currency/amount exactly to its payment and invoice. One allocation per payment; deferred triggers require it at commit. Immediate guards lock invoice and freshly read aggregate, reject overpayment/incomplete prior allocation and cap allocations.

invoice_balances remains security_invoker and now exposes issued total minus allocated payments (draft zero). Credits/refunds do not exist until PAY-03 extends this formula. A later payment cannot mutate an older receipt balance. The existing org receipt counter is separate from invoice numbering. All financial/audit/counter/activation writes share one authorized transaction; no browser DB/Supabase Auth dependency. Twenty applied migrations in both local databases, previous 0000–0017 SQL unchanged.
