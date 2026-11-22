import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
import { securityFixture } from "./helpers/security-fixture";
import { configureAuth } from "../../src/server/auth/configure";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }),
  base = "http://127.0.0.1:3100";
let f: Awaited<ReturnType<typeof securityFixture>>, image: Buffer;
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
  image = await sharp({
    create: { width: 500, height: 280, channels: 3, background: "white" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="500" height="280"><text x="30" y="60" fill="#253C58" font-size="24">Equipment service receipt</text><text x="30" y="110" fill="#253C58" font-size="18">Amount: PKR 100.00</text></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
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
async function open(page: Page) {
  await page.goto(`/expenses?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
}
async function category(page: Page, name: string) {
  const r = await page.request.post("/api/expenses/categories", {
    headers: { origin: base },
    data: {
      organizationId: f.orgA,
      operation: "create",
      id: randomUUID(),
      name,
      reason: "Browser expense category",
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).data.categoryId;
}
async function form(
  page: Page,
  description: string,
  catName: string,
  receipt = true,
) {
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Expense category", { exact: true })
    .selectOption({ label: catName });
  await dialog.getByLabel("Description", { exact: true }).fill(description);
  await dialog.getByLabel("Paid to", { exact: true }).fill("Equipment vendor");
  await dialog.getByLabel("Amount (PKR)", { exact: true }).fill("100.00");
  if (receipt)
    await dialog
      .getByLabel("Receipt image (optional)", { exact: true })
      .setInputFiles({
        name: "service-receipt.png",
        mimeType: "image/png",
        buffer: image,
      });
  await dialog
    .getByRole("button", { name: "Review expense", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Review before posting", exact: true }),
  ).toBeVisible();
  return dialog;
}
test("expense review, private receipt, full reversal and linked replacement retain history", async ({
  page,
}) => {
  test.setTimeout(90000);
  await session(page);
  await open(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("tab", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Category name", { exact: true }).fill("Maintenance");
  await d
    .getByLabel("Reason for category change")
    .fill("Keep service expenses together");
  const [categoryResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/expenses/categories" &&
        r.request().method() === "POST",
    ),
    d.getByRole("button", { name: "Save category", exact: true }).click(),
  ]);
  expect(categoryResponse.status()).toBe(200);
  await expect(d).toHaveCount(0);
  await page.getByRole("tab", { name: "Cash ledger", exact: true }).click();
  d = await form(page, "Equipment service", "Maintenance");
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.expenses where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.private_files where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(0);
  const [postResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/expenses" &&
        r.request().method() === "POST",
    ),
    d.getByRole("button", { name: "Confirm expense", exact: true }).click(),
  ]);
  expect(postResponse.status()).toBe(200);
  await expect(d).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("posted.");
  const original = (
    await admin.query(
      "select id,number,file_id from gym.expenses where organization_id=$1",
      [f.orgA],
    )
  ).rows[0];
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download receipt", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("service-receipt.png");
  expect(
    (await sharp(await readFile((await download.path())!)).metadata()).width,
  ).toBe(500);
  await mkdir(".local/expense-evidence", { recursive: true });
  for (const width of [390, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll(".table-scroll").forEach((e) => {
        e.scrollLeft = 0;
      });
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/expense-evidence/expenses-${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: `Reverse ${original.number}`, exact: true })
    .click();
  d = page.getByRole("dialog");
  await d
    .getByLabel("Reason for reversal")
    .fill("Vendor receipt amount corrected");
  const [reversalResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith("/reverse") &&
        r.request().method() === "POST",
    ),
    d.getByRole("button", { name: "Confirm reversal", exact: true }).click(),
  ]);
  expect(reversalResponse.status()).toBe(200);
  await expect(d).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Expense reversed.");
  await page
    .getByRole("button", { name: `Replace ${original.number}`, exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Amount (PKR)", { exact: true }).fill("120.00");
  await d.getByRole("button", { name: "Review expense", exact: true }).click();
  const [replacementResponse] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/expenses" &&
        r.request().method() === "POST",
    ),
    d.getByRole("button", { name: "Confirm expense", exact: true }).click(),
  ]);
  expect(replacementResponse.status()).toBe(200);
  await expect(d).toHaveCount(0);
  const ledger = (
    await (
      await page.request.get(`/api/expenses?organizationId=${f.orgA}`)
    ).json()
  ).data;
  expect(ledger.total).toBe(3);
  expect(ledger.summary[0]).toEqual({
    currency: "PKR",
    postedMinor: "22000",
    reversedMinor: "10000",
    netMinor: "12000",
  });
  expect(
    ledger.rows.find(
      (r: { replacesExpenseId: string }) => r.replacesExpenseId === original.id,
    ),
  ).toBeTruthy();
  expect(
    (
      await page.request.get(
        `/api/files/${original.file_id}?organizationId=${f.orgA}`,
      )
    ).status(),
  ).toBe(200);
  expect(errors).toEqual([]);
});
test("lost expense response retries one posting and failed refresh requires reload", async ({
  page,
}) => {
  test.setTimeout(60000);
  await session(page);
  await category(page, "Utilities");
  await open(page);
  const d = await form(page, "Lost response utility expense", "Utilities");
  let writes = 0;
  await page.route("**/api/expenses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (writes === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await d.getByRole("button", { name: "Confirm expense", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Retry same expense", exact: true }),
  ).toBeVisible();
  await page.route("**/api/expenses?*", (route) => route.abort("failed"));
  await d
    .getByRole("button", { name: "Retry same expense", exact: true })
    .click();
  await expect(d).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reload expenses", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add expense", exact: true }),
  ).toBeDisabled();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.expenses where organization_id=$1 and description='Lost response utility expense'",
        [f.orgA],
      )
    ).rows[0].n,
  ).toBe(1);
  await page.unroute("**/api/expenses?*");
  await page
    .getByRole("button", { name: "Reload expenses", exact: true })
    .click();
  await expect(
    page.getByText("Lost response utility expense", { exact: true }),
  ).toBeVisible();
});
test("expense and receipt endpoints enforce origin, body size and desk restrictions", async ({
  page,
}) => {
  await session(page);
  const q = new URLSearchParams({
    organizationId: f.orgA,
    branchId: f.a1,
    filename: "receipt.png",
    requestKey: randomUUID(),
  });
  const cross = await page.request.post("/api/files?" + q, {
    headers: {
      origin: "https://untrusted.invalid",
      "content-type": "image/png",
    },
    data: image,
  });
  expect(cross.status()).toBe(403);
  const large = await page.request.post("/api/files?" + q, {
    headers: { origin: base, "content-type": "image/png" },
    data: Buffer.alloc(2097153),
  });
  expect(large.status()).toBe(422);
  const malformed = await page.request.post("/api/files?" + q, {
    headers: { origin: base, "content-type": "image/png" },
    data: Buffer.from("not a png"),
  });
  expect(malformed.status()).toBe(422);
  await session(page, "Reception A");
  expect(
    (await page.request.get(`/api/expenses?organizationId=${f.orgA}`)).status(),
  ).toBe(403);
  const blocked = await page.request.post("/api/files?" + q, {
    headers: { origin: base, "content-type": "image/png" },
    data: image,
  });
  expect(blocked.status()).toBe(403);
  await page.goto(`/expenses?organizationId=${f.orgA}`);
  await expect(
    page.getByRole("heading", { name: "Expenses unavailable", exact: true }),
  ).toBeVisible();
});
