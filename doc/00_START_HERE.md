# Start here

The product helps gym owners and reception staff manage members, fees, membership access, attendance, and daily operations. It should work for one independent gym and support selling the same codebase to several isolated gyms.

**Explicit requirement:** local PostgreSQL first; Supabase-hosted PostgreSQL later. A host change should retain business services, IDs, schema contracts, and app authentication. It does not automatically adopt Supabase Auth or expose database tables to browsers.

## Document map

| File | Purpose |
| --- | --- |
| [01_PRODUCT_SCOPE.md](01_PRODUCT_SCOPE.md) | Customers, release boundaries, assumptions |
| [02_DESIGN_SYSTEM.md](02_DESIGN_SYSTEM.md) | Visual tokens, shared UX, responsive states |
| [03_ARCHITECTURE.md](03_ARCHITECTURE.md) | Stack, code boundaries, portability |
| [04_DATA_MODEL.md](04_DATA_MODEL.md) | Logical tables, constraints, indexes |
| [05_MODULE_SPECIFICATIONS.md](05_MODULE_SPECIFICATIONS.md) | Modules, workflows, acceptance |
| [06_BUSINESS_RULES.md](06_BUSINESS_RULES.md) | Dates, billing, access, metrics |
| [07_SECURITY_AND_PERMISSIONS.md](07_SECURITY_AND_PERMISSIONS.md) | Roles, tenant isolation, data protection |
| [08_SERVER_CONTRACTS.md](08_SERVER_CONTRACTS.md) | Service interfaces and guarantees |
| [09_IMPLEMENTATION_PLAN.md](09_IMPLEMENTATION_PLAN.md) | Build phases and release gates |
| [10_MODULE_TRACKER.md](10_MODULE_TRACKER.md) | Current state and evidence |
| [11_BACKLOG.md](11_BACKLOG.md) | Tasks and dependencies |
| [12_TEST_STRATEGY.md](12_TEST_STRATEGY.md) | Meaningful checks and done criteria |
| [13_LOCAL_SETUP_AND_OPERATIONS.md](13_LOCAL_SETUP_AND_OPERATIONS.md) | Local setup, deployment, recovery |
| [14_DECISIONS.md](14_DECISIONS.md) | Decisions and alternatives |
| [15_SESSION_LOG.md](15_SESSION_LOG.md) | Handoff memory |
| [16_RISKS_AND_QUESTIONS.md](16_RISKS_AND_QUESTIONS.md) | Risks, policy questions, defects |
| [17_CODEX_PROMPTS.md](17_CODEX_PROMPTS.md) | Start, continue, audit, migration prompts |
| [18_SUPABASE_MIGRATION.md](18_SUPABASE_MIGRATION.md) | Rehearsal, validation, cutover, rollback |
| [19_REFERENCE_INDEX.md](19_REFERENCE_INDEX.md) | UI image mapping and technical sources |

Place `AGENTS.md` at the repository root so Codex discovers instructions for all code. A file only inside `doc/` would not automatically guide edits elsewhere.

Initial state: only documents and conceptual references exist; repository implementation is uninspected. All implementation tasks begin NOT_STARTED. Stack selections are proposed defaults, except the user's confirmed local-PostgreSQL requirement.

Keep these distinctions clear: a design preview is not a functioning module; membership dates are separate from money owed and access eligibility; unpaid invoices are separate from paid receipts; a working local demo is not a production release; a migration plan is not a verified migration.
