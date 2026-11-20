# Security and permissions

All app roles are organization-scoped and branch-restricted unless explicitly org-wide. These roles differ from PostgreSQL connection roles.

| Capability | Owner | Manager | Receptionist | Trainer | Accountant |
| --- | --- | --- | --- | --- | --- |
| Configure gym/branches | Full | Operational only | No | No | Receipt details read |
| Invite/change staff roles | Full | No | No | No | No |
| Members/contact | Full | Assigned scope | Assigned branches | Assigned members/minimum fields | Billing fields |
| Plans/membership | Full | Full assigned scope | Existing plans/renewals | Assigned read | Billing read |
| Payment/receipt | Full | Assigned scope | Assigned scope | No | Assigned scope |
| Approve refund/credit/void | Full | No by default | No | No | Request only |
| Attendance | Full | Assigned scope | Assigned scope | Own sessions only | No |
| Override/freeze/cancel | Full | With reason | No | No | No |
| Expenses | Full | Assigned scope | No | No | Assigned scope |
| Financial reports/export | Full | Assigned scope | Daily collections only | No | Assigned scope |
| Classes/enquiries | Full | Assigned scope | Booking/enquiries | Own schedule | No |
| Audit | Full | Operational scope | Own actions | No | Financial scope |

Prevent self-promotion and last-owner removal. Permission changes are recorded product decisions.

## Authentication

Use Better Auth's maintained password/session mechanisms. Disable public signup in actual auth configuration/endpoints; hiding a button is insufficient. Bootstrap first owner through controlled setup; invite/provision later staff server-side with authorized roles/grants. Tokens hashed, expiring, single-use. User-editable profile metadata never grants staff roles.

Validate session and active staff membership in services, especially sensitive mutations. Revocation must affect existing sessions. Configure HTTPS secure cookies, trusted origins, supported CSRF/origin protections, expiry, login throttling and generic recovery errors. Local mail capture is development-only; actual live recovery delivery must be tested before release.

## Two-layer tenant protection

Application: centralized validated context + role/action/branch checks; all repository calls require that context. Cookie/route/form org IDs are untrusted selectors. Cross-gym IDs yield non-disclosing not-found results. DTOs omit private fields; exports/downloads follow the same rules.

Database: business-table RLS read USING and write WITH CHECK, composite scoped FKs and restricted non-owner runtime login. After authorization, set `app.organization_id` transaction-locally and execute all business queries on that same checked-out transaction connection.

Conceptual tenant predicate:

```sql
organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
```

This is illustrative, not a full policy. Missing context denies access. Never use a pooled session-wide SET. Test reused connections for leakage. This trusted-server context is defense in depth, not protection against arbitrary SQL under compromised app credentials; never expose a route accepting SQL.

Resolve staff membership before tenant context using a narrowly scoped auth-directory lookup/helper that returns only the caller's memberships. Avoid recursive RLS policies; do not grant broad unscoped business reads as a workaround. Document/test this bootstrap path. App RBAC enforces branch/action scope; RLS adds the tenant boundary.

No local `auth.uid()`/Supabase JWT dependency. Keep gym/app_auth outside Supabase's exposed API schemas later, or explicitly restrict API exposure/grants. RLS does not constrain table-owner/superuser/BYPASSRLS connections; runtime must use the intended restricted role.

## Operational rules

Separate migration/admin secret from runtime. Server-only DB/mail/auth config; no credentials in git/logs/client bundles. Private uploads validate size/type/content, prevent path traversal, use opaque keys and authorized downloads. Audit sensitive changes/refunds/roles/overrides/exports without secrets or full private note contents.

Neutralize CSV spreadsheet formulas. Minimize personal information and operational notes; medical/progress data requires separate consent/retention/access design. Protect backups and verify restoration.

Release evidence includes two-org negative tests, direct forbidden API/action calls, revoked sessions, restricted DB-role tests, exports and files. Hidden navigation proves nothing about authorization.
