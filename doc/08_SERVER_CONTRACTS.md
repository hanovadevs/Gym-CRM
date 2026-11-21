# Server contracts

Thin Server Actions/Route Handlers call shared services. Do not duplicate business rules across interfaces. Better Auth routes follow the installed official integration.

Context is created server-side: actor, org, active staff role, permitted branches/actions, request ID. Client-selected context must be verified. IDs opaque; inputs validated on server.

Success: `{ok:true,data,requestId}`. Failure: `{ok:false,error:{code,message,fieldErrors?},requestId}`.

Codes: UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT, ACCESS_DENIED, CAPACITY_REACHED, IDEMPOTENCY_CONFLICT, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR. HTTP wrappers map to appropriate 401/403/404/422/409/503/500; actions use typed results. Show safe actionable messages.

List inputs: bounded pagination (default 25, max 100), allowlisted sorting, query and filters. Return filter-consistent rows/counts. Membership dates ISO date, events ISO instant, money decimal minor-unit strings + currency.

| Service | Inputs | Guarantee |
| --- | --- | --- |
| members.list/create/update/archive | Query/filters; contact/branch; version; reason | Scoped persisted data; unique code; optimistic edit conflict; archive history |
| plans.createVersion | Plan/name/rate/duration/access | Immutable after use; same org currency |
| memberships.enroll/renew | Member/plan version/exact dates/key | Membership + invoice atomically; no overlapping periods |
| memberships.activate | Membership; reason if debt exception | Paid check or authorized override |
| memberships.freeze/cancel | Dates/effective date/reason/key | Audited lifecycle; finance changed only explicitly |
| billing.recordPayment | Invoice/amount/currency/method/cash date/reference/key | Lock balance; allocate; receipt/audit atomically; explicit activation effect |
| billing.refund/credit | Original payment/allocation or invoice; amount/reason/key | Owner permission; caps and consistent debt under locks |
| attendance.checkIn/checkOut | Member/branch or visit; key; override reason | Evaluate access now; one open visit; safe repeats |
| expenses.create/reverse | Category/branch/amount/date/attachment/reason/key | Immutable posting/correction and accurate cash totals |
| reports.summary | Local period, branch, type | Authorized aggregates with defined attribution |
| settings.update | Version/allowlisted fields | Conflict detection, policy audit |
| staff.invite/changeRole | Email/user/role/branch grants/reason | Owner-only; no self-escalation/lockout |
| imports.preview/commit | Upload/mapping or batch ID/strategy | No write on preview; safe repeat commit/truthful counts |

## Payment transaction

Resolve invoice in authorized gym/branch; reserve scoped idempotency key and request hash; lock invoice; derive current balance; reject overpayment/currency mismatch; insert payment/allocation, issue receipt number, add audit and optional valid activation; commit. Only then report success.

Same key/payload returns original result; changed payload conflicts. Concurrent distinct keys still obey balance caps. Rendering a receipt after commit can fail independently and must be retryable without another payment.

## Downloads/files/UI

Authenticate every export/receipt/file download and validate ownership. Bound/stream large exports; neutralize formulas. Stage uploads to avoid missing-byte pointers; cleanup unused staged objects.

UI consumes DTOs, not raw tables. Revalidate changed list/detail/metrics after success. Preserve form data on failure. Avoid optimistic financial/access changes unless rollback semantics are proven. Catching a database exception must never become a successful empty list or demo data.

## Implemented SET-01 interfaces

- GET /api/settings: optional validated organizationId/branchId and staffPage (positive integer, default 1); owner/manager. Returns validated values/version/editable fields and permitted branch metadata. Owners additionally receive staff (25/page, total/page) and latest 20 administrative audit events. No password/hash/session data in DTOs.
- PATCH /api/settings: organizationId, version, nonempty allowlisted changes, reason. Manager fields: phone/email/address/receiptFooter. Owner controls other configuration. Version mismatch 409; no partial save.
- POST/PATCH /api/staff: owner only. POST creates a new identity/membership/grants using maintained auth; existing email is refused. PATCH requires tenant staff ID/version and changes role/active/branchIds. No password/profile edits for existing identities. Protect final active owner.
- POST/PATCH /api/branches: owner only. Name/code/active/reason; existing branch ID/version for edits. Unique code per gym and at least one active branch. No deletion endpoint.

Mutation interfaces require trusted same origin and JSON, reject cross-site requests and bound request bodies to 32KiB. Strict schemas reject role/field injection; active grants must resolve to active tenant branches. Responses use sanitized error codes/messages, request IDs and no-store. getSecurity().run supplies the transaction client and trusted scope; audit is atomic. A committed save followed by failed client refresh is reported as saved and requires reload before further edits; it must not silently retry provisioning or overwrite a stale version.

## Implemented MEM-01 interfaces

- GET /api/members: optional organizationId/branchId, q (max 100), sort (name/newest/oldest/code), positive bounded page. Fixed pageSize 25. Single statement returns matching rows/count/clamped page under one snapshot. DTO includes permitted branch choices, gym locale/time zone/local today and editable registration rows, with no auth/registration internals. Unknown sort/extra fields are rejected. Literal SQL wildcards are escaped; phone formatting is normalized without assuming a country. Trainer/accountant directory access is denied until assignment/billing-specific DTOs exist.
- POST /api/members: org, registrationKey UUID, name, phone/email, homeBranchId, joinedOn; at least one usable contact. Server validates active branch and no future joining day in gym time zone. Same actor/key and canonical fields returns the same authorized member; changed fields conflict. Org counter/code/member/audit are atomic. This does not enroll or charge the member.
- PATCH /api/members: org/member ID/version, full registration fields and reason. Target must be in permitted source branch; destination must also be permitted. Stale versions conflict and input remains. Changed contacts alone are checked for possible duplicates.

Duplicate conflicts include at most five permitted matches in error.details.duplicates, plus moreMatches; no other gym/unauthorized branch contact metadata is exposed. To register a different person sharing a contact, acknowledgeDuplicate and a bounded duplicateReason are required. Deterministically ordered contact locks make concurrent registrations see the first committed match. Contacts remain non-unique. Public mutations reuse the shared same-origin/body-bound/error/no-store boundary. Sensitive contact field values are omitted from automatic audit payloads; actor/request ID/version/changed field names and explicit reasons are retained.

## Implemented MEM-02 / MAIL-01 interfaces

- GET /api/members/[id]: validated organization selection and positive notePage; authorized branch profile including archived records. Notes are 20/page with counts filtered by visibility; history is latest 20 permitted member events. Membership/visit/payment histories remain unavailable until their services exist. Directory adds status registered/archived/all, default registered.
- PATCH /api/members/[id]/contact: organizationId, member version, emergency contact or explicit null removal, reason. Current active member and branch scope required; bumps member version and audits atomically.
- POST /api/members/[id]/notes: organizationId, requestKey, body and operational/management visibility. Management notes are owner/manager only. Same actor/key/payload replays; changed payload conflicts. PATCH withdraws by note ID with reason, preserving the original in storage; author or owner/manager only. Withdrawn body is absent from DTOs. Archived members reject both operations.
- POST /api/members/[id]/archive: owner/manager, organizationId, version, archived boolean and reason. Parent row/version serializes with edits/contacts/notes. No hard delete, enrollment or financial side effects.
- POST /api/staff adds delivery password/email. Email creates a random maintained password and transactional one-use setup token/outbox. Saved account success is distinct from deliveryStatus. POST /api/staff/mail requires owner action, same-org active invitation identity and safe pending/failed state; uncertain messages are never resent by this route.

All protected routes retain current-session/membership/action/branch checks, strict schemas, same-origin JSON/body bounds and no-store responses. Mail recipient must match its identity and callback origin must be trusted. Sender is centrally fixed to contact@hanovadevs.com. Network delivery occurs after commit with one atomic claim; acceptance followed by failed status persistence is uncertain, preventing an unsafe duplicate retry. Deployment maintenance and multi-gym existing-account consent are separate work.

## Implemented PLAN-01 interfaces

- GET /api/plans: optional organization/branch selection, literal q <=100, active/archived status and bounded page. Twelve cards/page, matching count/clamping/data in one statement. plans.read permits owner/manager/reception/accountant in active assigned scope; trainer denied. No member counts or renewals invented.
- POST /api/plans: owner/manager plans.manage, organizationId, permitted branchId, normalized stable code, version values, actor-scoped requestKey and reason. Initial plan/version/audit commit together; existing archived codes remain reserved.
- PATCH /api/plans: plan id/revision plus new values/key/reason. Immutable new version; current currency required, manager limited to home-branch access, owner may publish all-gym access. Same key/payload safely replays; changed payload conflicts. Stale revision returns 409 and preserves client draft.
- GET /api/plans/[id]: organizationId and versionPage, 20 immutable versions/page, scoped parent shared lock keeps count/history consistent. Full published history remains read-only.
- POST /api/plans/[id]/archive: organizationId/revision/archived/reason, owner/manager and owning-branch scope. Parent lock/revision serializes with publication. Archive/restore does not change old versions or charge/enroll members.

Server-only resolvePlanSnapshot(db, trustedScope, versionId) locks the active parent plan, checks current selected version and currency, then returns stable plan/version/code/branch/name/rate/duration/access fields. SUB-01 must call it inside its existing authorized transaction and persist the result alongside real enrollment/invoice. History reads continue to expose prior immutable versions even after their plan is archived. Money parsing uses ISO accounting minor units independently of locale display defaults; membership end calculations use local dates and exclusive ends.

## Implemented SUB-01 interfaces

- GET /api/members/[id]/memberships: organizationId, bounded page and literal planQuery <=100. Fresh membership/branch permission, scoped 20/page history, matching count/clamping, up to 100 matching current home-branch plans, current policy, member version, next start and derived access state. Profile service shares the same repository inside its existing authorized transaction. Search and hidden history never expose foreign tenant/branch charges.
- POST /api/members/[id]/memberships/preview: organizationId, memberVersion, mode enroll/renew, selected planVersionId and optional startOn. Validates current member/plan/archive/currency/owning branch, future dates and period collisions. Returns snapshot, exact dates/last included day, charge and activation policy; no writes.
- POST /api/members/[id]/memberships: same fields plus requestKey/reason. Freshly recomputes the preview; member + immutable plan snapshot + issued invoice/counter + audit/request result atomic. Current member version prevents two simultaneous confirmations with distinct keys. Same actor/operation/key/canonical hash safely replays original IDs; changed body conflicts. Client-supplied amounts, access/role fields and unknown keys are refused.
- PATCH /api/members/[id]/memberships: organizationId/memberVersion, membershipId/version, requestKey/reason and operation activate/freeze/reverse_freeze/cancel. Owner/manager override action only. Freeze adds startOn/endOn; reversal freezeId; cancellation effectiveOn. Prospective boundaries, unchanged invoice, non-overlap, one extension/reversal and stale checks enforced server-side. Archived members deny access changes except reasoned cancellation of retained history.

All new interfaces retain same-origin JSON/body limits, no-store, current session/membership/action/branch checks and safe errors. Member row lock precedes lifecycle writes; database guard also protects periods. Membership/invoice history survives plan changes/archive and member archive. Home-branch transfer while effective membership/grace remains is rejected. Profile eligibility consumes activation, local dates, grace, freezes, due unpaid charges and archive, with valid activated grace retained while a renewal is pending. Payment/credit/refund settlement and actual visit-branch enforcement must extend these consumers in PAY-02/03/ATT-01.

## PAY-01 implemented interfaces

- GET /api/invoices: optional validated organizationId/branchId/memberId, literal q, status all/outstanding/overdue/draft/issued, from/to ISO local issue dates (drafts use local creation day), allowlisted newest/due/amount and bounded page. Fixed 25/page; matching rows/count/clamped page and currency-separated summaries share a statement snapshot. Status tabs filter rows; summary scope follows branch/search/member/date across tabs. DTO money is decimal minor-unit strings. No currency conversion or receipt is implied.
- GET /api/invoices/recipients: org, optional permitted branch and literal q. Up to 25 registered permitted-home-branch recipients plus count. Only name/member code/branch/UUID; no contact, notes or full-profile permission granted to accountants.
- POST /api/invoices: org/member/requestKey/reason and description, current currency, due day, 1–30 exact lines (description, whole quantity, unitMinor, fixed discountMinor). Creates an unnumbered draft; no debt or membership. Server recomputes totals. Lines and audit/key result commit together. Actor-scoped same-key canonical retry returns original invoice; changed body conflicts.
- GET /api/invoices/[id]: org; fresh billing.read, tenant and original-branch authorization. Header lock prevents mixing draft revisions; returns current item set, exact subtotal/discount/total/balance, issue-time issuer/recipient/origin snapshot and original enrollment period when present. Archived-member issued history remains readable. Accountant gets no full-member link/contacts.
- PATCH /api/invoices/[id]: org/version/requestKey/reason. operation edit appends a new immutable draft line revision; operation issue atomically assigns the shared org invoice number, local issue date, freezes billing identity and creates outstanding debt. Member must remain registered in the original home branch, currency current, due day today or later on issue. Issued edits are denied. Request lock precedes member/invoice locks; concurrent/stale edit or issuance has one version winner. Counter, audit and request-result failure roll back. No payments, receipts or corrections endpoint in PAY-01.
- GET /api/invoices/[id]/pdf: org; fresh billing.read/tenant/original-branch check, issued only (draft 409). Returns application/pdf attachment with a sanitized invoice-number filename, private/no-store and nosniff. Issued identity/line snapshots and current shared balance produce the document; generation/retry does not issue or take payment. Audit records invoice.pdf_requested, not successful external delivery. Admin saves/shares the downloaded file; no automatic mail or public bearer link.

All mutations retain existing JSON/body-size/trusted-origin/no-store wrappers. /payments and member invoice links use the same authorized services; loading/empty/read/write/stale/refresh/permission/download errors are explicit. Committed save plus failed refresh hides stale rows and blocks further writes until reload. PAY-02/03 extend the shared invoker-rights invoice_balances view with actual allocations/credits/refunds and update paid receipts/access effects. Zero balance is not labeled proof of payment.
