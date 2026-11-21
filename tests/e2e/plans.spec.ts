import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import type { Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
const cookies: Record<string, { name: string; value: string }[]> = {};
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(
    admin,
    process.env.BETTER_AUTH_SECRET!,
    "http://127.0.0.1:3100",
  );
  const auth = configureAuth(pool, {
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: "http://127.0.0.1:3100",
    sendReset: async () => {},
  });
  for (const name of ["Owner A", "Owner B", "Shared Staff", "Reception A"]) {
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
  await admin.end();
  await pool.end();
});
async function session(page: Page, name = "Owner A") {
  await page.context().clearCookies();
  await page.context().addCookies(
    cookies[name].map((c) => ({
      ...c,
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}
const origin = { origin: "http://127.0.0.1:3100" };
function values(name = "Monthly strength", amountMinor = 450000) {
  return {
    name,
    amountMinor,
    currency: "PKR",
    durationUnit: "months",
    durationCount: 1,
    accessMode: "home_branch",
    gymFloor: true,
    classes: true,
    personalTraining: false,
  };
}
async function seed(page: Page, name: string, branchId = f.a1) {
  const v = values(
    name,
    name === "All access"
      ? 750000
      : name === "Personal training"
        ? 1500000
        : 450000,
  );
  if (name === "Personal training") {
    v.personalTraining = true;
    v.classes = false;
  }
  if (name === "All access") v.accessMode = "all_branches";
  const r = await page.request.post("/api/plans", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      branchId,
      code: "P-" + randomUUID().slice(0, 8),
      values: v,
      requestKey: randomUUID(),
      reason: "Published test catalog plan",
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function open(page: Page) {
  await page.goto("/plans?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Membership plans", exact: true }),
  ).toBeVisible();
}
async function current(page: Page, id: string) {
  const r = await page.request.get(`/api/plans/${id}?organizationId=${f.orgA}`);
  expect(r.status()).toBe(200);
  return (await r.json()).data.plan;
}
async function fill(page: Page, code: string, name = code) {
  const d = page.getByRole("dialog");
  await d.getByLabel("Plan code", { exact: true }).fill(code);
  await d.getByLabel("Plan name", { exact: true }).fill(name);
  await d.getByLabel("Price (PKR)", { exact: true }).fill("4500.01");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Publish new membership terms");
}
test("create, immutable version history and responsive catalog match the reference", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await session(page);
  await open(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await fill(page, "MONTHLY-UI", "Monthly strength");
  const d = page.getByRole("dialog");
  await d.getByLabel("Preview start date").fill("2027-01-31");
  await expect(d).toContainText("Exclusive end: 2027-02-28");
  await expect(d).toContainText("through 2027-02-27");
  await d.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Plan changes saved");
  await page.reload();
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Monthly strength", exact: true }),
    })
    .first();
  await expect(card).toContainText("4,500.01");
  await card.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Price (PKR)", { exact: true })
    .fill("5000");
  await page
    .getByRole("dialog")
    .getByLabel("Reason", { exact: true })
    .fill("Future enrollments use new rate");
  await page
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await expect(card).toContainText("Version 2");
  await card
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("4,500.01");
  await expect(page.getByRole("dialog")).toContainText("5,000");
  await page.keyboard.press("Escape");
  await seed(page, "All access");
  await seed(page, "Personal training");
  await page.reload();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(
      page.getByRole("heading", { name: "Membership plans", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/plans-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await fill(page, "MOBILE", "Mobile preview");
  await page.getByLabel("Preview start date").fill("2028-01-31");
  await expect(page.getByRole("dialog")).toContainText("2028-02-29");
  await page.screenshot({ path: "test-results/plans-editor-390.png" });
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
test("archive and restore preserve earlier versions without deleting the plan", async ({
  page,
}) => {
  await session(page);
  const { id } = await seed(page, "Archive flow");
  await open(page);
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Archive flow", exact: true }),
  });
  await card.getByRole("button", { name: "Archive plan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Temporarily retire this plan");
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(card).toContainText("Archived");
  await card
    .getByRole("button", { name: "Version history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Version 1");
  await page.keyboard.press("Escape");
  await card.getByRole("button", { name: "Restore plan", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Resume new plan enrollment");
  await page
    .getByRole("button", { name: "Confirm restore", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  expect((await current(page, id)).archivedAt).toBeNull();
});
test("lost create response safely replays one plan and retains the same draft", async ({
  page,
}) => {
  await session(page);
  await open(page);
  let lost = false;
  await page.route("**/api/plans", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await fill(page, "LOST-RESPONSE");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "inputs are kept",
  );
  await expect(page.getByLabel("Plan name", { exact: true })).toHaveValue(
    "LOST-RESPONSE",
  );
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await admin.query(
        "select id from gym.plans where organization_id=$1 and code=$2",
        [f.orgA, "LOST-RESPONSE"],
      )
    ).rowCount,
  ).toBe(1);
});
test("stale editor cannot overwrite a newer version and failed saves keep inputs", async ({
  page,
}) => {
  await session(page);
  const { id } = await seed(page, "Stale plan");
  await open(page);
  const p = await current(page, id),
    card = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Stale plan", exact: true }),
    });
  await card.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Price (PKR)", { exact: true }).fill("6500");
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Retained stale input");
  const r = await page.request.patch("/api/plans", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      id,
      revision: p.revision,
      requestKey: randomUUID(),
      values: values("Stale plan", 550000),
      reason: "Concurrent publication",
    },
  });
  expect(r.status()).toBe(200);
  await page
    .getByRole("button", { name: "Publish version", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "plan changed",
  );
  await expect(page.getByLabel("Price (PKR)", { exact: true })).toHaveValue(
    "6500",
  );
  expect((await current(page, id)).current.amountMinor).toBe(550000);
  await page.keyboard.press("Escape");
});
test("saved plan with failed refresh locks further edits until reload", async ({
  page,
}) => {
  await session(page);
  await open(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await fill(page, "REFRESH-FAILURE");
  await page.route("**/api/plans?**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Refresh unavailable" } },
    }),
  );
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".members-main").getByRole("alert")).toContainText(
    "Reload latest",
  );
  await expect(
    page.getByRole("button", { name: "Create plan", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/api/plans?**");
  await page
    .getByRole("button", { name: "Reload latest", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create plan", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Search plans", { exact: true })
    .fill("REFRESH-FAILURE");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "REFRESH-FAILURE", exact: true }),
  ).toBeVisible();
});
test("read-only reception and assigned managers cannot bypass role, branch, tenant or origin checks", async ({
  page,
}) => {
  await session(page);
  const north = await seed(page, "North private", f.a2);
  await session(page, "Reception A");
  await open(page);
  await expect(
    page.getByRole("button", { name: "Create plan", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "North private", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/plans", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          branchId: f.a1,
          code: "FORBIDDEN",
          values: values(),
          requestKey: randomUUID(),
          reason: "Forbidden creation",
        },
      })
    ).status(),
  ).toBe(403);
  await session(page, "Shared Staff");
  await open(page);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("combobox", { name: "Plan branch", exact: true })
      .locator("option"),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect(
    (
      await page.request.get(`/api/plans/${north.id}?organizationId=${f.orgA}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(
        "/api/plans?organizationId=" + f.orgB + "&branchId=" + f.a1,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(`/api/plans/${north.id}/archive`, {
        headers: { origin: "https://foreign.invalid" },
        data: {
          organizationId: f.orgA,
          revision: 1,
          archived: true,
          reason: "Cross origin",
        },
      })
    ).status(),
  ).toBe(403);
  await page.context().clearCookies();
  expect((await page.request.get("/api/plans")).status()).toBe(401);
});
test("accountant sees a read-only catalog and failed searches hide stale cards until retry", async ({
  page,
}) => {
  await session(page);
  await seed(page, "Accounting plan");
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  try {
    await session(page, "Reception A");
    await open(page);
    const nav = page.getByRole("navigation", { name: "Workspace navigation" });
    await expect(
      nav.getByRole("link", { name: "Members", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create plan", exact: true }),
    ).toHaveCount(0);
    await page.route("**/api/plans?**", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { message: "Catalog temporarily unavailable" } },
      }),
    );
    await page
      .getByLabel("Search plans", { exact: true })
      .fill("Accounting plan");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.locator(".members-main").getByRole("alert"),
    ).toContainText("Catalog temporarily unavailable");
    await expect(page.getByRole("article")).toHaveCount(0);
    await page.unroute("**/api/plans?**");
    await page
      .getByRole("button", { name: "Reload latest", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Accounting plan", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "About Plan versions", exact: true })
      .click();
    await expect(page.locator(".info-popover:popover-open")).toContainText(
      "immutable version",
    );
    await page.keyboard.press("Escape");
  } finally {
    await admin.query(
      "update gym.staff_memberships set role='receptionist' where id=$1",
      [f.memberships.reception],
    );
  }
});
