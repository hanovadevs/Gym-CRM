import { test, expect as baseExpect } from "@playwright/test";
import type { Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { securityFixture } from "../helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
import { todayInZone } from "../../src/modules/plans/format";
const expect = baseExpect.configure({ timeout: 15000 }),
  admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
let f: Awaited<ReturnType<typeof securityFixture>>;
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
  await page
    .context()
    .addCookies(
      cookies[name].map((c) => ({
        ...c,
        url: "http://127.0.0.1:3100",
        httpOnly: true,
        sameSite: "Lax" as const,
      })),
    );
}
async function member(page: Page, name: string, branch?: string) {
  await session(page);
  const r = await page.request.post("/api/members", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      name,
      email: randomUUID() + "@example.invalid",
      phone: "",
      homeBranchId: branch ?? f.a1,
      joinedOn: today,
      registrationKey: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.member.id as string;
}
const values = (description: string) => ({
  description,
  currency: "PKR",
  dueOn: today,
  lines: [
    {
      description: "Personal training",
      quantity: 2,
      unitMinor: 450025,
      discountMinor: 50,
    },
  ],
});
async function draft(
  page: Page,
  id: string,
  description: string,
  issue = false,
) {
  const r = await page.request.post("/api/invoices", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      memberId: id,
      values: values(description),
      requestKey: randomUUID(),
      reason: "Reviewed billing fixture",
    },
  });
  expect(r.status()).toBe(200);
  const invoiceId = (await r.json()).data.invoiceId as string;
  if (issue) {
    const s = await page.request.patch("/api/invoices/" + invoiceId, {
      headers: origin,
      data: {
        organizationId: f.orgA,
        operation: "issue",
        version: 1,
        requestKey: randomUUID(),
        reason: "Agreed charge fixture",
      },
    });
    expect(s.status()).toBe(200);
  }
  return invoiceId;
}
async function open(page: Page, invoiceId?: string) {
  await page.goto(
    `/payments?organizationId=${f.orgA}${invoiceId ? "&invoiceId=" + invoiceId : ""}`,
  );
  await expect(
    page.getByRole("heading", { name: "Invoices & balances", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create invoice", exact: true }),
  ).toBeEnabled();
}
async function form(page: Page, name: string, description: string) {
  await page
    .getByRole("button", { name: "Create invoice", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Find member", { exact: true }).fill(name);
  await d.getByRole("button", { name: "Search members", exact: true }).click();
  await expect(
    d.getByLabel("Member", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await d.getByLabel("Invoice description", { exact: true }).fill(description);
  await d
    .getByLabel("Line 1 description", { exact: true })
    .fill("Coaching sessions");
  await d.getByLabel("Line 1 quantity", { exact: true }).fill("2");
  await d.getByLabel("Line 1 unit price", { exact: true }).fill("4500.25");
  await d.getByLabel("Line 1 discount", { exact: true }).fill("0.50");
  await d
    .getByLabel("Reason for invoice", { exact: true })
    .fill("Member approved coaching fees");
  await d.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(d.getByRole("region", { name: "Draft review" })).toBeVisible();
  return d;
}
test("draft review, immutable issue, persisted balances, PDF download and responsive layouts", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await member(page, "Sara Ahmed");
  await draft(page, id, "Locker rental - November", true);
  await draft(page, id, "Additional coaching draft");
  await open(page);
  let d = await form(page, "Sara Ahmed", "November coaching");
  await expect(d).toContainText("9,000.00");
  expect(
    (
      await admin.query("select id from gym.invoices where description=$1", [
        "November coaching",
      ])
    ).rowCount,
  ).toBe(0);
  await d.getByRole("button", { name: "Save draft", exact: true }).click();
  d = page.getByRole("dialog");
  await expect(
    d.getByRole("heading", { name: "Draft invoice", exact: true }),
  ).toBeVisible();
  await expect(d.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  await d.getByRole("button", { name: "Edit draft", exact: true }).click();
  await d
    .getByLabel("Invoice description", { exact: true })
    .fill("November coaching revised");
  await d
    .getByLabel("Reason for invoice", { exact: true })
    .fill("Corrected charge description");
  await d.getByRole("button", { name: "Review draft", exact: true }).click();
  await d.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(d).toContainText("Draft revision 2");
  await d.getByRole("button", { name: "Issue invoice", exact: true }).click();
  await d
    .getByLabel("Reason for issue", { exact: true })
    .fill("Final charge approved");
  await d
    .getByRole("checkbox", { name: "Confirm issued charge", exact: true })
    .check();
  await d.getByRole("button", { name: "Confirm issue", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeVisible();
  await expect(d).toContainText("Outstanding");
  await expect(
    d.getByRole("button", { name: "Edit draft", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText(
    "November coaching revised",
  );
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/^GYM-INV-\d+\.pdf$/);
  await download.saveAs("test-results/invoice-download.pdf");
  expect(
    (await readFile("test-results/invoice-download.pdf"))
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .getByRole("dialog")
    .screenshot({ path: "test-results/invoice-download-390.png" });
  await page.getByRole("dialog").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page
    .getByRole("dialog")
    .screenshot({ path: "test-results/invoice-detail-390.png" });
  await page.getByRole("button", { name: "Close drawer", exact: true }).click();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/invoices-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Outstanding", exact: true }).click();
  await expect(page.locator(".invoice-table-panel tbody tr")).toHaveCount(2);
  await page.getByRole("tab", { name: "Drafts", exact: true }).click();
  await expect(page.locator(".invoice-table-panel tbody tr")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("lost draft response safely replays a single saved invoice with retained inputs", async ({
  page,
}) => {
  const id = await member(page, "Retry Billing");
  await open(page);
  let d = await form(page, "Retry Billing", "Lost invoice response");
  let dropped = false;
  await page.route("**/api/invoices", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await d.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(d.getByRole("alert")).toBeVisible();
  await expect(d.getByRole("region", { name: "Draft review" })).toContainText(
    "Lost invoice response",
  );
  await d.getByRole("button", { name: "Save draft", exact: true }).click();
  d = page.getByRole("dialog");
  await expect(d).toContainText("Draft invoice");
  expect(
    (await admin.query("select id from gym.invoices where member_id=$1", [id]))
      .rowCount,
  ).toBe(1);
});
test("stale issue cannot overwrite a concurrently issued charge", async ({
  page,
}) => {
  const id = await member(page, "Concurrent Billing"),
    invoiceId = await draft(page, id, "Concurrent invoice");
  await open(page, invoiceId);
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Issue invoice", exact: true }).click();
  await d
    .getByLabel("Reason for issue", { exact: true })
    .fill("Retained local approval");
  await d
    .getByRole("checkbox", { name: "Confirm issued charge", exact: true })
    .check();
  const r = await page.request.patch("/api/invoices/" + invoiceId, {
    headers: origin,
    data: {
      organizationId: f.orgA,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Other operator approved",
    },
  });
  expect(r.status()).toBe(200);
  await d.getByRole("button", { name: "Confirm issue", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("changed or was issued");
  await expect(d.getByLabel("Reason for issue", { exact: true })).toHaveValue(
    "Retained local approval",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeVisible();
  expect(
    (
      await admin.query("select version from gym.invoices where id=$1", [
        invoiceId,
      ])
    ).rows[0].version,
  ).toBe(2);
});
test("a committed invoice with failed refresh hides stale results and requires reload", async ({
  page,
}) => {
  const id = await member(page, "Refresh Billing");
  await open(page);
  const d = await form(page, "Refresh Billing", "Saved before invoice refresh");
  await page.route("**/api/invoices?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "Invoice refresh unavailable" },
      }),
    }),
  );
  await d.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator(".members-main").getByRole("alert")).toContainText(
    "Changes were saved",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create invoice", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".invoice-table-panel")).toHaveCount(0);
  expect(
    (await admin.query("select id from gym.invoices where member_id=$1", [id]))
      .rowCount,
  ).toBe(1);
  await page.unroute("**/api/invoices?**");
  await page
    .getByRole("button", { name: "Reload invoices", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create invoice", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".invoice-table-panel")).toContainText(
    "Saved before invoice refresh",
  );
});
test("PDF rendering failure can be retried without issuing or charging again", async ({
  page,
}) => {
  const id = await member(page, "PDF Retry"),
    invoiceId = await draft(page, id, "Download retry invoice", true);
  await open(page, invoiceId);
  await page.route("**/api/invoices/*/pdf?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: { message: "PDF temporarily unavailable" },
      }),
    }),
  );
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "PDF temporarily unavailable",
  );
  await page.unroute("**/api/invoices/*/pdf?**");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await event;
  expect(
    (
      await admin.query("select version from gym.invoices where id=$1", [
        invoiceId,
      ])
    ).rows[0].version,
  ).toBe(2);
  expect(
    (await admin.query("select id from gym.invoices where member_id=$1", [id]))
      .rowCount,
  ).toBe(1);
});
test("accountant billing stays in assigned branches and does not expose member profiles", async ({
  page,
}) => {
  const id = await member(page, "Accounting Member"),
    north = await member(page, "North Private Billing", f.a2),
    invoiceId = await draft(page, id, "Accounting scoped invoice", true),
    northId = await draft(page, north, "North restricted invoice", true);
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  try {
    await session(page, "Reception A");
    await open(page, invoiceId);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("link", { name: "Open member profile", exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .locator(".app-sidebar")
        .getByRole("link", { name: "Members", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `/api/invoices/${northId}/pdf?organizationId=${f.orgA}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await page.request.get(`/api/members/${id}?organizationId=${f.orgA}`)
      ).status(),
    ).toBe(403);
    const denied = await page.request.post("/api/invoices", {
      headers: { origin: "https://untrusted.invalid" },
      data: {
        organizationId: f.orgA,
        memberId: id,
        values: values("Untrusted"),
        requestKey: randomUUID(),
        reason: "Blocked wrong origin",
      },
    });
    expect(denied.status()).toBe(403);
    await admin.query(
      "update gym.staff_memberships set role='trainer' where id=$1",
      [f.memberships.reception],
    );
    expect(
      (
        await page.request.get(
          `/api/invoices/${invoiceId}/pdf?organizationId=${f.orgA}`,
        )
      ).status(),
    ).toBe(403);
    await page.goto("/workspace?organizationId=" + f.orgA);
    await expect(
      page
        .locator(".app-sidebar")
        .getByRole("link", { name: "Payments", exact: true }),
    ).toHaveCount(0);
  } finally {
    await admin.query(
      "update gym.staff_memberships set role='receptionist' where id=$1",
      [f.memberships.reception],
    );
  }
});
test("scoped paging, literal search, tabs and latest submitted filters remain usable on mobile", async ({
  page,
}) => {
  test.setTimeout(60000);
  const id = await member(page, "Paged Billing");
  for (let n = 0; n < 26; n++)
    await draft(page, id, "Paged browser invoice " + n);
  await open(page);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page
    .getByLabel("Search invoices", { exact: true })
    .fill("Paged browser invoice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".invoice-table-panel tbody tr")).toHaveCount(25);
  await page
    .getByRole("button", { name: "Next invoices", exact: true })
    .click();
  await expect(page.locator(".invoice-table-panel tbody tr")).toHaveCount(1);
  await page.getByLabel("Search invoices", { exact: true }).fill("%_");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching invoices", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search invoices", { exact: true })
    .fill("Paged browser invoice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".invoice-table-panel tbody tr")).toHaveCount(25);
  await page.getByRole("tab", { name: "Overdue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching invoices", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
