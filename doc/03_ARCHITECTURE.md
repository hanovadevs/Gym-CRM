# Architecture

## Proposed defaults

| Layer | Choice | Purpose |
| --- | --- | --- |
| Web/server | Next.js App Router + TypeScript | One deployable modular application |
| UI | Tailwind CSS + accessible headless primitives | Shared deliberate styling |
| Validation | Zod or existing equivalent | Typed inputs; server authoritative |
| Database | Local PostgreSQL | User-selected starting point |
| Queries/migrations | Drizzle + node-postgres + committed SQL | Portable, reviewable PostgreSQL |
| Authentication | Better Auth + PostgreSQL/Drizzle adapter | Keep auth when database host changes |
| Tests | Existing runner or Vitest + Playwright | Business, real DB, browser checks |

Inspect existing repository first. Select compatible stable versions from official docs, commit lockfile and record versions. Do not force a rewrite or guess a major version.

Browser → Next.js server entry → validated context/permissions → module service → repository/Drizzle → PostgreSQL. No browser-to-DB access. Server Components call services directly; Server Actions/Route Handlers wrap the same services. A separate Express/Nest server is unnecessary until a real integration/deployment requirement justifies it.

## Suggested organization

```text
AGENTS.md
doc/
src/app/(auth)/sign-in/
src/app/(app)/dashboard/
src/app/(app)/members/[memberId]/
src/app/(app)/{plans,attendance,payments,classes,trainers,enquiries,expenses,reports,settings}/
src/app/api/auth/[...all]/
src/components/{ui,layout}/
src/modules/<module>/{components,schemas,service,repository,types}
src/server/{auth,context,permissions,db,storage,mail,audit}/
src/lib/{money,dates,formatting}/
drizzle/
scripts/
tests/{unit,integration,e2e}/
```

This is conceptual structure; route braces are shorthand, not literal Next.js directory names. Mark DB/services server-only. Separate browser DTOs from database objects.

## Schemas and local setup

Business schema `gym`, app authentication schema `app_auth`, migration metadata schema `drizzle` or another documented name. Do not use Supabase-managed `auth`/`storage`. Generate/map Better Auth tables using its installed adapter and verify custom namespace behavior before committing migrations.

Runtime role has no ownership, superuser, BYPASSRLS, DDL, or role-management privileges. Migration/admin credentials are separate. Auth identity/session tables are server-private and globally scoped; business tables are tenant-scoped.

Use installed PostgreSQL; Docker optional. Separate dev/test databases. If local PostgreSQL is 18, avoid major-specific features until target version is known. Prefer matching local/target majors in rehearsal; downgrade by dump is not guaranteed.

## Supabase portability

Treat Supabase as PostgreSQL hosting later. Replace server-side connection settings, provision restricted roles, migrate app schemas/data, verify TLS/pooling and RLS, preserve Better Auth hashes/IDs. No dependency on `auth.uid()` or Supabase JWTs. Keep app schemas outside exposed Data API schemas.

Use a suitable direct/session connection for migrations and transfer tools. Runtime pooling can differ. Set tenant context transaction-locally on the same checked-out connection as all business queries; never session-wide SET on a reused pool.

## Other boundaries

- Audit commits with sensitive changes; idempotency is stored transactionally.
- File storage interface uses opaque object keys: private filesystem locally, protected object storage later. A database migration does not move file bytes.
- Mail adapter uses local capture in development and actual delivery before live recovery/invitation.
- Introduce durable jobs/outbox only when scheduled work is implemented; no speculative Redis.
- Organization/branch/permission scope participates in caches. No public/shared caching of personalized data.
- Demo fixtures are explicit; DB errors never fall back to fabricated success.
