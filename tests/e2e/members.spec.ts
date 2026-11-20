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
  for (const name of ["Owner A", "Owner B", "Reception A"]) {
    const u = f.users[name];
    const r = await auth.api.signInEmail({
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
async function session(
  page: import("@playwright/test").Page,
  name = "Owner A",
) {
  await page.context().clearCookies();
  await page.context().addCookies(
    cookies[name].flatMap((c) =>
      ["127.0.0.1", "localhost"].map((host) => ({
        ...c,
        url: `http://${host}:3100`,
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    ),
  );
}
async function open(page: import("@playwright/test").Page, name = "Owner A") {
  await session(page, name);
  await page.goto("/members?organizationId=" + f.orgA);
  await expect(
    page.getByRole("heading", { name: "Members", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add member", exact: true }),
  ).toBeEnabled();
}
const origin = { origin: "http://127.0.0.1:3100" };
async function seed(
  page: import("@playwright/test").Page,
  changes: Record<string, unknown> = {},
) {
  const r = await page.request.post("/api/members", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      registrationKey: randomUUID(),
      name: "Seed Member",
      phone: "",
      email: randomUUID() + "@example.invalid",
      homeBranchId: f.a1,
      joinedOn: "2026-01-01",
      ...changes,
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.member;
}
async function form(
  page: import("@playwright/test").Page,
  name: string,
  phone: string,
) {
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Full name", { exact: true }).fill(name);
  await d.getByLabel("Phone", { exact: true }).fill(phone);
  return d;
}
async function refreshed(page: import("@playwright/test").Page) {
  await expect(page.getByText("Loading members…", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Add member", exact: true }),
  ).toBeEnabled();
}
test("registration reviews details, persists after reload and matches responsive directory style", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.goto("http://localhost:3100/members?organizationId=" + f.orgA);
  await refreshed(page);
  await expect(
    page.getByText("No members registered yet", { exact: true }),
  ).toBeVisible();
  const d = await form(page, "Sara Ahmed", "0300 1234567");
  await d.getByLabel("Joining date").fill("2026-11-01");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: "test-results/member-registration-390.png" });
  await d
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await expect(
    d.getByText("No membership, invoice or payment will be created.", {
      exact: false,
    }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Back to details" }).click();
  await expect(d.getByLabel("Full name", { exact: true })).toHaveValue(
    "Sara Ahmed",
  );
  await d
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await d.getByRole("button", { name: "Register member", exact: true }).click();
  await expect(d).toHaveCount(0);
  await refreshed(page);
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Sara Ahmed" }),
  ).toContainText("M-000001");
  for (const [name, phone] of [
    ["Hamza Rauf", "03001112222"],
    ["Ayesha Khan", "03002223333"],
    ["Bilal Hassan", "03003334444"],
    ["Zain Ali", "03004445555"],
    ["Maryam Shah", "03005556666"],
  ])
    await seed(page, { name, phone, email: "" });
  await page.getByRole("button", { name: "Reload directory" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Maryam Shah" }),
  ).toBeVisible();
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await refreshed(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/members-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "About Member directory" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".info-popover:popover-open")).toContainText(
    "Registration alone",
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(await page.locator("body").innerText()).not.toMatch(
    /demo|\bfixture\b/i,
  );
});
test("shared contact warning allows a reasoned family registration and contact edit", async ({
  page,
}) => {
  await open(page);
  await seed(page, {
    name: "Family Original",
    phone: "0311 4445555",
    email: "",
  });
  await page.getByRole("button", { name: "Reload directory" }).click();
  await refreshed(page);
  const d = await form(page, "Family Second", "(0311) 444-5555");
  await d
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await d.getByRole("button", { name: "Register member", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("Possible shared contact");
  await expect(
    d.getByRole("region", { name: "Possible shared contacts" }),
  ).toContainText("Family Original");
  await expect(
    d.getByRole("button", { name: "Register member", exact: true }),
  ).toBeDisabled();
  await d
    .getByRole("checkbox", {
      name: "This is a different person using a shared contact",
    })
    .check();
  await d
    .getByLabel("Shared contact reason")
    .fill("Siblings share the family phone");
  await d.getByRole("button", { name: "Register member", exact: true }).click();
  await expect(d).toHaveCount(0);
  await refreshed(page);
  await page
    .getByRole("button", { name: "Edit Family Original", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("family@example.invalid");
  await page
    .getByRole("dialog")
    .getByLabel("Reason for change")
    .fill("Add individual email");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save member", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await refreshed(page);
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Family Original" }),
  ).toContainText("family@example.invalid");
});
test("server search, sorting, pagination and branch filters work on mobile", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  for (let i = 0; i < 28; i++)
    await seed(page, {
      name: `List Member ${String(i).padStart(2, "0")}`,
      joinedOn: `2026-01-${String(i + 1).padStart(2, "0")}`,
    });
  await seed(page, { name: "North Only", homeBranchId: f.a2 });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByLabel("Search members", { exact: true }).fill("List Member");
  await expect(
    page.getByText("Showing 1–25 of 28", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Showing 26–28 of 28", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Sort members", { exact: true }).selectOption("newest");
  await expect(
    page.getByText("Showing 1–25 of 28", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText(
    "List Member 27",
  );
  await expect(page).toHaveURL(/sort=newest/);
  await page
    .getByLabel("Search members", { exact: true })
    .fill("Impossible match");
  await expect(
    page.getByRole("heading", { name: "No members match this view" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await refreshed(page);
  await page.getByLabel("Branch scope", { exact: true }).selectOption(f.a2);
  await expect(
    page.getByRole("row").filter({ hasText: "North Only" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page).toHaveURL(new RegExp("branchId=" + f.a2));
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("direct API and UI enforce branch, role, session and request boundaries", async ({
  page,
  browser,
}) => {
  const anonymous = await browser.newContext();
  try {
    expect(
      (
        await anonymous.request.get("http://127.0.0.1:3100/api/members")
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  await open(page);
  const north = await seed(page, { name: "Private North", homeBranchId: f.a2 });
  await open(page, "Reception A");
  await expect(page.getByLabel("Branch scope", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Private North" }),
  ).toHaveCount(0);
  for (const query of [
    `organizationId=${f.orgB}`,
    `organizationId=${f.orgA}&branchId=${f.a2}`,
  ])
    expect((await page.request.get("/api/members?" + query)).status()).toBe(
      404,
    );
  const body = {
    organizationId: f.orgA,
    id: north.id,
    version: north.version,
    name: north.name,
    phone: north.phone,
    email: north.email,
    homeBranchId: north.homeBranchId,
    joinedOn: north.joinedOn,
    reason: "Tampered branch edit",
  };
  expect(
    (
      await page.request.patch("/api/members", { headers: origin, data: body })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.patch("/api/members", {
        headers: origin,
        data: { ...body, role: "owner" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.patch("/api/members", {
        headers: { origin: "https://untrusted.example" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/members", {
        headers: origin,
        data: { name: "x".repeat(33000) },
      })
    ).status(),
  ).toBe(422);
  await page.goto("/members?page=0");
  await expect(
    page.getByRole("heading", { name: "Check your member filters" }),
  ).toBeVisible();
  await admin.query(
    "update gym.staff_memberships set active=false where id=$1",
    [f.memberships.reception],
  );
  try {
    expect(
      (
        await page.request.get("/api/members?organizationId=" + f.orgA)
      ).status(),
    ).toBe(404);
    await page.goto("/members");
    await expect(
      page.getByRole("heading", { name: "Members unavailable" }),
    ).toBeVisible();
  } finally {
    await admin.query(
      "update gym.staff_memberships set active=true where id=$1",
      [f.memberships.reception],
    );
  }
});
test("lost registration response retries once and refresh failures require reload", async ({
  page,
}) => {
  await open(page);
  let intercepted = false;
  await page.route("**/api/members", async (route) => {
    if (route.request().method() === "POST" && !intercepted) {
      intercepted = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  const d = await form(page, "Retry Person", "03218889999");
  await d
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await d.getByRole("button", { name: "Register member", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("Your inputs are kept");
  await expect(d).toContainText("Retry Person");
  await page.unroute("**/api/members");
  await d.getByRole("button", { name: "Register member", exact: true }).click();
  await expect(d).toHaveCount(0);
  await refreshed(page);
  expect(
    (
      await (
        await page.request.get(
          "/api/members?organizationId=" + f.orgA + "&q=Retry%20Person",
        )
      ).json()
    ).data.total,
  ).toBe(1);
  await page.route("**/api/members?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Temporary directory failure" },
      }),
    }),
  );
  const next = await form(page, "Saved Before Refresh", "03217776666");
  await next
    .getByRole("button", { name: "Review registration", exact: true })
    .click();
  await next
    .getByRole("button", { name: "Register member", exact: true })
    .click();
  await expect(next).toHaveCount(0);
  await expect(page.locator(".members-main").getByRole("alert")).toContainText(
    "Temporary directory failure",
  );
  await expect(
    page.getByRole("button", { name: "Add member", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("tbody")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: "test-results/members-refresh-error-390.png",
    fullPage: true,
  });
  await page.unroute("**/api/members?**");
  await page.getByRole("button", { name: "Retry directory" }).click();
  await refreshed(page);
  expect(
    (
      await (
        await page.request.get(
          "/api/members?organizationId=" +
            f.orgA +
            "&q=Saved%20Before%20Refresh",
        )
      ).json()
    ).data.total,
  ).toBe(1);
});
test("stale edit keeps local fields and the directory reload reveals the saved revision", async ({
  page,
}) => {
  await open(page);
  const member = await seed(page, { name: "Stale Person" });
  await page.getByRole("button", { name: "Reload directory" }).click();
  await refreshed(page);
  await page.getByLabel("Search members", { exact: true }).fill("Stale Person");
  await expect(
    page.getByRole("button", { name: "Edit Stale Person", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit Stale Person", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Full name", { exact: true }).fill("Local Unsaved Name");
  await d.getByLabel("Reason for change").fill("Local stale correction");
  expect(
    (
      await page.request.patch("/api/members", {
        headers: origin,
        data: {
          organizationId: f.orgA,
          id: member.id,
          version: member.version,
          name: "Stale Person Saved",
          phone: member.phone,
          email: member.email,
          homeBranchId: member.homeBranchId,
          joinedOn: member.joinedOn,
          reason: "Other operator correction",
        },
      })
    ).status(),
  ).toBe(200);
  await d.getByRole("button", { name: "Save member", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("This member changed");
  await expect(d.getByLabel("Full name", { exact: true })).toHaveValue(
    "Local Unsaved Name",
  );
  await page.keyboard.press("Escape");
  await expect(d).toHaveCount(0);
  await page.getByRole("button", { name: "Reload directory" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Stale Person Saved" }),
  ).toBeVisible();
});

test("a slow search response cannot replace the latest requested results", async ({
  page,
}) => {
  await open(page);
  await seed(page, { name: "Slow Search Person" });
  await seed(page, { name: "Latest Search Person" });
  await page.route("**/api/members?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("q") === "Slow Search"
    ) {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        await route.fulfill({ response });
      } catch {} // The client deliberately aborted this obsolete request.
    } else await route.continue();
  });
  await page.getByLabel("Search members", { exact: true }).fill("Slow Search");
  await page.waitForRequest((r) => r.url().includes("q=Slow+Search"));
  await page
    .getByLabel("Search members", { exact: true })
    .fill("Latest Search");
  await expect(
    page.getByRole("row").filter({ hasText: "Latest Search Person" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Slow Search Person" }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  await expect(
    page.getByRole("row").filter({ hasText: "Latest Search Person" }),
  ).toBeVisible();
});
