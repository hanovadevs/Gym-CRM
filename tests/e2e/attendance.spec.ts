import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { securityFixture } from "./helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";

const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
const cookies: Record<string, { name: string; value: string }[]> = {};
const baseURL = "http://127.0.0.1:3100";
test.beforeAll(async () => {
  await admin.connect();
  f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, baseURL);
  const auth = configureAuth(pool, {
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL,
    sendReset: async () => {},
  });
  for (const name of ["Owner A", "Reception A"]) {
    const u = f.users[name];
    const response = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    cookies[name] = response.headers.getSetCookie().map((value) => {
      const part = value.split(";")[0],
        i = part.indexOf("=");
      return { name: part.slice(0, i), value: part.slice(i + 1) };
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
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax" as const,
    })),
  );
}
async function register(page: Page, name: string) {
  const response = await page.request.post("/api/members", {
    headers: { origin: baseURL },
    data: {
      organizationId: f.orgA,
      name,
      phone: "",
      email: randomUUID() + "@example.invalid",
      homeBranchId: f.a1,
      joinedOn: "2026-11-01",
      registrationKey: randomUUID(),
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).data.member as {
    id: string;
    memberCode: string;
  };
}
async function find(page: Page, query: string) {
  await page.getByLabel("Member lookup").fill(query);
  await Promise.all([
    page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/attendance/lookup",
    ),
    page.getByRole("button", { name: "Find member", exact: true }).click(),
  ]);
}
test("attendance override, lost-response retry, checkout, history and readable QR persist", async ({
  page,
}) => {
  test.setTimeout(90000);
  await session(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const member = await register(page, "Attendance browser member");
  await page.goto(`/attendance?organizationId=${f.orgA}&branchId=${f.a1}`);
  await expect(page.getByText("No visits in this view.")).toBeVisible();
  await find(page, member.memberCode);
  await page
    .getByRole("button", { name: "Review access override", exact: true })
    .click();
  await page
    .getByLabel("Reason for access override")
    .fill("Approved introductory gym visit");
  // The first write commits but its response is lost. UI must retain the same key.
  let writes = 0;
  await page.route("**/api/attendance", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (writes === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Approve and check in", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry attendance request", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry attendance request", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Member checked in.");
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.attendance_visits where member_id=$1",
        [member.id],
      )
    ).rows[0].n,
  ).toBe(1);
  await mkdir(".local/attendance-evidence", { recursive: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/attendance-evidence/attendance-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", {
      name: "Check out visit for Attendance browser member",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText("Visit checked out.");
  const visit = (
    await admin.query(
      "select checked_in_at,checked_out_at,override_reason from gym.attendance_visits where member_id=$1",
      [member.id],
    )
  ).rows[0];
  expect(visit.checked_out_at.getTime()).toBeGreaterThanOrEqual(
    visit.checked_in_at.getTime(),
  );
  expect(visit.override_reason).toBe("Approved introductory gym visit");
  await page.getByLabel("Records", { exact: true }).selectOption("history");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Attendance history", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await page.goto(`/members/${member.id}?organizationId=${f.orgA}`);
  await page.getByRole("tab", { name: "Visits", exact: true }).click();
  await expect(
    page.getByText("Approved introductory gym visit", { exact: false }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download access QR", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${member.memberCode}-access.svg`);
  const svg = await readFile((await download.path())!, "utf8");
  const pixels = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = "data:image/svg+xml;base64," + btoa(source);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 320;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0, 320, 320);
    return Array.from(context.getImageData(0, 0, 320, 320).data);
  }, svg);
  const decoded = jsQR(new Uint8ClampedArray(pixels), 320, 320);
  expect(decoded?.data).toMatch(/^MOJYM:[0-9a-f-]{36}$/);
  await page.goto(`/attendance?organizationId=${f.orgA}&branchId=${f.a1}`);
  await find(page, decoded!.data);
  await expect(page.locator(".attendance-candidate h3")).toHaveText(
    "Attendance browser member",
  );
  expect(errors).toEqual([]);
});

test("reception sees denial without override and cannot admit an ineligible member", async ({
  page,
}) => {
  await session(page);
  const member = await register(page, "Blocked attendance member");
  await session(page, "Reception A");
  await page.goto(`/attendance?organizationId=${f.orgA}&branchId=${f.a1}`);
  await find(page, member.memberCode);
  await expect(
    page.getByText("Check-in unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review access override", exact: true }),
  ).toHaveCount(0);
  const response = await page.request.post("/api/attendance", {
    headers: { origin: baseURL },
    data: {
      organizationId: f.orgA,
      branchId: f.a1,
      memberId: member.id,
      operation: "check_in",
      overrideReason: "Forged desk override",
      requestKey: randomUUID(),
    },
  });
  expect(response.status()).toBe(403);
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.attendance_visits where member_id=$1",
        [member.id],
      )
    ).rows[0].n,
  ).toBe(0);
});

test("persisted dashboard reconciles attendance, refreshes and navigates within branch scope", async ({
  page,
}) => {
  test.setTimeout(60000);
  await session(page);
  await page.goto(`/dashboard?organizationId=${f.orgA}&branchId=${f.a1}`);
  await expect(
    page.getByRole("heading", { name: "Gym overview", exact: true }),
  ).toBeVisible();
  const source = (
    await (
      await page.request.get(
        `/api/attendance?organizationId=${f.orgA}&branchId=${f.a1}`,
      )
    ).json()
  ).data;
  await expect(page.getByTestId("today-visits")).toHaveText(
    String(source.summary.checkIns),
  );
  await expect(
    page.getByLabel("Daily check-ins for the last seven days").locator("li"),
  ).toHaveCount(7);
  await expect(
    page.getByText("No collections in this period.", { exact: true }),
  ).toBeVisible();
  await mkdir(".local/dashboard-evidence", { recursive: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/dashboard-evidence/dashboard-${width}.png`,
      fullPage: true,
    });
  }
  const marker = "dashboard-client-transition";
  await page.evaluate((value) => {
    (window as Window & { navigationMarker?: string }).navigationMarker = value;
  }, marker);
  await page
    .getByRole("link", { name: "Review overdue invoices", exact: true })
    .click();
  await expect(page).toHaveURL(/status=overdue/);
  await expect(
    page.getByRole("heading", { name: "Invoices & balances", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { navigationMarker?: string }).navigationMarker,
    ),
  ).toBe(marker);
  await page
    .locator(".app-sidebar")
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Gym overview", exact: true }),
  ).toBeVisible();
  const fresh = await register(page, "Dashboard refreshed registration");
  await page
    .getByRole("button", { name: "Refresh overview", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: new RegExp("Dashboard refreshed registration"),
    }),
  ).toBeVisible();
  expect(
    (
      await (
        await page.request.get(`/api/dashboard?organizationId=${f.orgA}`)
      ).json()
    ).data.operational.recentMembers.map((m: { id: string }) => m.id),
  ).toContain(fresh.id);
  await page.getByLabel("Branch scope", { exact: true }).selectOption(f.a2);
  await page.getByRole("button", { name: "Apply branch", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`branchId=${f.a2}`));
  await expect(page.getByTestId("today-visits")).toHaveText("0");
  await expect(
    page.getByText("No members registered in this scope.", { exact: true }),
  ).toBeVisible();
  await session(page, "Reception A");
  await page.goto(`/dashboard?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Collected today", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Outstanding balances", exact: true }),
  ).toHaveCount(0);
  const forged = await page.request.get(
    `/api/dashboard?organizationId=${f.orgA}&branchId=${f.a2}`,
  );
  expect(forged.status()).toBe(404);
});
