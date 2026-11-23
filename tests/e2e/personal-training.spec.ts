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

test("trainer assignments, PT review, replay, editing and cancellation persist responsively", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /hydration|hydrated/i.test(m.text()))
      errors.push(m.text());
  });
  await session(page);
  const org = { organizationId: f.orgA },
    today = todayInZone("Asia/Karachi"),
    date = endOn(today, 1, "days"),
    weekday = new Date(date + "T12:00:00Z").getUTCDay(),
    trainerId = randomUUID(),
    roomId = randomUUID();
  async function post(path: string, data: unknown) {
    const r = await page.request.post(path, {
      headers: { origin: base },
      data,
    });
    expect(r.status()).toBe(200);
    return (await r.json()).data;
  }
  await post("/api/trainers", {
    ...org,
    id: trainerId,
    requestKey: randomUUID(),
    name: "Ayesha PT coach",
    branchIds: [f.a1],
    reason: "PT browser profile",
  });
  await post("/api/classes", {
    ...org,
    operation: "availability",
    id: randomUUID(),
    requestKey: randomUUID(),
    trainerId,
    branchId: f.a1,
    weekday,
    startMinute: 360,
    endMinute: 1320,
    active: true,
    reason: "PT browser availability",
  });
  await post("/api/classes", {
    ...org,
    operation: "room",
    id: roomId,
    requestKey: randomUUID(),
    branchId: f.a1,
    name: "Coaching studio",
    capacity: 5,
    active: true,
    reason: "PT browser room",
  });
  const p = await post("/api/plans", {
    ...org,
    branchId: f.a1,
    code: "PT-BROWSER",
    values: {
      name: "PT membership",
      amountMinor: 0,
      currency: "PKR",
      durationCount: 1,
      durationUnit: "months",
      accessMode: "home_branch",
      gymFloor: true,
      classes: true,
      personalTraining: true,
    },
    requestKey: randomUUID(),
    reason: "PT membership fixture",
  });
  const member = (
    await post("/api/members", {
      ...org,
      name: "Sara PT member",
      phone: "",
      email: randomUUID() + "@example.invalid",
      homeBranchId: f.a1,
      joinedOn: today,
      registrationKey: randomUUID(),
    })
  ).member;
  await post("/api/members/" + member.id + "/memberships", {
    ...org,
    mode: "enroll",
    memberVersion: member.version,
    planVersionId: p.versionId,
    startOn: today,
    requestKey: randomUUID(),
    reason: "Eligible PT membership",
  });
  await page.goto("/training?" + new URLSearchParams({ ...org, trainerId }));
  await page
    .getByRole("button", { name: "Assign member", exact: true })
    .click();
  let drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Member to assign", { exact: true })
    .selectOption(member.id);
  await drawer
    .getByLabel("Reason", { exact: true })
    .fill("Initial effective coaching assignment");
  await drawer
    .getByRole("button", { name: "Review training change", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Back to edit", exact: true })
    .click();
  await expect(drawer.getByLabel("Reason", { exact: true })).toHaveValue(
    "Initial effective coaching assignment",
  );
  await drawer
    .getByRole("button", { name: "Review training change", exact: true })
    .click();
  let lost = true;
  await page.route("**/api/training", async (route) => {
    if (route.request().method() === "POST" && lost) {
      lost = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await drawer
    .getByRole("button", { name: "Confirm training change", exact: true })
    .click();
  await expect(drawer.getByRole("alert")).toContainText("same reviewed change");
  await drawer
    .getByRole("button", { name: "Confirm training change", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Training change saved", exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await page.unroute("**/api/training");
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.trainer_assignments where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(1);
  await page
    .getByRole("button", { name: "Book PT for Sara PT member", exact: true })
    .click();
  drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Session title", { exact: true })
    .fill("Strength coaching");
  await drawer.getByLabel("Room", { exact: true }).selectOption(roomId);
  await drawer
    .getByLabel("Reason", { exact: true })
    .fill("Book the first personal coaching session");
  await drawer
    .getByRole("button", { name: "Review training change", exact: true })
    .click();
  await expect(drawer).toContainText(date + "T12:00:00+05:00");
  await drawer
    .getByRole("button", { name: "Confirm training change", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "Training change saved", exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("table", {
      name: "Personal training sessions",
      exact: true,
    }),
  ).toContainText("Strength coaching");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      caret: "initial",
      path: `doc/evidence/personal-training-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel("Member or session", { exact: true })
    .fill("Strength coaching");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("table", {
      name: "Trainer member assignments",
      exact: true,
    }),
  ).not.toContainText("Sara PT member");
  await page
    .getByRole("button", { name: "Edit Strength coaching", exact: true })
    .click();
  drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Session title", { exact: true })
    .fill("Strength coaching review");
  await drawer
    .getByLabel("Reason", { exact: true })
    .fill("Update session title with retained member assignment");
  await drawer
    .getByRole("button", { name: "Review training change", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Confirm training change", exact: true })
    .click();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Cancel Strength coaching review",
      exact: true,
    })
    .click();
  drawer = page.getByRole("dialog");
  await drawer
    .getByLabel("Reason", { exact: true })
    .fill("Cancel and retain coaching session history");
  await drawer
    .getByRole("button", { name: "Review training change", exact: true })
    .click();
  await drawer
    .getByRole("button", { name: "Confirm training change", exact: true })
    .click();
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("table", {
      name: "Personal training sessions",
      exact: true,
    }),
  ).toContainText("Cancelled");
  await session(page, "Reception A");
  await page.goto("/training?" + new URLSearchParams({ ...org, trainerId }));
  await expect(
    page.getByRole("button", { name: "Assign member", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Book PT for Sara PT member",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await page.request.post("/api/training", {
        headers: { origin: base },
        data: {
          ...org,
          operation: "assignment",
          id: randomUUID(),
          requestKey: randomUUID(),
          trainerId,
          branchId: f.a1,
          memberId: member.id,
          startOn: today,
          endOn: null,
          active: true,
          reason: "Denied assignment write",
        },
      })
    ).status(),
  ).toBe(403);
  expect(errors).toEqual([]);
});
