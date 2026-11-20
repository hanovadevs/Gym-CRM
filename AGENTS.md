# Codex instructions — Jym CRM

## Product and priorities

Build a sellable gym management app using `doc/` and its supplied UI references. User instructions take precedence. Preserve existing working code and user changes. Inspect the repository before introducing the proposed stack. Record material adaptations in `doc/14_DECISIONS.md`.

The user explicitly selected **local PostgreSQL now, easy migration to Supabase later**. No Supabase account, keys, cloud database, Docker, or local Supabase stack is required for normal initial development. Supabase will be a future PostgreSQL host; retain the application services, business IDs, and app-managed authentication.

## Start each session

1. Read this file, `doc/00_START_HERE.md`, `doc/10_MODULE_TRACKER.md`, the latest `doc/15_SESSION_LOG.md` entry, and relevant decisions.
2. Inspect git status, existing code, package scripts, versions, environment configuration, and migrations. Never expose secrets or overwrite unrelated changes.
3. Select the next eligible task ID from `doc/11_BACKLOG.md`. Read its module specification, business rules, security requirements, and relevant tests.
4. Open the matching reference image using `doc/19_REFERENCE_INDEX.md`. Images guide style; written specifications govern behavior and correct sample-data inconsistencies.
5. State a concrete outcome briefly, then implement. If the user says continue, resume from repository evidence and the trackers.

## Implementation rules

- Work in coherent slices: schema/constraints → authorized service → server interface → UI → relevant checks → tracker update. Shell work may use clearly labeled fixtures, but fixture pages are never complete modules.
- Use an existing sound stack; otherwise follow `doc/03_ARCHITECTURE.md`. Verify compatible current official APIs, record package versions, and commit the lockfile. Do not guess version-specific imports.
- Prefer a modular monolith and shared tokens/components. No unsolicited microservices, AI assistants, online payment integrations, or extra services.
- All database access is server-only. Each protected operation verifies session, active organization membership, action permission, and branch scope.
- Use parameterized queries, integer minor-unit money, local calendar dates for memberships, and UTC timestamps for events.
- Enforce financial atomicity/idempotency, tenant constraints, duplicate check-in protection, and booking capacity in services/database constraints, not disabled buttons alone.
- Use committed reviewed Drizzle migrations. Never edit applied migrations, run a destructive reset on valued data, or replace migrations with schema push.
- App runtime uses a restricted non-owner database role; migration credentials are separate. No custom password hashing or authentication built from scratch.
- Keep SQL portable; no `auth.uid()` dependency, browser-to-database access, or Supabase Auth coupling.
- Do not silently delete records/columns, send external messages, buy services, change live infrastructure, or deploy publicly.
- Prepare future cloud migration locally; final live cutover needs authorization for that action.

## UI

Follow `doc/02_DESIGN_SYSTEM.md`: white/sage/charcoal, soft rounded panels, excellent spacing, text-first sidebar, few icons. No gradients, decorative dots/lines, emojis, or crowded screens. Implement loading, empty, error, validation, permission, and responsive states. Visible actions must function or be explicitly unavailable in a development preview.

## Project memory

Update affected module rows in `doc/10_MODULE_TRACKER.md` and task evidence in `doc/11_BACKLOG.md` before ending. Append a handoff to `doc/15_SESSION_LOG.md`; record decisions and new blockers in their dedicated files.

Allowed states: NOT_STARTED, IN_PROGRESS, BLOCKED, VERIFYING, DONE, DEFERRED. Track UI, server/API, database, and QA independently. DONE requires acceptance criteria, actual persisted behavior, relevant passing checks, and evidence. Missing credentials or unavailable tests are blockers/unverified checks, never passes.

Record actual commands, results, migration IDs, file paths, and next action. Never invent completion percentages, test results, screenshot reviews, or deployment URLs. If blocked, state the precise missing input and continue an independent eligible task.

End each session with completed task IDs/behavior, checks actually run/results, material blockers, and the next task. Another Codex session must be able to resume using these files without chat memory.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
