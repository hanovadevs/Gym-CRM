import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(
    admin,
    process.env.BETTER_AUTH_SECRET!,
    "http://127.0.0.1:3100",
  );
});
test.afterAll(async () => {
  if (f) await f.cleanup();
  await pool.end();
  await admin.end();
});
test("enquiry pipeline, follow-up and trial conversion persist through review and retries", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(15000);
  console.log("Enquiries browser: creating owner session");
  const auth = configureAuth(pool, {
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: baseURL!,
    sendReset: async () => {},
  });
  const u = f.users["Owner A"],
    r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
  await page.context().addCookies(
    r.headers.getSetCookie().map((c) => {
      const p = c.split(";")[0],
        i = p.indexOf("=");
      return { name: p.slice(0, i), value: p.slice(i + 1), url: baseURL! };
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  console.log("Enquiries browser: opening pipeline");
  await page.goto("/enquiries?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Enquiries & trials", exact: true }),
  ).toBeVisible();
  console.log("Enquiries browser: registration");
  await page.getByRole("button", { name: "Add enquiry", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Name", { exact: true }).fill("Mariam enquiry");
  await d
    .getByLabel("Email", { exact: true })
    .fill(randomUUID() + "@example.invalid");
  await d.getByLabel("Interest", { exact: true }).fill("Monthly strength");
  await d.getByLabel("Permission to contact recorded").check();
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  await d.getByRole("button", { name: "Back", exact: true }).click();
  await expect(d.getByLabel("Name", { exact: true })).toHaveValue(
    "Mariam enquiry",
  );
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  let lost = false;
  await page.route("**/api/enquiries", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/enquiries");
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("status")).toHaveText("Enquiry change saved.");
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await d
    .getByLabel("Enquiry stage", { exact: true })
    .selectOption("trial_booked");
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await d.getByLabel(/Trial date and time/).fill(tomorrow + "T18:00");
  await d.getByLabel("Reason", { exact: true }).fill("Book an evening trial");
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("status")).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("article")).toContainText("Trial");
  await page
    .getByRole("button", { name: "Add follow-up", exact: true })
    .click();
  await d
    .getByLabel("Planned action", { exact: true })
    .fill("Confirm tomorrow's trial");
  await d.getByLabel("Reason", { exact: true }).fill("Arrange trial");
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("status")).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
  await d.getByLabel("Reason", { exact: true }).fill("Trial confirmed");
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("status")).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark done", exact: true }),
  ).toHaveCount(0);
  console.log("Enquiries browser: converting member");
  const plan = await page.request.post("/api/plans", {
    headers: { origin: baseURL! },
    data: {
      organizationId: f.orgA,
      branchId: f.a1,
      code: "LEAD-BROWSER",
      values: {
        name: "Monthly conversion plan",
        amountMinor: 100000,
        currency: "PKR",
        durationUnit: "months",
        durationCount: 1,
        accessMode: "home_branch",
        gymFloor: true,
        classes: false,
        personalTraining: false,
      },
      requestKey: randomUUID(),
      reason: "Browser conversion plan",
    },
  });
  expect(plan.status()).toBe(200);
  await page
    .getByRole("button", { name: "Refresh enquiries", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Convert to member", exact: true })
    .click();
  await d.getByLabel("Enrollment", { exact: true }).selectOption("enroll");
  await d
    .getByLabel("Membership plan", { exact: true })
    .selectOption({ label: "Monthly conversion plan · Rs 1,000.00" });
  await d.getByLabel("Reason", { exact: true }).fill("Join after the trial");
  await d.getByRole("button", { name: "Review change", exact: true }).click();
  await expect(d).toContainText("Monthly conversion plan");
  await d.getByRole("button", { name: "Save change", exact: true }).click();
  await expect(d.getByRole("status")).toBeVisible();
  await expect(
    d.getByRole("link", { name: "Open converted member", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open member", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add enquiry", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: "doc/evidence/enquiries-" + width + ".png",
        fullPage: true,
        caret: "initial",
      });
  }
  await page.getByRole("link", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Enquiry directory" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recent history", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Completed", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Follow-up tasks" }),
  ).toContainText("Confirm tomorrow's trial");
  const members = await page.request.get(
    "/api/members?organizationId=" + f.orgA + "&q=Mariam",
  );
  expect((await members.json()).data.total).toBe(1);
  const invoices = await admin.query(
    "select count(*)::int n from gym.invoices where organization_id=$1",
    [f.orgA],
  );
  expect(invoices.rows[0].n).toBe(1);
  expect(errors).toEqual([]);
  expect(
    (
      await page.request.get("/api/enquiries?organizationId=" + f.orgB)
    ).status(),
  ).toBe(404);
});
