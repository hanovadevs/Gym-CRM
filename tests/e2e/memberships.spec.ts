import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
import { todayInZone, endOn } from "../../src/modules/plans/format";
const expect = baseExpect.configure({ timeout: 15000 }),
  admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>,
  planVersionId = "",
  memberIndex = 0;
const cookies: Record<string, { name: string; value: string }[]> = {},
  origin = { origin: "http://127.0.0.1:3100" },
  today = todayInZone("Asia/Karachi");
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
  for (const name of ["Owner A", "Reception A", "Shared Staff"]) {
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
async function setup(page: Page, name: string, branch = f.a1) {
  await session(page);
  if (!planVersionId) {
    const r = await page.request.post("/api/plans", {
      headers: origin,
      data: {
        organizationId: f.orgA,
        branchId: f.a1,
        code: "MEMBERSHIP-UI",
        values: {
          name: "Monthly strength",
          amountMinor: 450025,
          currency: "PKR",
          durationUnit: "months",
          durationCount: 1,
          accessMode: "home_branch",
          gymFloor: true,
          classes: true,
          personalTraining: false,
        },
        requestKey: randomUUID(),
        reason: "Membership UI plan",
      },
    });
    expect(r.status()).toBe(200);
    planVersionId = (await r.json()).data.versionId;
  }
  const r = await page.request.post("/api/members", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      name,
      phone:
        name === "Sara Ahmed"
          ? "+92 300 1234567"
          : "+92 300 " + String(1000000 + ++memberIndex),
      email:
        name === "Sara Ahmed"
          ? "sara.ahmed@example.invalid"
          : randomUUID() + "@example.invalid",
      homeBranchId: branch,
      joinedOn: today,
      registrationKey: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.member.id as string;
}
async function context(page: Page, id: string) {
  const r = await page.request.get(
    `/api/members/${id}/memberships?organizationId=${f.orgA}`,
  );
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function open(page: Page, id: string) {
  await page.goto(`/members/${id}?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Membership", exact: true }),
  ).toBeVisible();
}
async function seedEnrollment(page: Page, id: string, mode = "enroll") {
  const c = await context(page, id),
    r = await page.request.post(`/api/members/${id}/memberships`, {
      headers: origin,
      data: {
        organizationId: f.orgA,
        memberVersion: c.memberVersion,
        mode,
        planVersionId,
        requestKey: randomUUID(),
        reason: "Seed a real enrollment",
      },
    });
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function change(
  page: Page,
  id: string,
  membershipId: string,
  operation: string,
  extra = {},
) {
  const c = await context(page, id),
    m = c.memberships.find((m: { id: string }) => m.id === membershipId),
    r = await page.request.patch(`/api/members/${id}/memberships`, {
      headers: origin,
      data: {
        organizationId: f.orgA,
        memberVersion: c.memberVersion,
        membershipId,
        version: m.version,
        operation,
        requestKey: randomUUID(),
        reason: "Reasoned lifecycle setup",
        ...extra,
      },
    });
  expect(r.status()).toBe(200);
  return (await r.json()).data;
}
async function review(page: Page, action = "Enroll member") {
  await page.getByRole("button", { name: action, exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Find plan", { exact: true }).fill("Monthly");
  await d.getByRole("button", { name: "Search plans", exact: true }).click();
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Reviewed membership terms");
  await d
    .getByRole("button", { name: "Review membership", exact: true })
    .click();
  await expect(
    d.getByRole("region", { name: "Enrollment review" }),
  ).toBeVisible();
  return d;
}
test("reviewed enrollment, activation, freeze/reversal, renewal and cancellation persist with reference layouts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await setup(page, "Sara Ahmed");
  await open(page, id);
  let d = await review(page);
  await expect(d).toContainText("4,500.25");
  await expect(d).toContainText("Pending activation");
  expect(
    (await admin.query("select id from gym.invoices where member_id=$1", [id]))
      .rowCount,
  ).toBe(0);
  await d
    .getByRole("button", { name: "Confirm enrollment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let c = await context(page, id),
    m = c.memberships[0];
  expect(m.lifecycle).toBe("pending");
  const region = page.getByRole("region", { name: "Memberships", exact: true });
  await region
    .getByRole("button", { name: "Activate with debt", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Owner approves access before payment");
  await page
    .getByRole("button", { name: "Confirm activation", exact: true })
    .click();
  await expect(region.getByText("Active", { exact: true })).toBeVisible();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width > 960) {
      await expect.poll(async () => page.evaluate(() => {
        const nav = document.querySelector(".app-sidebar")!.getBoundingClientRect();
        const content = document.querySelector(".settings-content")!.getBoundingClientRect();
        return content.left >= nav.right;
      })).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/membership-${width}.png`,
      fullPage: true,
    });
  }
  await region
    .getByRole("button", { name: "Freeze membership", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Freeze from", { exact: true }).fill(today);
  await d
    .getByLabel("Resume on (exclusive)", { exact: true })
    .fill(endOn(today, 2, "days"));
  await d.getByLabel("Reason").fill("Two day planned break");
  await d.getByRole("button", { name: "Confirm freeze", exact: true }).click();
  await expect(
    region.locator(".pill").filter({ hasText: /^Frozen$/ }),
  ).toBeVisible();
  c = await context(page, id);
  expect(c.memberships[0].endOn).toBe(
    endOn(endOn(today, 1, "months"), 2, "days"),
  );
  await region
    .getByRole("button", { name: "Reverse freeze", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Member returned before the break");
  await page
    .getByRole("button", { name: "Confirm reversal", exact: true })
    .click();
  await expect(
    region.getByText("Reversed freeze:", { exact: false }),
  ).toBeVisible();
  d = await review(page, "Renew membership");
  await expect(d.getByLabel("Start date")).toHaveValue(
    endOn(today, 1, "months"),
  );
  await d.getByRole("button", { name: "Confirm renewal", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  c = await context(page, id);
  expect(c.total).toBe(2);
  const original = c.memberships.find((r: { id: string }) => r.id === m.id),
    invoice = original.invoice.number;
  const card = region.getByRole("article", {
    name: `Membership Monthly strength from ${today}`,
    exact: true,
  });
  await card
    .getByRole("button", { name: "Cancel membership", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason")
    .fill("Stop access without refunding the invoice");
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(card.getByText("Cancelled", { exact: true })).toBeVisible();
  await page.reload();
  c = await context(page, id);
  m = c.memberships.find((r: { id: string }) => r.id === m.id);
  expect(m.invoice.number).toBe(invoice);
  expect(m.invoice.totalMinor).toBe(450025);
  expect(errors).toEqual([]);
});
test("lost enrollment response replays one invoice and membership with the retained review", async ({
  page,
}) => {
  const id = await setup(page, "Retry member");
  await open(page, id);
  const d = await review(page);
  let lost = false;
  await page.route(`**/api/members/${id}/memberships`, async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await d
    .getByRole("button", { name: "Confirm enrollment", exact: true })
    .click();
  await expect(d.getByRole("alert")).toContainText("inputs are kept");
  await expect(d.getByLabel("Reason")).toHaveValue("Reviewed membership terms");
  await d
    .getByRole("button", { name: "Confirm enrollment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await context(page, id)).total).toBe(1);
  expect(
    (await admin.query("select id from gym.invoices where member_id=$1", [id]))
      .rowCount,
  ).toBe(1);
});
test("a concurrent renewal cannot be overwritten or charged again by a stale confirmation", async ({
  page,
}) => {
  const id = await setup(page, "Stale renewal");
  await seedEnrollment(page, id);
  await open(page, id);
  const d = await review(page, "Renew membership");
  await seedEnrollment(page, id, "renew");
  await d.getByRole("button", { name: "Confirm renewal", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("member changed");
  await expect(d.getByLabel("Reason")).toHaveValue("Reviewed membership terms");
  expect((await context(page, id)).total).toBe(2);
});
test("a freeze that collides with a future renewal is rejected without losing the draft", async ({
  page,
}) => {
  const id = await setup(page, "Freeze collision"),
    e = await seedEnrollment(page, id);
  await change(page, id, e.membershipId, "activate");
  await seedEnrollment(page, id, "renew");
  await open(page, id);
  const region = page.getByRole("region", { name: "Memberships", exact: true });
  await region
    .getByRole("button", { name: "Freeze membership", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Reason").fill("Keep the conflicting freeze draft");
  await d.getByRole("button", { name: "Confirm freeze", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("overlaps");
  await expect(d.getByLabel("Reason")).toHaveValue(
    "Keep the conflicting freeze draft",
  );
  expect(
    (
      await admin.query(
        "select id from gym.membership_freezes where membership_id=$1",
        [e.membershipId],
      )
    ).rowCount,
  ).toBe(0);
});
test("a committed enrollment whose refresh fails blocks profile edits until reload", async ({
  page,
}) => {
  const id = await setup(page, "Refresh recovery");
  await open(page, id);
  const d = await review(page);
  await page.route(`**/api/members/${id}/memberships?**`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: "Membership refresh unavailable" } },
    }),
  );
  await d
    .getByRole("button", { name: "Confirm enrollment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit member", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".members-main").getByRole("alert")).toContainText(
    "profile could not refresh",
  );
  await page.unroute(`**/api/members/${id}/memberships?**`);
  await page
    .getByRole("button", { name: "Reload profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Renew membership", exact: true }),
  ).toBeEnabled();
  expect((await context(page, id)).total).toBe(1);
});
test("archival, role, branch and origin boundaries are enforced by the membership API", async ({
  page,
}) => {
  const id = await setup(page, "Scoped membership"),
    e = await seedEnrollment(page, id),
    north = await setup(page, "Private North", f.a2);
  await session(page, "Reception A");
  const c = await context(page, id);
  expect(
    (
      await page.request.patch(`/api/members/${id}/memberships`, {
        headers: origin,
        data: {
          organizationId: f.orgA,
          memberVersion: c.memberVersion,
          membershipId: e.membershipId,
          version: 1,
          operation: "activate",
          requestKey: randomUUID(),
          reason: "Forbidden activation",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        `/api/members/${north}/memberships?organizationId=${f.orgA}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post(`/api/members/${id}/memberships/preview`, {
        headers: { origin: "https://foreign.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await session(page);
  const archived = await page.request.post(`/api/members/${id}/archive`, {
    headers: origin,
    data: {
      organizationId: f.orgA,
      version: c.memberVersion,
      archived: true,
      reason: "Preserve membership history",
    },
  });
  expect(archived.status()).toBe(200);
  await open(page, id);
  await expect(
    page.getByRole("button", { name: "Renew membership", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Blocked: archived member", { exact: true }).first(),
  ).toBeVisible();
  expect((await context(page, id)).total).toBe(1);
  await page.context().clearCookies();
  expect(
    (
      await page.request.get(
        `/api/members/${id}/memberships?organizationId=${f.orgA}`,
      )
    ).status(),
  ).toBe(401);
});
test("saved activation and debt policies affect the real profile without clearing its invoice", async ({
  page,
}) => {
  const id = await setup(page, "Policy member");
  let s = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  let r = await page.request.patch("/api/settings", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      version: s.version,
      changes: { paidActivation: false, debtBlocksAccess: false },
      reason: "Allow configured activation before collection",
    },
  });
  expect(r.status()).toBe(200);
  await open(page, id);
  const d = await review(page);
  await expect(d).toContainText("Initial state: Active");
  await d
    .getByRole("button", { name: "Confirm enrollment", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Memberships", exact: true })
      .getByText("Active", { exact: true }),
  ).toBeVisible();
  s = (
    await (
      await page.request.get("/api/settings?organizationId=" + f.orgA)
    ).json()
  ).data;
  r = await page.request.patch("/api/settings", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      version: s.version,
      changes: { debtBlocksAccess: true },
      reason: "Require due debt clearance for access",
    },
  });
  expect(r.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByText("Blocked: unpaid charges", { exact: true }).first(),
  ).toBeVisible();
  expect((await context(page, id)).memberships[0].invoice.totalMinor).toBe(
    450025,
  );
});
