import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { securityFixture } from "./helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
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

test("employee salary review, replay, partial payment and expense reversal persist on mobile", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydration|hydrated/i.test(m.text()))
      hydrationErrors.push(m.text());
  });
  await session(page);
  await page.goto("/employees?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Employees & salaries", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add employee", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Full name", { exact: true }).fill("Zara Team");
  await d.getByLabel("Job title", { exact: true }).fill("Gym administrator");
  await d
    .getByLabel("Branch", { exact: true })
    .selectOption({ label: "Central" });
  await d.getByLabel("Monthly salary", { exact: true }).fill("50000");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Create employee salary agreement");
  await d.getByRole("button", { name: "Review employee", exact: true }).click();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.employees where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  await d
    .getByRole("button", { name: "Confirm employee", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Payroll saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Zara Team", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record monthly salary", exact: true })
    .click();
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Record agreed monthly salary");
  await d.getByRole("button", { name: "Review payroll", exact: true }).click();
  await d.getByRole("button", { name: "Confirm payroll", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Payroll saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Record salary payment", exact: true })
    .click();
  await d.getByLabel("Payment amount", { exact: true }).fill("20000");
  await d
    .getByLabel("Payment method", { exact: true })
    .selectOption("bank_transfer");
  await d
    .getByLabel("Reference", { exact: true })
    .fill("SALARY-FIRST-TRANSFER");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Pay first salary installment");
  await d.getByRole("button", { name: "Review payroll", exact: true }).click();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.expenses where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  let dropped = false;
  await page.route("**/api/payroll", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await d.getByRole("button", { name: "Confirm payroll", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeEnabled();
  await d.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Payroll saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.unroute("**/api/payroll");
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.expenses where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(1);
  const employeeId = (
    await admin.query("select id from gym.employees where organization_id=$1", [
      f.orgA,
    ])
  ).rows[0].id;
  let data = (
    await (
      await page.request.get(
        "/api/payroll?organizationId=" + f.orgA + "&employeeId=" + employeeId,
      )
    ).json()
  ).data;
  expect(data.selectedCharge.balanceMinor).toBe("3000000");
  await page
    .getByRole("button", { name: "Reverse salary payment", exact: true })
    .click();
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Correct mistaken transfer record");
  await d.getByRole("button", { name: "Review payroll", exact: true }).click();
  await d.getByRole("button", { name: "Confirm payroll", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Payroll saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  data = (
    await (
      await page.request.get(
        "/api/payroll?organizationId=" + f.orgA + "&employeeId=" + employeeId,
      )
    ).json()
  ).data;
  expect(data.selectedCharge.balanceMinor).toBe("5000000");
  expect(data.payments[0].reversed).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Zara Team", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add employee", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: `doc/evidence/payroll-${width}.png`,
      fullPage: true,
    });
  }
  await session(page, "Reception A");
  expect(
    (await page.request.get("/api/payroll?organizationId=" + f.orgA)).status(),
  ).toBe(403);
  await page.goto("/employees?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Employees unavailable", exact: true }),
  ).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
