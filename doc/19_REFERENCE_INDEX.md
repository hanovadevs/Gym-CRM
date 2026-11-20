# Reference index

## Visual references

Conceptual images generated in this conversation on 20 November 2026; not screenshots of a built app. Anchor on the dashboard and unify minor icon/density differences using the design system. Image names, figures and dates are illustrative and may be inconsistent.

| Image | Page | Module |
| --- | --- | --- |
| [01_dashboard.png](references/01_dashboard.png) | Dashboard | M00, M07 |
| [02_members.png](references/02_members.png) | Members | M03 |
| [03_member_profile.png](references/03_member_profile.png) | Member profile | M03, M04 |
| [04_plans.png](references/04_plans.png) | Plans | M04 |
| [05_attendance.png](references/05_attendance.png) | Attendance | M06 |
| [06_payments.png](references/06_payments.png) | Payments/drawer | M05 |
| [07_classes.png](references/07_classes.png) | Classes | M09 |
| [08_trainers.png](references/08_trainers.png) | Trainers | M08 |
| [09_enquiries.png](references/09_enquiries.png) | Enquiries/trials | M10 |
| [10_expenses.png](references/10_expenses.png) | Expenses | M11 |
| [11_reports.png](references/11_reports.png) | Reports | M12 |
| [12_settings.png](references/12_settings.png) | Settings | M02 |
| [13_sign_in.png](references/13_sign_in.png) | Sign in | M01 |

## Official technical sources

Checked during pack preparation on 20 November 2026. Recheck installed-version APIs when implementing. Sources explain platform behavior; product policies are proposed decisions.

- [Next.js App Router](https://nextjs.org/docs/app) — framework.
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication) — session/service authorization.
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security) — protected server entry points.
- [Better Auth Drizzle](https://better-auth.com/docs/adapters/drizzle) — schema/adapter configuration.
- [Better Auth Next.js](https://better-auth.com/docs/integrations/next) — routes/sessions/cookies.
- [Better Auth email/password](https://better-auth.com/docs/authentication/email-password) — maintained authentication.
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations) — generated reviewed SQL.
- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new) — driver setup.
- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres) — direct/session/transaction choice.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) — grants and row policies.
- [Supabase functions](https://supabase.com/docs/guides/database/functions) — function privileges.
- [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html) — export/compatibility.
- [PostgreSQL 18 pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html) — archive restoration.
- [Playwright best practices](https://playwright.dev/docs/best-practices) — isolated user-visible checks.

PG18 links relate to the user's previously mentioned local version; they do not identify the major version a future Supabase project provides. Inspect actual source/target.
