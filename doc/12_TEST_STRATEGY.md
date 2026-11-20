# Testing and definition of done

Use real disposable PostgreSQL for migrations, grants/RLS, constraints, transactions and concurrency. Array mocks or SQLite do not verify those guarantees. Never reset/test against a production database.

Unit tests cover period/date/time-zone rules, money parsing/balance math, eligibility and permissions. Integration tests cover real DB behavior. Browser tests cover user-visible workflows and required error states. Visual review compares actual screens against references. Operational tests verify restore and later migration.

| ID | Scenario | Expected |
| --- | --- | --- |
| T01 | Unauthenticated protected read/write/download | No access/data |
| T02 | Gym A uses Gym B IDs/search/export/files | No cross-tenant results/mutation |
| T03 | Runtime DB role missing tenant context | No business access |
| T04 | Reused pool connection for another gym | No context leakage |
| T05 | Receptionist directly invokes refund/staff API | Rejected |
| T06 | Staff revoked in existing session | Next sensitive request denied |
| T07 | Save member and reload | Persisted once, correct code/org |
| T08 | Concurrent enrollment/renewal | No overlapping base periods |
| T09 | Month-end/leap/fixed-day date cases | Exact documented boundaries |
| T10 | Freeze repeat/reversal/future conflict | Extend once; reject overlap; audit |
| T11 | Concurrent payments for last balance | Cap enforced |
| T12 | Same key same/changed payload | Original result/conflict |
| T13 | Forced failure during finance mutation | No partial write/audit |
| T14 | Partial pay/refund/credit combinations | Correct balances/caps |
| T15 | Concurrent numbering | Org-unique numbers |
| T16 | Expired/frozen/archived/debt/wrong branch | Correct denial, no visit |
| T17 | Duplicate scans across branches | One open visit |
| T18 | Repeat checkout | Safe, no invalid duration |
| T19 | UTC/Karachi day/month boundary | Consistent metrics |
| T20 | Refunds/reversed expenses/report totals | Reconcile source rows |
| T21 | CSV invalid/duplicate rows and repeat commit | Honest preview/commit, no unexpected duplicates |
| T22 | Export formula injection/private columns | Neutralized/omitted |
| T23 | Restore into separate DB | Auth/data/constraints/totals verified |
| T24 | Keyboard; 390/768/1280/1440px | Essential flows usable |
| T25 | DB/mail/storage failure | Honest retry, no fixture fallback |
| T26 | Concurrent last seat/trainer overlap | No overbooking/conflict (B) |
| T27 | Repeated enquiry conversion | One member (B) |
| T28 | Future hosted restricted DB role | Same isolation/auth/TLS/business checks |
| T29 | Persist/reload settings; stale version; manager field injection | Actual context/format change; stale/forbidden writes rejected |
| T30 | Owner staff provisioning/role/grants/revocation | Maintained credentials; tenant scope; no existing-account takeover |
| T31 | Concurrent owner removal/duplicate identity creation | One active owner remains; one identity provisioning winner |
| T32 | Audit failure/settings failure/refresh failure | Atomic rollback; inputs retained; confirmed commit requires reload |
| T33 | Saved access/receipt policy in operational consumers | SUB-01/PAY-02/ATT-01 must verify behavior; pending consumers |
| T34 | Shared member contact and scoped duplicate suggestions | Warn/confirm; family allowed; no foreign branch/gym details |
| T35 | Concurrent registration/code and lost HTTP response | Unique org codes; same actor/key replays one member; changed body conflicts |
| T36 | Concurrent contact edits and failed member audit | One stale edit rejected; member/counter/audit roll back atomically |
| T37 | Search wildcard, pagination/filter and slow browser response | Literal matching; consistent count/page; latest request wins |

Foundation should define actual project scripts for lint/typecheck/unit/integration/browser/build/db:generate/db:migrate/db:seed. These are desired interfaces, not a claim that scripts already exist. Reuse existing package manager/lockfile. CI uses isolated known data and credentials; browser tests assert visible behavior and remain independent.

DONE: acceptance passed, real persistence, permission/tenant protection, required UI states, relevant tests and visual review, migrations/setup docs and trackers updated. If verification is unavailable, use VERIFYING/BLOCKED and say why. Building TypeScript is not enough.

Evidence records task ID, files/migration IDs, command → actual result → date, manual/visual review and evidence path, and checks not run. Preserve unrelated baseline failures as distinct findings. Do not fabricate results or repeat broad checks without a new reason.
