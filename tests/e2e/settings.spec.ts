import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
const cookies: Record<string, { name: string; value: string }[]> = {};
const extraEmails: string[] = [];
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
  for (const name of ["Owner A", "Shared Staff", "Reception A"]) {
    const u = f.users[name];
    const response = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    cookies[name] = response.headers.getSetCookie().map((raw) => {
      const pair = raw.split(";")[0],
        index = pair.indexOf("=");
      return { name: pair.slice(0, index), value: pair.slice(index + 1) };
    });
  }
});
test.afterAll(async () => {
  if (f) await f.cleanup();
  await admin.query('delete from app_auth."user" where email=any($1::text[])', [
    extraEmails,
  ]);
  await admin.end();
  await pool.end();
});
async function session(
  page: import("@playwright/test").Page,
  name = "Owner A",
) {
  await page.context().addCookies(
    cookies[name].map((cookie) => ({
      ...cookie,
      url: "http://127.0.0.1:3100",
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}
const origin = { origin: "http://127.0.0.1:3100" };
async function openSettings(
  page: import("@playwright/test").Page,
  name = "Owner A",
) {
  await session(page, name);
  await page.goto("/settings?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}
test("general settings persist, affect workspace and reject stale forms without losing input", async ({
  page,
}) => {
  test.setTimeout(60000);
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await openSettings(page);
  await page.getByLabel("Gym name", { exact: true }).fill("Crown Fitness");
  await page.getByLabel("Locale", { exact: true }).fill("bad_locale");
  await expect(page.locator(".receipt-example")).toContainText("4,500");
  await page.getByLabel("Locale", { exact: true }).fill("en-GB");
  await page.getByLabel("Time zone", { exact: true }).fill("Asia/Dubai");
  await page.getByLabel("Currency", { exact: true }).selectOption("AED");
  await page.getByLabel("Receipt prefix", { exact: true }).fill("CROWN");
  await page
    .getByLabel("Receipt footer", { exact: true })
    .fill("Thank you for training with Crown.");
  await page.getByLabel("Expiry grace (days)", { exact: true }).fill("2");
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Prepare Crown workspace");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(page.getByLabel("Gym name", { exact: true })).toHaveValue(
    "Crown Fitness",
  );
  await expect(page.getByLabel("Time zone", { exact: true })).toHaveValue(
    "Asia/Dubai",
  );
  await expect(page.locator(".receipt-example")).toContainText("CROWN-RC-000001");
  const response = await page.request.get(
    "/api/settings?organizationId=" + f.orgA,
  );
  const data = (await response.json()).data;
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          version: data.version,
          changes: { phone: "External edit" },
          reason: "Another operator saved",
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByLabel("Gym name", { exact: true }).fill("Unsaved local name");
  await page
    .getByLabel("Reason for change", { exact: true })
    .fill("Stale browser attempt");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(page.locator(".settings-main").getByRole("alert")).toContainText(
    "Settings changed",
  );
  await expect(page.getByLabel("Gym name", { exact: true })).toHaveValue(
    "Unsaved local name",
  );
  await page.getByRole("button", { name: "Reload latest" }).click();
  await expect(page.getByLabel("Gym name", { exact: true })).toHaveValue(
    "Crown Fitness",
  );
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/settings-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(page.locator(".audit-list")).toContainText(
    "Another operator saved",
  );
  await expect(page.locator(".audit-list")).toContainText("By Owner A");
  await page.screenshot({
    path: "test-results/settings-activity.png",
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
  const w = (
    await (
      await page.request.get("/api/workspace?organizationId=" + f.orgA)
    ).json()
  ).data;
  expect(w.organization.name).toBe("Crown Fitness");
  expect(w.organization.timeZone).toBe("Asia/Dubai");
  expect(w.organization.currency).toBe("AED");
});
test("branch administration persists and prevents disabling every branch", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "General", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Branches", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add branch", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Branch name").fill("South branch");
  await dialog.getByLabel("Branch code").fill("SOUTH");
  await dialog.getByLabel("Reason for change").fill("Open South branch");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "South branch" }),
  ).toContainText("Active");
  await page.screenshot({
    path: "test-results/settings-branches.png",
    fullPage: true,
  });
  const read = await page.request.get("/api/settings?organizationId=" + f.orgA);
  const branches = (await read.json()).data.branches;
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    const r = await page.request.patch("/api/branches", {
      headers: origin,
      data: {
        organizationId: f.orgA,
        id: b.id,
        version: b.version,
        name: b.name,
        code: b.code,
        active: false,
        reason: "Test last active branch safeguard",
      },
    });
    expect(r.status()).toBe(i === branches.length - 1 ? 409 : 200);
  }
  // Restore test branch scope before the staff scenarios.
  const current = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  for (const b of current.branches)
    if (!b.active)
      expect(
        (
          await page.request.patch("/api/branches", {
            headers: origin,
            data: {
              organizationId: f.orgA,
              id: b.id,
              version: b.version,
              name: b.name,
              code: b.code,
              active: true,
              reason: "Restore fixture branches",
            },
          })
        ).status(),
      ).toBe(200);
});
test("owner provisions staff, grants access and revokes a live session; last owner stays protected", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await openSettings(page);
  await page.getByRole("tab", { name: "Team & roles", exact: true }).click();
  await page.screenshot({
    path: "test-results/settings-team.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const email = randomUUID() + "@example.invalid",
    password = randomBytes(20).toString("hex");
  extraEmails.push(email);
  await dialog.getByLabel("Full name").fill("New Receptionist");
  await dialog.getByLabel("Staff email").fill(email);
  await dialog.getByLabel("Initial password").fill(password);
  await dialog.getByRole("checkbox", { name: "Central", exact: true }).check();
  await dialog.getByLabel("Reason for change").fill("Add reception coverage");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "New Receptionist" }),
  ).toBeVisible();
  const member = await browser.newContext();
  try {
    const login = await member.request.post(
      "http://127.0.0.1:3100/api/auth/sign-in/email",
      { headers: origin, data: { email, password } },
    );
    expect(login.status()).toBe(200);
    const w = await member.request.get("http://127.0.0.1:3100/api/workspace");
    expect(w.status()).toBe(200);
    await page
      .getByRole("button", {
        name: "Edit access for New Receptionist",
        exact: true,
      })
      .click();
    dialog = page.getByRole("dialog");
    await dialog
      .getByRole("checkbox", { name: "Active", exact: true })
      .uncheck();
    await dialog
      .getByLabel("Reason for change")
      .fill("Revoke reception account");
    await dialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(
      (
        await member.request.get("http://127.0.0.1:3100/api/workspace")
      ).status(),
    ).toBe(403);
  } finally {
    await member.close();
  }
  await page
    .getByRole("button", { name: "Edit access for Owner A", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: /^Role/ }).selectOption("manager");
  await dialog
    .getByLabel("Reason for change")
    .fill("Test last owner protection");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Keep at least one active owner",
  );
  await expect(dialog.getByRole("combobox", { name: /^Role/ })).toHaveValue(
    "manager",
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "test-results/settings-owner-guard-390.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
test("manager has operational fields only; receptionist and forged requests are rejected", async ({
  page,
}) => {
  await openSettings(page, "Shared Staff");
  await expect(page.getByLabel("Gym name", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Currency", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Phone", { exact: true })).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Team & roles" })).toHaveCount(0);
  let data = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          version: data.version,
          changes: { currency: "USD" },
          reason: "Attempt forbidden finance edit",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/staff", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          id: f.memberships.sharedA,
          version: 1,
          role: "owner",
          active: true,
          branchIds: [f.a1],
          reason: "Attempt self promotion",
        },
      })
    ).status(),
  ).toBe(403);
  await page.getByLabel("Phone", { exact: true }).fill("0300-7654321");
  await page.getByLabel("Reason for change").fill("Update contact number");
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await page.reload();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    "0300-7654321",
  );
  await page.context().clearCookies();
  await session(page, "Reception A");
  expect(
    (await page.request.get("/api/settings?organizationId=" + f.orgA)).status(),
  ).toBe(403);
  await page.goto("/settings?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Settings unavailable" }),
  ).toBeVisible();
  await page.goto("/settings?staffPage=0");
  await expect(
    page.getByRole("heading", { name: "Check your settings selection" }),
  ).toBeVisible();
  await page.context().clearCookies();
  await session(page);
  data = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: { origin: "https://untrusted.example" },
        data: {
          organizationId: f.orgA,
          version: data.version,
          changes: { name: "CSRF" },
          reason: "Cross-site attempt",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: origin,
        data: {
          organizationId: f.orgB,
          version: 1,
          changes: { name: "Cross gym" },
          reason: "Foreign gym",
        },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch("/api/settings", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          version: data.version,
          changes: { graceDays: 31 },
          reason: "Invalid policy",
        },
      })
    ).status(),
  ).toBe(422);
});
test("failed saves keep input; a committed save with failed refresh requires reload", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByLabel("Phone", { exact: true }).fill("Unsent local change");
  await page.getByLabel("Reason for change").fill("Test request recovery");
  await page.route(
    "**/api/settings",
    (route) =>
      route.request().method() === "PATCH" ? route.abort() : route.continue(),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(page.locator(".settings-main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    "Unsent local change",
  );
  await page.route(
    "**/api/settings?organizationId=*",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: { message: "Refresh temporarily unavailable" },
        }),
      }),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Save changes", exact: true })
    .first()
    .click();
  await expect(page.locator(".settings-main").getByRole("alert")).toContainText(
    "Reload latest before editing",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }).first(),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload latest" }).click();
  await expect(page.getByRole("status")).toHaveText("Latest records loaded.");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue(
    "Unsent local change",
  );
});

test("staff pagination is bounded and usable on a narrow screen", async ({
  page,
}) => {
  for (let i = 1; i <= 28; i++) {
    const id = randomUUID(),
      email = id + "@example.invalid";
    extraEmails.push(email);
    await admin.query(
      'insert into app_auth."user"(id,name,email) values($1,$2,$3)',
      [id, "ZPage " + String(i).padStart(2, "0"), email],
    );
    await admin.query(
      "insert into gym.staff_memberships(organization_id,auth_user_id,role,active) values($1,$2,'trainer',false)",
      [f.orgA, id],
    );
  }
  await openSettings(page);
  const initial = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  expect(initial.staff).toHaveLength(25);
  expect(initial.staffTotal).toBeGreaterThan(25);
  expect(
    (
      await page.request.get(
        "/api/settings?organizationId=" + f.orgA + "&staffPage=0",
      )
    ).status(),
  ).toBe(422);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.getByRole("tab", { name: "Team & roles", exact: true }).click();
  await page.getByRole("button", { name: "Next staff page" }).click();
  await expect(page.locator(".staff-pagination")).toContainText("Page 2");
  await expect(
    page.getByRole("row").filter({ hasText: "ZPage 28" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Previous staff page" }).click();
  await expect(page.locator(".staff-pagination")).toContainText("Page 1");
  await expect(
    page.getByRole("row").filter({ hasText: "Owner A" }),
  ).toBeVisible();
});
