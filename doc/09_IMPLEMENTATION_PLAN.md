# Implementation plan

Phases are dependency order, not a delivery calendar. Inspect/verify existing work before rebuilding it.

| Phase | Outcome | Exit gate |
| --- | --- | --- |
| 0 | Repository/tool/environment audit | Baseline/version choices recorded; user changes preserved |
| 1 | Tokens/shell/primitives/dashboard preview | Reference-aligned, responsive, fixtures clearly labeled |
| 2 | Local DB/auth/org context/roles/settings | Clean migrations, login/revocation, tenant RLS tests; no Supabase requirement |
| 3 | Members/profiles/plans | Real persisted search/forms; immutable plan versions |
| 4 | Memberships/finance | Period rules, invoices, partial payment/receipt/refund and contention tests |
| 5 | Front desk/dashboard | Real eligibility/check-in/out; no duplicate visits; replace fixtures |
| 6 | Operating release | Expenses/reports/import-export, recovery/restore, pilot gate |
| 7 | Expanded suite | Trainers → classes; enquiries/trials; jobs only when specified |
| 8 | Authorized cloud move | Supabase rehearsal/reconciliation/cutover/rollback |

First session completes FND-01, FND-02, FND-03: inspect existing repository, initialize/adapt tooling, create shared polished shell and demo dashboard. Discover local PostgreSQL without printing secrets. If safe connection configuration exists, proceed to DB-01/02; otherwise document exact missing input and continue independent UI work.

Each workflow: read rules/acceptance → constraints/migration → authorized transaction/service → server wrapper → UI/states → focused checks → evidence → trackers. Avoid thirteen disconnected CRUD pages.

Release A gate: register → invoice → partial/full payment → receipt → activation → check-in → renewal persists correctly. Expired/frozen/unpaid cases obey configured policy. Retries/concurrency preserve financial/access invariants. A second gym cannot cross-read/write/export/download/report.

Before live use: actual recovery email, safe provisioning, tested backup/restore, scoped imports/exports, secrets/health/rollback setup, accessibility and pilot review. No P0 defect. Reports reconcile. Keep local readiness distinct from future hosted migration.

Do not add unrequested cloud services, payment gateways, separate backend, AI, hardware or offline sync to fill a roadmap. Feature-gate deferred modules.
