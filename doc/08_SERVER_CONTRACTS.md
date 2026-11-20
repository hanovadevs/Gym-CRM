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
