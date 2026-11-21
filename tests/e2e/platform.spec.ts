import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { securityFixture } from "../helpers/security-fixture";
import { bootstrapPlatformAdmin } from "../../src/server/platform/bootstrap";
import { configureAuth } from "../../src/server/auth/configure";
const expect = baseExpect.configure({ timeout: 15000 });
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const base = "http://127.0.0.1:3100",
  secret = process.env.BETTER_AUTH_SECRET!;
let f: Awaited<ReturnType<typeof securityFixture>>, platformId: string;
const adminEmail = randomUUID() + "@example.invalid",
  adminPassword = randomBytes(20).toString("hex");
const slug = "browser-" + randomUUID(),
  ownerEmail = randomUUID() + "@example.invalid",
  ownerPassword = randomBytes(20).toString("hex");
const name = "Harbor Fitness QA";
const cookies: Record<string, { name: string; value: string }[]> = {};
const auth = configureAuth(pool, {
  secret,
  baseURL: base,
  sendReset: async () => {
    throw Error("No external email during platform test");
  },
});
async function loginCookies(key: string, email: string, password: string) {
  const r = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  expect(r.status).toBe(200);
  cookies[key] = r.headers.getSetCookie().map((c) => {
    const part = c.split(";")[0],
      i = part.indexOf("=");
    return { name: part.slice(0, i), value: part.slice(i + 1) };
  });
}
async function session(page: Page, key: string) {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies(
      cookies[key].map((c) => ({
        ...c,
        url: base,
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
}
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(admin, secret, base);
  platformId = (
    await bootstrapPlatformAdmin(
      admin,
      {
        name: "Platform administrator QA",
        email: adminEmail,
        password: adminPassword,
      },
      { secret, baseURL: base },
    )
  ).userId;
  await loginCookies("admin", adminEmail, adminPassword);
  await loginCookies(
    "owner",
    f.users["Owner A"].email,
    f.users["Owner A"].password,
  );
});
test.afterAll(async () => {
  const ids = (
    await admin.query("select id from gym.organizations where slug=$1", [slug])
  ).rows.map((r) => r.id);
  const owner = (
    await admin.query('select id from app_auth."user" where email=$1', [
      ownerEmail,
    ])
  ).rows.map((r) => r.id);
  await admin.query(
    "delete from platform.events where organization_id=any($1::uuid[])",
    [[...ids, f.orgA, f.orgB]],
  );
  for (const id of ids) {
    for (const table of [
      "audit_events",
      "staff_branch_grants",
      "staff_memberships",
      "branches",
    ])
      await admin.query(`delete from gym.${table} where organization_id=$1`, [
        id,
      ]);
    await admin.query("delete from gym.organizations where id=$1", [id]);
  }
  await f.cleanup();
  await admin.query("delete from platform.administrators where user_id=$1", [
    platformId,
  ]);
  await admin.query('delete from app_auth."user" where id=any($1::text[])', [
    [...owner, platformId],
  ]);
  await pool.end();
  await admin.end();
});
test("platform login routes to console; owner, anonymous, cross-origin and revoked grants are denied", async ({
  page,
}) => {
  expect((await page.request.get("/api/platform")).status()).toBe(401);
  await session(page, "owner");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Platform access unavailable" }),
  ).toBeVisible();
  expect((await page.request.get("/api/platform")).status()).toBe(403);
  await session(page, "admin");
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Your gym network" }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/platform", {
        headers: { origin: "https://outside.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await admin.query(
    "update platform.administrators set active=false where user_id=$1",
    [platformId],
  );
  try {
    expect((await page.request.get("/api/platform")).status()).toBe(403);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Platform access unavailable" }),
    ).toBeVisible();
  } finally {
    await admin.query(
      "update platform.administrators set active=true where user_id=$1",
      [platformId],
    );
  }
});
test("new gym safely replays a lost response; manage suspension, activity and responsive console", async ({
  page,
}) => {
  test.setTimeout(60000);
  await session(page, "admin");
  await page.goto("/admin");
  await page.getByRole("button", { name: "Create gym", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("Gym name", { exact: true }).fill(name);
  await drawer.getByLabel("Gym email",{exact:true}).fill("contact@example.invalid");
  await drawer.getByLabel("Gym contact number").fill("03001234567");
  await drawer.getByLabel("Gym address").fill("Lahore test gym address");
  await drawer.getByLabel("Gym slug").fill(slug);
  await drawer.getByLabel("Owner name").fill("Harbor owner QA");
  await drawer.getByLabel("Owner email").fill(ownerEmail);
  await drawer.getByLabel("Initial owner password").fill(ownerPassword);
  await drawer.getByLabel("Reason").fill("Approved new gym registration");
  let lost = true;
  await page.route("**/api/platform", async (route) => {
    if (route.request().method() === "POST" && lost) {
      lost = false;
      await route.fetch();
      await route.abort("connectionfailed");
    } else await route.continue();
  });
  await drawer.getByRole("button", { name: "Create gym and owner" }).click();
  await expect(
    drawer.getByText("Your submitted values are kept for a safe retry."),
  ).toBeVisible();
  await expect(drawer.getByLabel("Gym name", { exact: true })).toBeDisabled();
  await drawer.getByRole("button", { name: "Retry saved request" }).click();
  await expect(
    drawer.getByRole("heading", { name: "Workspace saved" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  const org = (
    await admin.query("select id from gym.organizations where slug=$1", [slug])
  ).rows;
  expect(org).toHaveLength(1);
  expect(
    (
      await admin.query(
        "select count(*)::int n from platform.events where organization_id=$1",
        [org[0].id],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(
    page.getByRole("button", { name: `Manage ${name}`, exact: true }),
  ).toBeVisible();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("heading", { name: "Gym workspaces", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `doc/evidence/platform-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: `Manage ${name}`, exact: true })
    .click();
  await drawer
    .getByLabel("Workspace access", { exact: true })
    .selectOption("false");
  await drawer.getByLabel("Reason").fill("Paused until onboarding is complete");
  await drawer
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Workspace saved" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: `Manage ${name}`, exact: true }),
    });
  await expect(row.getByText("Suspended", { exact: true })).toBeVisible();
  await loginCookies("new-owner", ownerEmail, ownerPassword);
  await session(page, "new-owner");
  expect((await page.request.get("/api/workspace")).status()).toBe(403);
  await session(page, "admin");
  await page.goto("/admin");
  await page
    .getByRole("button", { name: `Manage ${name}`, exact: true })
    .click();
  await drawer
    .getByLabel("Workspace access", { exact: true })
    .selectOption("true");
  await drawer.getByLabel("Reason").fill("Onboarding complete; restore access");
  await drawer
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Workspace saved" }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("row")
    .filter({
      has: page.getByRole("button", { name: `Manage ${name}`, exact: true }),
    })
    .getByRole("link", { name: "Activity", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp("organizationId=" + org[0].id));
  await expect(
    page
      .getByRole("table", { name: "Audited gym and platform activity" })
      .getByText("gym.created", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Audited gym and platform activity" })
      .getByText("Scope Gym B", { exact: true }),
  ).toHaveCount(0);
  await session(page, "new-owner");
  expect((await page.request.get("/api/workspace")).status()).toBe(200);
});
