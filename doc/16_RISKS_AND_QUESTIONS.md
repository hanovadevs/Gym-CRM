# Risks, questions and defects

Defaults allow local work. RELEASE_BLOCKER items must be resolved/verified before live use; they need not stop unrelated implementation.

| ID | Type | Issue | Next action/default |
| --- | --- | --- | --- |
| R01 | RELEASE_BLOCKER | Cross-gym data leakage | App scope + composite FKs + restricted-role RLS; two-gym tests |
| R02 | RELEASE_BLOCKER | Concurrent/retried payments | Locks, exact balances, idempotency tests |
| R03 | RELEASE_BLOCKER | Backup not restorable | Separate-DB restore including auth/files |
| R04 | RELEASE_BLOCKER | Live account recovery/invitation | Test actual mail delivery, no public signup |
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
