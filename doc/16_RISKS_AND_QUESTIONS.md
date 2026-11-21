# Risks, questions and defects

Defaults allow local work. RELEASE_BLOCKER items must be resolved/verified before live use; they need not stop unrelated implementation.

| ID | Type | Issue | Next action/default |
| --- | --- | --- | --- |
| R01 | RELEASE_BLOCKER | Cross-gym data leakage | App scope + composite FKs + restricted-role RLS; two-gym tests |
| R02 | RELEASE_BLOCKER | Concurrent/retried payments | Locks, exact balances, idempotency tests |
| R03 | RELEASE_BLOCKER | Backup not restorable | Separate-DB restore including auth/files |
| R04 | VERIFYING | Local SMTP recovery/new-staff invitation verified; deployment operations remain | Actual inbox/reset evidence in mail-delivery.json; REL-01 reachability/maintenance; multi-gym existing-account join deferred |
| R05 | POLICY | Monthly vs fixed 30 days | Explicit plan unit; confirm pilot policy |
| R06 | POLICY | Grace/unpaid access | Default zero grace/paid activation, reasoned authorized exception |
| R07 | POLICY | Refund/freeze/cancellation | Prospective freeze, no automatic refund; confirm before pilot |
| R08 | RELEASE_BLOCKER | Local newer than target PG | Inspect versions; rehearse compatibility, no promised downgrade |
| R09 | RELEASE_BLOCKER | Misleading financial reports | Defined cash metrics and reconciliation |
| R10 | POLICY | Multiple reception devices | Decide LAN/hosted topology; localhost is one PC |
| R11 | FUTURE | DB host confused with auth/storage | Keep Better Auth; move file bytes separately |
| R12 | BUSINESS | Product name/price/support | Working name, no terms/pricing assumed |
| R13 | RELEASE_BLOCKER | Personal data retention/consent | Minimal fields; resolve pilot retention/export policy |
| R14 | POLICY | Family/shared contacts | Warn on duplicates; no global contact uniqueness |
| R15 | FUTURE | Hardware/offline/gateway claims | Separate requirements and validation |
| R16 | RELEASE_BLOCKER | Overprivileged hosted runtime | Verify custom role grants/RLS, no owner login |
| R17 | DESIGN | Image sample inconsistencies | Written rules and consistent fixtures prevail |

PLAN-01 update — 21 November 2026: explicit calendar-month/fixed-day units and exact date preview now implement R05 defaults, including leap/month-end checks. Versioned rates/access are retained and runtime immutable. Node display defaults were unsuitable for accounting PKR units; ISO exponents now govern parsing/storage. Branch-scoped ownership and owner-only all-gym access are ADR-026 defaults to confirm with pilot operations. SUB-01 must persist snapshots, reject archived members/plans and verify actual enrollment/renewal overlap; no membership/finance completion is inferred from the plan catalog. No local blocker to SUB-01 after final PLAN-01 checks.

Defect template:

```text
BUG-ID / severity / module/task:
Reproduction:
Expected and observed:
Environment/evidence:
Status/owner:
Fix and verification:
```

P0: leakage, permission bypass, financial corruption, destructive data loss, broken core login. These block release. Keep an anticipated risk distinct from an observed defect.

## Foundation update — 20 November 2026, Asia/Karachi

- Local environment is configured and DB-01/02 pass; there is no missing local database credential blocker. No external services or cloud account required.
- M00 is a development preview. AUTH-01/SEC-01 and all operational workflows remain release blockers; no real owner account or login exists. db:seed intentionally exits unavailable until controlled provisioning exists. Production email recovery and invitation delivery remain R04.
- Resolved QA-FND-01 defects: drawer failed trigger focus restoration; Tab could leave a single-control modal; malformed DB URL refinement threw an unhelpful raw URL error; NODE_ENV production could bypass an APP_ENV-only demo guard; transitive tooling audit advisory. Fixes have relevant passing checks; no claim of a bug-free full CRM.
- Browser screenshot timing initially induced a caret-style hydration warning. Tests now wait for actual client interaction, and the browser runtime check reports no errors.
- Non-blocking environment observations: Next reports a slow filesystem; npm warns about legacy tool dependencies/install-script review metadata. CLI generation/build/test commands actually ran successfully. No live deployment or recovery/restore test was performed.

Authentication local lifecycle now passes real DB/browser recovery checks. R04 production email delivery remains unresolved: production recovery intentionally fails until an adapter is configured. GYM owner setup awaits user-chosen identity and password via auth:bootstrap. SEC-01 active membership, role/action/branch checks remain release blockers. Git smart-HTTP initial push stalled; verify actual remote ref before claiming GitHub updated.

GitHub publishing issue resolved: all original references and verified source published, exact tree equality checked, local and remote histories reconciled without force. Ongoing pushes target origin/main. No outstanding source-publishing blocker; live app release blockers (SEC-01, owner setup, actual email delivery and operational workflows) remain.

SEC-01 local boundary now passes two-gym application/DB/browser tests, including fresh revocation and connection isolation. R01 remains a release regression gate for later member/finance/export/file services; those routes do not yet exist and must use this boundary plus resource-specific checks. Production mail R04 remains unconfigured (M01 release VERIFYING). No remaining blocker to local SET-01; real owner setup still requires chosen identity/password. No hosted database/deployment changes made.

SET-01 update — 20 November 2026, Asia/Karachi: persisted settings/staff/branch administration passes local real-session/DB/browser checks, including audit rollback and concurrent owner protection. No local development blocker remains; next MEM-01. R01 remains a regression gate for every later service. R04 still needs actual recovery/invitation delivery and a consent-based existing-account joining workflow; controlled new-account provisioning sends no email. GYM remains uninitialized pending chosen owner identity/password.

M02 remains VERIFYING for operational use of saved access and receipt policy in SUB-01/PAY-02/ATT-01. Saved settings alone do not implement payment activation, eligibility, numbering or paid receipts. Private logo upload awaits IMP-01; SaaS billing deferred. Real database journal counts are six for GYM and gym_test. No destructive resets, cloud changes, deployments or external messages occurred.

Resolved SET-01 verification defects: explicit accessible names fix currency select labeling; invalid draft locale no longer crashes formatting; administrative lock ordering prevents cross-owner demotion deadlocks; committed-save/failed-refresh state blocks stale retry and requires reload. Browser assertions scope alerts to the settings panel to avoid Next's route announcer. The final full suite passes; this does not claim the unimplemented CRM workflows are bug-free.

MEM-01 update — 20 November 2026: real registration/directory/contact edit/search and branch/role enforcement now pass DB/browser/concurrency checks. Full M03 remains IN_PROGRESS for MEM-02 profiles, emergency contacts, scoped notes and archive behavior. Registration does not implement membership eligibility, payment or financial totals. R01 remains a regression gate for these later services; R13 retention/consent still needs pilot policy.

Resolved member defects during verification: adding an email to an existing shared-phone record unnecessarily warned about the unchanged phone; checks now consider changed contacts only. A legacy dashboard search class styled the directory's label as an input; separate class and explicit control styles fixed it. Old query responses are aborted/discarded, and stale counts/results are not presented as the current failed view. Unit 14 and browser 29 checks pass; no blanket bug-free claim for future modules.

Owner setup blocker resolved under the user's explicit instruction: the first actual GYM workspace/owner is now provisioned and verified, with no member fixtures. Preserve it as valued user data. Private access details are ignored and never committed. Local-only owner email cannot receive real external mail; R04 live delivery/consent-based invitations remain unresolved. No external messages or deployment/cloud changes occurred. Next local task MEM-02.

Observed local login defect: user screenshots reported 429 and generic credential errors. Actual logs identified localhost vs 127.0.0.1 origin rejection (403), followed by the existing rate limit after retries. Resolved with exact same-port local aliases only outside production, shared across auth/business mutations; no security check or throttle disabled. Actual owner browser sign-in/directory/drawer/sign-out passed at both addresses. Form now honors server retry delay and preserves inputs. ADR-023 records the fix; the original failed browser attempt is retained as a failed check in session evidence.

MEM-02 completed locally: profiles/emergency contacts, management vs operational notes, retained withdrawals, history and versioned reasoned archive/restore. Real row-lock/concurrency checks preserve history. M03 integration verification remains for membership/visit/payment history and actual ATT-01 archived visit rejection; those services do not exist yet. No remaining blocker to PLAN-01. R13 pilot privacy/retention/consent still applies; no structured medical/progress fields added.

SMTP recovery/new-staff invitations work from the fixed sender. TLS authentication and actual Hostinger INBOX receipt/reset/single-use checks passed with one self-addressed email and isolated test identity. Owner login remains intentionally local-only by explicit choice and cannot receive email. Deployment HTTPS/reachable links, outbox maintenance scheduling and future host/proxy/SMTP behavior remain REL-01 checks. Existing identities cannot be claimed by another gym. No member campaign or arbitrary send endpoint added.

Resolved verification defects: invitation active-access lookup originally used a tenant table without context, falsely expiring mail; it now uses the narrow staff directory. Profile alert assertion matched Next's route announcer; scoped to the app panel. Early Add member click could precede hydration; member actions now remain disabled until ready. A test orchestration run overlapped isolated fixtures with owner bootstrap; auth rerun serially passed. Final full browser suite 36 PASS; earlier failures are recorded, not counted as passes.
