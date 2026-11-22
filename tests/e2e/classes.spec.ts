import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { todayInZone, endOn } from "../../src/modules/plans/format";
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

test("class resources, timetable, replay, bookings and cancellations persist responsively", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await session(page);
  const org = { organizationId: f.orgA },
    reason = "Class browser workflow",
    today = todayInZone("Asia/Karachi"),
    date = endOn(today, 2, "days"),
    weekday = new Date(date + "T12:00:00Z").getUTCDay();
  async function post(url: string, body: unknown) {
    const r = await page.request.post(url, {
      headers: { origin: base },
      data: body,
    });
    expect(r.status(), await r.text()).toBe(200);
    return (await r.json()).data;
  }
  const coach = await post("/api/trainers", {
    ...org,
    id: randomUUID(),
    requestKey: randomUUID(),
    name: "Ayesha Class Coach",
    branchIds: [f.a1],
    reason,
  });
  const plan = await post("/api/plans", {
    ...org,
    branchId: f.a1,
    code: "CLASS-UI",
    values: {
      name: "Class access",
      amountMinor: 0,
      currency: "PKR",
      durationCount: 30,
      durationUnit: "days",
      accessMode: "home_branch",
      gymFloor: true,
      classes: true,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason,
  });
  const member = (
    await post("/api/members", {
      ...org,
      name: "Class Member One",
      email: randomUUID() + "@example.invalid",
      phone: "",
      homeBranchId: f.a1,
      joinedOn: today,
      registrationKey: randomUUID(),
    })
  ).member;
  await post("/api/members/" + member.id + "/memberships", {
    ...org,
    mode: "enroll",
    memberVersion: member.version,
    planVersionId: plan.versionId,
    startOn: today,
    requestKey: randomUUID(),
    reason,
  });
  await page.goto(
    "/classes?" + new URLSearchParams({ ...org, from: date, mode: "day" }),
  );
  await expect(
    page.getByRole("heading", { name: "Classes & schedule", exact: true }),
  ).toBeVisible();
  const d = page.getByRole("dialog");
  await page
    .getByRole("button", { name: "Manage resources", exact: true })
    .click();
  await d.getByRole("button", { name: "Add room", exact: true }).click();
  await d.getByLabel("Room name", { exact: true }).fill("Studio North");
  await d.getByLabel("Branch", { exact: true }).selectOption(f.a1);
  await d.getByLabel("Room capacity", { exact: true }).fill("2");
  await d.getByLabel("Reason", { exact: true }).fill(reason);
  await d.getByRole("button", { name: "Review schedule", exact: true }).click();
  await d
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Schedule saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage resources", exact: true })
    .click();
  await d
    .getByRole("button", { name: "Add availability", exact: true })
    .click();
  await d.getByLabel("Coach", { exact: true }).selectOption(coach.trainerId);
  await d.getByLabel("Branch", { exact: true }).selectOption(f.a1);
  await d.getByLabel("Weekday", { exact: true }).selectOption(String(weekday));
  await d.getByLabel("Reason", { exact: true }).fill(reason);
  await d.getByRole("button", { name: "Review schedule", exact: true }).click();
  await d
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Schedule saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Create class", exact: true }).click();
  await d
    .getByLabel("Class title", { exact: true })
    .fill("Strength foundations");
  await d.getByLabel("Branch", { exact: true }).selectOption(f.a1);
  await d.getByLabel("Coach", { exact: true }).selectOption(coach.trainerId);
  await d
    .getByLabel("Room", { exact: true })
    .selectOption({ label: "Studio North / Central / 2 seats" });
  await d.getByLabel("Starts at", { exact: true }).fill(date + "T17:00");
  await d.getByLabel("Ends at", { exact: true }).fill(date + "T18:00");
  await d.getByLabel("Class capacity", { exact: true }).fill("2");
  await d.getByLabel("Reason", { exact: true }).fill(reason);
  await d.getByRole("button", { name: "Review schedule", exact: true }).click();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.class_sessions where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  let dropped = false;
  await page.route("**/api/classes", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await d
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await expect(
    d.getByRole("button", { name: "Retry save", exact: true }),
  ).toBeEnabled();
  await d.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(
    d.getByRole("heading", { name: "Schedule saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page.unroute("**/api/classes");
  await expect(
    page.getByRole("heading", { name: "Strength foundations", exact: true }),
  ).toBeVisible();
  async function book() {
    await page
      .getByRole("button", { name: "Add booking", exact: true })
      .click();
    await d.getByLabel("Member search", { exact: true }).fill("Class Member");
    await d
      .getByRole("button", { name: "Search members", exact: true })
      .click();
    await d.getByRole("radio", { name: /Class Member One/ }).check();
    await d
      .getByLabel("Reason", { exact: true })
      .fill("Reserve eligible member seat");
    await d
      .getByRole("button", { name: "Review schedule", exact: true })
      .click();
    await d
      .getByRole("button", { name: "Confirm schedule", exact: true })
      .click();
    await expect(
      d.getByRole("heading", { name: "Schedule saved", exact: true }),
    ).toBeVisible();
    await d.getByRole("button", { name: "Done", exact: true }).click();
  }
  await book();
  await page
    .getByRole("button", {
      name: "Cancel booking for Class Member One",
      exact: true,
    })
    .click();
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Member cancelled reservation");
  await d.getByRole("button", { name: "Review schedule", exact: true }).click();
  await d
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Schedule saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await book();
  await page.getByRole("button", { name: "Edit session", exact: true }).click();
  await d
    .getByLabel("Class title", { exact: true })
    .fill("Strength essentials");
  await d.getByLabel("Class capacity", { exact: true }).fill("1");
  await d
    .getByLabel("Reason", { exact: true })
    .fill("Adjust class title and size");
  await d.getByRole("button", { name: "Review schedule", exact: true }).click();
  await d
    .getByRole("button", { name: "Confirm schedule", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Schedule saved", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add booking", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Strength essentials", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: `doc/evidence/classes-${width}.png`,
      fullPage: true,
    });
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Strength essentials", exact: true }),
  ).toBeVisible();
  const data = (
    await (
      await page.request.get(
        "/api/classes?" +
          new URLSearchParams({ ...org, from: date, mode: "day" }),
      )
    ).json()
  ).data;
  expect(data.total).toBe(1);
  expect(data.selected.capacity).toBe(1);
  expect(data.selected.booked).toBe(1);
  expect(data.rosterTotal).toBe(2);
  expect(
    data.roster.filter((b: { cancelled: boolean }) => b.cancelled).length,
  ).toBe(1);
  await session(page, "Reception A");
  await page.goto(
    "/classes?" + new URLSearchParams({ ...org, from: date, mode: "day" }),
  );
  await expect(
    page.getByRole("button", { name: "Create class", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage resources", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
