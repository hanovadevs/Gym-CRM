import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
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

test("trainer profiles review, lost-response replay, update and responsive branch directory", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await session(page);
  await page.goto("/trainers?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Trainers", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add trainer", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Full name", { exact: true }).fill("Ayesha Coaching");
  await d
    .getByLabel("Specialties", { exact: true })
    .fill("Strength and mobility");
  await d.getByLabel("Phone", { exact: true }).fill("03000000000");
  await d.getByLabel("Email", { exact: true }).fill("coach@example.invalid");
  await d.getByLabel("Central", { exact: true }).check();
  await d.getByLabel("Reason", { exact: true }).fill("Create coaching profile");
  await d.getByRole("button", { name: "Review trainer", exact: true }).click();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.trainers where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  let dropped = false;
  await page.route("**/api/trainers", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await d.getByRole("button", { name: "Confirm trainer", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeEnabled();
  await d.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Trainer saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.unroute("**/api/trainers");
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.trainers where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(1);
  await page
    .getByRole("button", { name: "View Ayesha Coaching", exact: true })
    .click();
  await d.getByRole("button", { name: "Edit trainer", exact: true }).click();
  await d
    .getByLabel("Specialties", { exact: true })
    .fill("Strength, mobility and recovery");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Update coaching specialties");
  await d.getByRole("button", { name: "Review trainer", exact: true }).click();
  await d.getByRole("button", { name: "Confirm trainer", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Trainer saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Strength, mobility and recovery", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add trainer", exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `doc/evidence/trainers-${width}.png`,
      fullPage: true,
    });
  }
  await session(page, "Reception A");
  await page.goto("/trainers?organizationId=" + f.orgA);
  await expect(
    page.getByRole("button", { name: "Add trainer", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/trainers", {
        headers: { origin: base },
        data: {
          organizationId: f.orgA,
          id: randomUUID(),
          requestKey: randomUUID(),
          name: "Denied trainer",
          branchIds: [f.a1],
          reason: "Denied mutation",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await page.request.get("/api/trainers?organizationId=" + f.orgB)).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        "/api/trainers?organizationId=" + f.orgA + "&branchId=" + f.a2,
      )
    ).status(),
  ).toBe(404);
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await session(page);
  await page.goto("/trainers?organizationId=" + f.orgA);
  await page
    .getByRole("button", { name: "View Ayesha Coaching", exact: true })
    .click();
  await d.getByRole("button", { name: "Edit trainer", exact: true }).click();
  await d
    .getByLabel("Staff sign-in", { exact: true })
    .selectOption({ label: "Reception A" });
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Link existing coaching login");
  await d.getByRole("button", { name: "Review trainer", exact: true }).click();
  await d.getByRole("button", { name: "Confirm trainer", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Trainer saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "View Ayesha Coaching", exact: true })
    .click();
  await d.getByRole("button", { name: "Edit trainer", exact: true }).click();
  await expect(d.getByLabel("Staff sign-in", { exact: true })).toHaveValue(
    f.users["Reception A"].id,
  );
  await page.keyboard.press("Escape");
  await session(page, "Reception A");
  await page.goto("/trainers?organizationId=" + f.orgA);
  await page
    .getByRole("button", { name: "View Ayesha Coaching", exact: true })
    .click();
  await expect(
    d.getByRole("button", { name: "Edit trainer", exact: true }),
  ).toHaveCount(0);
  await expect(
    d.getByText("coach@example.invalid", { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
