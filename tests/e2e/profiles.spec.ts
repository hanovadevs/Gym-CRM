import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
const cookies: Record<string, { name: string; value: string }[]> = {},
  extraEmails: string[] = [],
  captures: string[] = [];
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
  for (const name of ["Owner A", "Reception A"]) {
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
  for (const p of captures) await unlink(p).catch(() => {});
  if (f) await f.cleanup();
  await admin.query('delete from app_auth."user" where email=any($1::text[])', [
    extraEmails,
  ]);
  await admin.end();
  await pool.end();
});
const origin = { origin: "http://127.0.0.1:3100" };
async function session(
  page: import("@playwright/test").Page,
  name = "Owner A",
) {
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
async function seed(
  page: import("@playwright/test").Page,
  name = "Sara Ahmed",
  branch = f.a1,
) {
  await session(page);
  const r = await page.request.post("/api/members", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      name,
      phone: name === "Sara Ahmed" ? "+92 300 1234567" : "",
      email: name.toLowerCase().replace(/\s+/g, ".") + "@example.invalid",
      homeBranchId: branch,
      joinedOn: "2026-11-01",
      registrationKey: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.member;
}
async function open(page: import("@playwright/test").Page, id: string) {
  await page.goto(`/members/${id}?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Registration", exact: true }),
  ).toBeVisible();
}
async function current(page: import("@playwright/test").Page, id: string) {
  return (
    await (
      await page.request.get(`/api/members/${id}?organizationId=${f.orgA}`)
    ).json()
  ).data;
}
async function note(
  page: import("@playwright/test").Page,
  id: string,
  body: string,
  visibility = "operational",
) {
  const r = await page.request.post(`/api/members/${id}/notes`, {
    headers: origin,
    data: {
      organizationId: f.orgA,
      requestKey: randomUUID(),
      body,
      visibility,
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.id;
}
test("profile, emergency contact and notes persist with responsive reference layouts", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error"&&/hydrated|hydration/i.test(m.text()))errors.push(m.text())});
  const m = await seed(page);
  await page.goto(`/members?organizationId=${f.orgA}`);
  await page
    .getByRole("link", { name: "View Sara Ahmed", exact: true })
    .click();
  // Next Link completes its click before the streamed client transition commits.
  await page.waitForURL((url) => url.pathname === `/members/${m.id}`);
  await expect(
    page.getByRole("heading", { name: "Sara Ahmed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add emergency contact" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Contact name").fill("Amina Ahmed");
  await d.getByLabel("Contact phone").fill("03019876543");
  await d.getByLabel("Relationship", { exact: true }).fill("Sibling");
  await d.getByLabel("Reason for change").fill("Record emergency contact");
  const [contactResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/members/${m.id}/contact` &&
        response.request().method() === "PATCH",
    ),
    d.getByRole("button", { name: "Save changes", exact: true }).click(),
  ]);
  expect(contactResponse.status()).toBe(200);
  await expect(d).toHaveCount(0);
  await page
    .getByLabel("New operational note")
    .fill("Prefers evening appointments. Contact before rescheduling.");
  const [noteResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/members/${m.id}/notes` &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "Add note", exact: true }).click(),
  ]);
  expect(noteResponse.status()).toBe(200);
  await expect(page.locator(".note-body")).toContainText("Prefers evening");
  await page.reload();
  await expect(page.getByText("Amina Ahmed", { exact: true })).toBeVisible();
  await expect(page.locator(".note-body")).toContainText("Prefers evening");
  await expect(
    page.getByRole("button", { name: "Edit member", exact: true }),
  ).toBeEnabled();
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(
      page.getByRole("heading", { name: "Sara Ahmed", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      caret: "initial",
      path: `test-results/profile-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Overview", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "History", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".audit-list")).toContainText(
    "Emergency contact updated",
  );
  await expect(page.locator(".audit-list")).toContainText("Member registered");
  const p = await current(page, m.id);
  expect(p.contact.name).toBe("Amina Ahmed");
  expect(errors).toEqual([]);
});
test("reception cannot see management notes or withdraw another author's note", async ({
  page,
}) => {
  const m = await seed(page, "Scoped Notes");
  await note(page, m.id, "Management-only private operations", "management");
  await note(page, m.id, "Owner operational instructions");
  await session(page, "Reception A");
  await open(page, m.id);
  await expect(
    page.getByRole("button", { name: "Archive member" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Note visibility", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".profile-note-list")).not.toContainText(
    "Management-only",
  );
  await expect(
    page.getByRole("button", { name: "Withdraw note by Owner A" }),
  ).toHaveCount(0);
  await page
    .getByLabel("New operational note")
    .fill("Reception follow-up completed");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const item = page
    .locator(".profile-note-list li")
    .filter({ hasText: "Reception follow-up completed" });
  await expect(item).toBeVisible();
  await item
    .getByRole("button", { name: "Withdraw note by Reception A" })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Reason for change").fill("Correction is needed");
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator(".profile-note-list")).toContainText(
    "Withdrawn: Correction is needed",
  );
  await expect(page.locator(".note-body")).not.toContainText(
    "Reception follow-up completed",
  );
  const denied = await page.request.post(`/api/members/${m.id}/notes`, {
    headers: origin,
    data: {
      organizationId: f.orgA,
      body: "Tampered visibility",
      visibility: "management",
      requestKey: randomUUID(),
    },
  });
  expect(denied.status()).toBe(403);
  await session(page);
  await open(page, m.id);
  await expect(page.locator(".profile-note-list")).toContainText(
    "Management-only private operations",
  );
});
test("archive preserves notes/contact, blocks changes and can be restored through archived directory", async ({
  page,
}) => {
  const m = await seed(page, "Archive Person");
  await note(page, m.id, "History to preserve");
  await open(page, m.id);
  await page
    .getByRole("button", { name: "Archive member", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Reason for change").fill("Member requested archival");
  await d.getByRole("checkbox", { name: "Confirm archive" }).check();
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(page.locator(".profile-state")).toHaveText("Archived");
  await expect(
    page.getByRole("button", { name: "Edit member", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add note", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".profile-note-list")).toContainText(
    "History to preserve",
  );
  await expect(
    page
      .locator(".profile-overview")
      .getByText("Blocked: archived member", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    caret: "initial",
    path: "test-results/profile-archived-390.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Members / Profile" }).click();
  await expect(
    page.getByRole("link", { name: "View Archive Person", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Member records", { exact: true })
    .selectOption("archived");
  await page
    .getByRole("link", { name: "View Archive Person", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore member", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Reason for change")
    .fill("Approved return to directory");
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Confirm restore" })
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.locator(".profile-state")).toHaveText("Registered");
  await expect(
    page.getByRole("button", { name: "Edit member", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".profile-note-list")).toContainText(
    "History to preserve",
  );
  await expect(
    page
      .locator(".profile-overview")
      .getByText("Not enrolled", { exact: true }),
  ).toBeVisible();
});
test("stale contact edits keep input and a committed note with failed refresh needs reload", async ({
  page,
}) => {
  const m = await seed(page, "Failure Person");
  await open(page, m.id);
  await page.getByRole("button", { name: "Add emergency contact" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Contact name").fill("Local Unsaved Contact");
  await d.getByLabel("Contact phone").fill("03001239876");
  await d.getByLabel("Reason for change").fill("Local correction");
  expect(
    (
      await page.request.patch(`/api/members/${m.id}/contact`, {
        headers: origin,
        data: {
          organizationId: f.orgA,
          version: 1,
          contact: {
            name: "External Saved Contact",
            phone: "03001239876",
            relationship: "Family",
          },
          reason: "Other operator correction",
        },
      })
    ).status(),
  ).toBe(200);
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("This profile changed");
  await expect(d.getByLabel("Contact name")).toHaveValue(
    "Local Unsaved Contact",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Reload profile" }).click();
  await expect(
    page.getByText("External Saved Contact", { exact: true }),
  ).toBeVisible();
  await page.route(`**/api/members/${m.id}?**`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Refresh unavailable" },
      }),
    }),
  );
  await page
    .getByLabel("New operational note")
    .fill("Saved before refresh failed");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(page.locator(".members-main").getByRole("alert")).toContainText(
    "Changes were saved",
  );
  await expect(page.locator(".profile-state")).toHaveText("Reload required");
  await expect(
    page.getByRole("button", { name: "Edit member", exact: true }),
  ).toBeDisabled();
  await page.unroute(`**/api/members/${m.id}?**`);
  await page.getByRole("button", { name: "Reload profile" }).click();
  await expect(page.locator(".note-body")).toContainText(
    "Saved before refresh failed",
  );
});
test("profile notes paginate and inaccessible profiles return no contact data", async ({
  page,
}) => {
  const m = await seed(page, "Paged Notes");
  for (let i = 0; i < 23; i++) await note(page, m.id, "Note page entry " + i);
  await open(page, m.id);
  await expect(page.locator(".profile-note-list > li")).toHaveCount(20);
  await page.getByRole("button", { name: "Next notes", exact: true }).click();
  await expect(page.locator(".profile-note-list > li")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Next notes", exact: true }),
  ).toBeDisabled();
  const north = await seed(page, "Private North Profile", f.a2);
  await session(page, "Reception A");
  expect(
    (
      await page.request.get(
        `/api/members/${north.id}?organizationId=${f.orgA}`,
      )
    ).status(),
  ).toBe(404);
  await page.goto(`/members/${north.id}?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Profile unavailable" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Private North Profile");
});
test("staff invitation sends fixed-sender setup link and recipient chooses a password", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await session(page);
  await page.goto(`/settings?organizationId=${f.orgA}`);
  await page.getByRole("tab", { name: "Team & roles", exact: true }).click();
  await page.getByRole("button", { name: "Add staff", exact: true }).click();
  const d = page.getByRole("dialog"),
    email = randomUUID() + "@example.invalid";
  extraEmails.push(email);
  await d.getByLabel("Full name").fill("Invited Reception");
  await d.getByLabel("Staff email").fill(email);
  await d.getByLabel("Account setup", { exact: true }).selectOption("email");
  await expect(d.getByLabel("Initial password")).toHaveCount(0);
  await expect(d).toContainText("contact@hanovadevs.com");
  await d.getByRole("checkbox", { name: "Central", exact: true }).check();
  await d.getByLabel("Reason for change").fill("Invite new reception staff");
  await d.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(d).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "Invited Reception" }),
  ).toContainText("Invitation: sent");
  let mail: { url: string; from: string; kind: string } | undefined;
  for (const file of await readdir(".local/mail")) {
    const path = ".local/mail/" + file,
      c = JSON.parse(await readFile(path, "utf8"));
    if (c.email === email) {
      mail = c;
      captures.push(path);
      break;
    }
  }
  expect(mail?.from).toBe("contact@hanovadevs.com");
  expect(mail?.kind).toBe("invitation");
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto(mail!.url);
    await recipient
      .getByLabel("New password", { exact: true })
      .fill("Invited user chosen password 2026");
    await recipient
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(recipient.getByRole("status")).toContainText(
      "Password updated",
    );
    await recipient
      .getByRole("link", { name: "sign in", exact: false })
      .click();
    await recipient.getByLabel("Login email", { exact: true }).fill(email);
    await recipient
      .getByLabel("Password", { exact: true })
      .fill("Invited user chosen password 2026");
    await recipient
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      recipient.getByRole("heading", {
        name: "Gym overview",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
