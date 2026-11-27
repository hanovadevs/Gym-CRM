import { test, expect } from "@playwright/test";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
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
test("reports filter, export and full print preview remain scoped and responsive", async ({
  page,
  baseURL,
}) => {
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
      const value = c.split(";")[0],
        i = value.indexOf("=");
      return {
        name: value.slice(0, i),
        value: value.slice(i + 1),
        url: baseURL!,
      };
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/reports?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible();
  await mkdir("doc/evidence", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "doc/evidence/reports-1440.png",
    fullPage: true,
    caret: "initial",
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "doc/evidence/reports-390.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByLabel("Report", { exact: true }).selectOption("attendance");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/report=attendance/);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain("attendance");
  await page.getByRole("link", { name: "Print preview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Print report", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  expect(
    await page.locator("thead").evaluate((el) => getComputedStyle(el).display),
  ).toBe("table-header-group");
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("link", { name: "Back to reports" }).click();
  await expect(page.getByLabel("Report", { exact: true })).toHaveValue(
    "attendance",
  );
  expect(errors).toEqual([]);
  expect(
    (await page.request.get("/api/reports?organizationId=" + f.orgB)).status(),
  ).toBe(404);
});
