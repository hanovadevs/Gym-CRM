# Codex prompts

After installing doc/ and root AGENTS.md, copy the starting prompt below into desktop Codex.

## Starting prompt

```text
Build this Jym CRM project using the specification pack in ./doc and the root AGENTS.md.

First read AGENTS.md, doc/00_START_HERE.md, doc/10_MODULE_TRACKER.md, doc/15_SESSION_LOG.md and doc/14_DECISIONS.md. Inspect repository structure, git status, existing code, package scripts, dependencies and database tooling before editing. Preserve working code and my uncommitted changes. Read relevant architecture, design, data, business-rule, security and test documents for the work you perform.

Use my LOCAL PostgreSQL database for now. Do not require Supabase keys/account/cloud DB or a local Supabase/Docker stack. Prepare for a later move to Supabase-hosted PostgreSQL with the same services, business IDs and app-managed authentication. Keep portable committed migrations; no auth.uid dependency or database-owner runtime connection. Discover the installed PostgreSQL version and existing environment configuration without exposing secrets.

Open doc/references/01_dashboard.png and the relevant page images from doc/19_REFERENCE_INDEX.md. Match their sleek white/sage/charcoal direction closely: soft rounded panels, generous spacing, text-first navigation, very few icons, no gradients, emojis, blinking dots, decorative lines or crowding. Fix illustrative sample-data inconsistencies using the written business rules.

Use an existing sound stack if present. For a new project, proposed defaults are Next.js App Router, TypeScript, Tailwind CSS, Drizzle with node-postgres, and Better Auth stored in PostgreSQL. Verify compatible current official APIs, lock versions and record choices/adaptations in the decision log.

Complete FND-01, FND-02 and FND-03 first: repository audit; app/tooling foundation; responsive shared shell and polished dashboard preview. Establish shared tokens/table/form/drawer patterns. Mark fixtures visibly as demo data. Do not create thirteen disconnected placeholder pages or claim backend completion from screenshots.

Then work on DB-01/DB-02 if safe local DB access is available. If a credential/database/tool is missing, document the exact blocker safely and continue independent work. Ask only for a specific required input that cannot be discovered. Do not stop after proposing a plan or repeatedly ask permission for routine local implementation.

Track each module's UI, server/API, DB and QA in doc/10_MODULE_TRACKER.md. Keep task statuses/evidence in doc/11_BACKLOG.md, decisions in doc/14_DECISIONS.md, blockers in doc/16_RISKS_AND_QUESTIONS.md, and append a handoff to doc/15_SESSION_LOG.md before ending. DONE requires the written acceptance criteria, real persistence and relevant passing checks. Never invent results.

Run appropriate checks and report completed task IDs, working behavior, actual results, remaining blockers and the exact next task. Proceed with implementation now.
```

## Continue

```text
Continue Jym CRM from repository evidence. Read AGENTS.md, tracker/backlog, latest handoff and relevant decisions. Verify previous work and preserve user changes. Choose the next eligible task in dependency order and complete a coherent workflow against local PostgreSQL. Run relevant checks; update tracker/backlog/session log and changed decisions. Do not recreate the shell or replan everything. Report working behavior, evidence, blockers and next task.
```

## Complete one module

```text
Complete module Mxx using its specification, business rules, permissions and reference. Inspect actual UI/server/database/tests to identify missing work. Finish acceptance criteria, page states and meaningful persistence/security/concurrency checks. Update separate layer statuses honestly; keep VERIFYING/BLOCKED for missing required evidence. Record changes and next action in the project files.
```

## Audit progress

```text
Audit actual code, migrations, running pages and tests against the module tracker/backlog. Find fixture-only behavior, dead actions, missing states, authorization issues and unjustified DONE statuses. Correct trackers to match evidence. Report verified modules, incomplete workflows, release blockers and next three eligible tasks. Do not calculate completion from page count.
```

## Review UI

```text
Compare the running Jym CRM UI with doc/02_DESIGN_SYSTEM.md and matching references. Inspect 1440/1280/768/390px layouts. Fix typography, spacing, density, tokens, panels, navigation, states and excessive icons without changing business behavior or visual direction. Record actual visual checks and remaining differences.
```

## Future migration preparation

```text
Prepare and rehearse moving Jym CRM from local PostgreSQL to Supabase-hosted PostgreSQL using doc/18_SUPABASE_MIGRATION.md. Inspect source/target versions, app schemas, role grants/RLS, migration history, Better Auth data, attachments and connection settings. Preserve app auth and IDs; do not adopt Supabase Auth or expose tables to browsers. Rehearse on an authorized empty staging target, reconcile data/finance and test restricted runtime permissions/TLS. Prepare concrete cutover/rollback evidence. Do not change a live database or perform final cutover without authorization for that action.
```
