import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { todayInZone } from "../../src/modules/plans/format";
import { securityFixture } from "./helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
test.use({ actionTimeout: 15000 });
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }),
  base = "http://127.0.0.1:3100";
let f: Awaited<ReturnType<typeof securityFixture>>;
const cookies: Record<string, { name: string; value: string }[]> = {};
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, base);
  const auth = configureAuth(pool, {
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: base,
    sendReset: async () => {},
  });
  for (const name of ["Owner A", "Reception A"]) {
    const u = f.users[name],
      r = await auth.api.signInEmail({
        body: { email: u.email, password: u.password },
        asResponse: true,
      });
    cookies[name] = r.headers.getSetCookie().map((s) => {
      const p = s.split(";")[0],
        i = p.indexOf("=");
      return { name: p.slice(0, i), value: p.slice(i + 1) };
    });
  }
});
test.afterAll(async () => {
  if (f) {
    const { unlink } = await import("node:fs/promises");
    const jobs = (
      await admin.query(
        "select id from gym.fee_reminder_deliveries where organization_id=any($1::uuid[])",
        [[f.orgA, f.orgB]],
      )
    ).rows;
    for (const j of jobs)
      await unlink(".local/fee-mail/" + j.id + ".json").catch(() => {});
  }

  if (f) await f.cleanup();
  await pool.end();
  await admin.end();
});
async function session(page: Page, name = "Owner A") {
  await page.context().clearCookies();
  await page.context().addCookies(
    cookies[name].map((c) => ({
      ...c,
      url: base,
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}

test("monthly fee registration, retained rate, owner reminders and compact schedule persist", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /hydration|hydrated/i.test(m.text()))
      errors.push(m.text());
  });
  await session(page);
  const today = todayInZone("Asia/Karachi"),
    org = { organizationId: f.orgA };
  async function post(path: string, data: unknown) {
    const r = await page.request.post(path, {
      headers: { origin: base },
      data,
    });
    expect(r.status()).toBe(200);
    return (await r.json()).data;
  }
  const plan = await post("/api/plans", {
    ...org,
    branchId: f.a1,
    code: "MONTHLY-FEE",
    values: {
      name: "Monthly access",
      amountMinor: 500000,
      currency: "PKR",
      durationCount: 1,
      durationUnit: "months",
      accessMode: "home_branch",
      gymFloor: true,
      classes: true,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Browser monthly member fee test",
  });
  const ownerContact = randomUUID() + "@example.invalid";
  await admin.query(
    "insert into gym.gym_accounts(organization_id,auth_user_id,owner_email,created_by,updated_by) values($1,$2,$3,$2,$2)",
    [f.orgA, f.users["Owner A"].id, ownerContact],
  );
  await page.goto("/dashboard?organizationId=" + f.orgA);
  await page
    .getByRole("link", { name: "View fee schedule & reminders", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Member fee schedule", exact: true }),
  ).not.toContainText("Monthly fee member");
  await page.getByRole("link", { name: "Members", exact: true }).click();

  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Full name", { exact: true })
    .fill("Monthly fee member");
  await drawer
    .getByLabel("Email", { exact: true })
    .fill(randomUUID() + "@example.invalid");
  await drawer.getByLabel("Add monthly subscription", { exact: true }).check();
  await drawer
    .getByLabel("Monthly access plan", { exact: true })
    .selectOption(plan.versionId);
  await drawer
    .getByLabel("Member monthly fee (PKR)", { exact: true })
    .fill("3750.50");
  await drawer
    .getByLabel("Subscription start date", { exact: true })
    .fill(today);
  await drawer
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await expect(drawer).toContainText("3,750.50");
  let lost = true;
  await page.route("**/api/members", async (route) => {
    if (route.request().method() === "POST" && lost) {
      lost = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await drawer
    .getByRole("button", { name: "Register member", exact: true })
    .click();
  await expect(drawer.getByRole("alert")).toContainText("same registration");
  await drawer
    .getByRole("button", { name: "Register member", exact: true })
    .click();
  await expect(drawer).toHaveCount(0);
  await page.unroute("**/api/members");
  const record = (
    await admin.query(
      "select id from gym.members where organization_id=$1 and name='Monthly fee member'",
      [f.orgA],
    )
  ).rows;
  expect(record).toHaveLength(1);
  const memberId = record[0].id;
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.memberships where organization_id=$1 and member_id=$2",
        [f.orgA, memberId],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.invoices where organization_id=$1 and member_id=$2",
        [f.orgA, memberId],
      )
    ).rows[0].n,
  ).toBe(1);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".dashboard-fees")).toContainText(
    "Monthly fee member",
  );
  await page
    .getByRole("link", { name: "View fee schedule & reminders", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Member fee schedule", exact: true }),
  ).toContainText("Monthly fee member");
  await page
    .getByRole("link", { name: "Monthly fee member", exact: true })
    .click();

  await expect(
    page.getByRole("region", { name: "Agreed monthly fee" }),
  ).toContainText("3,750.50");
  await page
    .getByRole("button", { name: "Renew membership", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Renew at the saved individual monthly rate");
  await d
    .getByRole("button", { name: "Review membership", exact: true })
    .click();
  await expect(
    d.getByRole("region", { name: "Enrollment review" }),
  ).toContainText("3,750.50");
  await d.getByRole("button", { name: "Confirm renewal", exact: true }).click();
  await expect(d).toHaveCount(0);
  await page.goto("/dashboard?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Member fee reminders", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "View fee schedule & reminders",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View fee schedule & reminders", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Member fee schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Member fee schedule", exact: true }),
  ).toContainText("Monthly fee member");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const overflow = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main *"))
        .filter((e) => {
          if (e.closest("thead")) return false;
          const r = e.getBoundingClientRect();
          return r.right > innerWidth + 1 && r.width > 0;
        })
        .slice(0, 12)
        .map((e) => ({
          tag: e.tagName,
          cls: e.className,
          width: e.getBoundingClientRect().width,
          right: e.getBoundingClientRect().right,
          text: e.textContent?.slice(0, 70),
        })),
    );
    await page.screenshot({
      caret: "initial",
      path: `.local/member-fee-layout-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      JSON.stringify(overflow),
    ).toBe(true);
    expect(overflow, JSON.stringify(overflow)).toEqual([]);

    await page.screenshot({
      caret: "initial",
      path: `doc/evidence/member-fees-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "Send today's summary", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Mail server accepted");
  const jobs = (
    await admin.query(
      "select id,status,attempts,recipient_email from gym.fee_reminder_deliveries where organization_id=$1",
      [f.orgA],
    )
  ).rows;
  expect(jobs).toHaveLength(1);
  expect(jobs[0].recipient_email).toBe(ownerContact);
  expect(jobs[0].attempts).toBe(1);
  await post("/api/member-fees", { operation: "digest", ...org });
  expect(
    (
      await admin.query(
        "select attempts from gym.fee_reminder_deliveries where id=$1",
        [jobs[0].id],
      )
    ).rows[0].attempts,
  ).toBe(1);
  const toggle = page.getByLabel("Email daily member fee summaries", {
    exact: true,
  });
  await toggle.uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Reminder preferences saved",
  );
  await expect(
    page.getByRole("button", { name: "Send today's summary", exact: true }),
  ).toBeDisabled();
  await toggle.check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send today's summary", exact: true }),
  ).toBeEnabled();
  await session(page, "Reception A");
  expect(
    (
      await page.request.get("/api/member-fees?organizationId=" + f.orgA)
    ).status(),
  ).toBe(403);
  await page.goto("/members?organizationId=" + f.orgA);
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(
    page.getByLabel("Add monthly subscription", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
