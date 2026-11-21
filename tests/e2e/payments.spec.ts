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
  await page.context().addCookies(
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
async function invoice(page: Page, name: string, amount = 100000) {
  const id = await member(page, name);
  const r = await page.request.post("/api/invoices", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      memberId: id,
      values: {
        description: name + " training",
        currency: "PKR",
        dueOn: today,
        lines: [
          {
            description: "Training",
            quantity: 1,
            unitMinor: amount,
            discountMinor: 0,
          },
        ],
      },
      requestKey: randomUUID(),
      reason: "Reviewed payment fixture",
    },
  });
  expect(r.status()).toBe(200);
  const invoiceId = (await r.json()).data.invoiceId as string;
  const issued = await page.request.patch("/api/invoices/" + invoiceId, {
    headers: origin,
    data: {
      organizationId: f.orgA,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Agreed charge",
    },
  });
  expect(issued.status()).toBe(200);
  return { memberId: id, invoiceId };
}
async function payment(page: Page, name: string, amount = "400.00") {
  await page.goto("/payments?organizationId=" + f.orgA);
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Find invoice or member", { exact: true }).fill(name);
  await d
    .getByRole("button", { name: "Search outstanding invoices", exact: true })
    .click();
  await expect(d.getByLabel("Payment invoice").locator("option")).toHaveCount(
    2,
  );
  await d.getByRole("button", { name: "Continue to payment" }).click();
  await d.getByLabel("Amount received", { exact: true }).fill(amount);
  await d
    .getByLabel("Payment method", { exact: true })
    .selectOption("bank_transfer");
  await d
    .getByLabel("Payment reference", { exact: true })
    .fill("TRANSFER-RECEIVED-123");
  await d
    .getByLabel("Receipt note", { exact: true })
    .fill("Thank you for your installment.");
  await d.getByRole("button", { name: "Review payment", exact: true }).click();
  await expect(d.getByRole("region", { name: "Payment review" })).toBeVisible();
  return d;
}
async function count(invoiceId: string) {
  return (
    await admin.query(
      "select count(*)::int n from gym.payments where invoice_id=$1",
      [invoiceId],
    )
  ).rows[0].n as number;
}

test("partial and full payment, immutable paid receipts, PDF, profile history and responsive theme", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const x = await invoice(page, "Payment Sara");
  let d = await payment(page, "Payment Sara");
  expect(await count(x.invoiceId)).toBe(0);
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(
    d.getByRole("region", { name: "Payment confirmation" }),
  ).toBeVisible();
  expect(await count(x.invoiceId)).toBe(1);
  await page.screenshot({
    path: ".local/payment-evidence/payment-confirmation-1440.png",
    fullPage: true,
  });
  await d.getByRole("link", { name: "View paid receipt" }).click();
  await expect(
    page.getByRole("heading", { name: "Payment receipt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Payment receipt" }),
  ).toContainText("600.00");
  const firstReceiptUrl = page.url();
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Download receipt PDF" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download receipt PDF" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Download receipt PDF" }),
    ).toHaveCSS("background-color", "rgb(37, 60, 88)");
    const styles = await page
      .getByRole("button", { name: "Download receipt PDF" })
      .evaluate((el) => ({
        radius: getComputedStyle(el).borderRadius,
        bg: getComputedStyle(el).backgroundColor,
      }));
    expect(styles.radius).toBe("0px");
    expect(styles.bg).toBe("rgb(37, 60, 88)");
    await page.screenshot({
      path: ".local/payment-evidence/receipt-" + width + ".png",
      fullPage: true,
    });
  }
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = "true";
    };
  });
  await page.getByRole("button", { name: "Print receipt" }).click();
  expect(await page.locator("body").getAttribute("data-printed")).toBe("true");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".receipt-screen-actions").first()).toBeHidden();
  await page.pdf({
    path: ".local/payment-evidence/receipt-print.pdf",
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.route("**/api/receipts/*/pdf?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Temporary receipt failure" } }),
    }),
  );
  await page.getByRole("button", { name: "Download receipt PDF" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Temporary receipt failure",
  );
  await page.unroute("**/api/receipts/*/pdf?*");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download receipt PDF" }).click();
  const file = await download;
  await file.saveAs(".local/payment-evidence/receipt-browser.pdf");
  expect(
    (await readFile(".local/payment-evidence/receipt-browser.pdf"))
      .subarray(0, 5)
      .toString(),
  ).toBe("%PDF-");
  expect(await count(x.invoiceId)).toBe(1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  d = await payment(page, "Payment Sara", "600.00");
  await page.screenshot({
    path: ".local/payment-evidence/payment-review-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    path: ".local/payment-evidence/payment-review-390.png",
    fullPage: true,
  });
  await d
    .getByRole("button", { name: "Confirm payment", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: ".local/payment-evidence/payment-confirm-390.png",
    fullPage: true,
  });
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(
    d.getByRole("region", { name: "Payment confirmation" }),
  ).toBeVisible();
  expect(await count(x.invoiceId)).toBe(2);
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("tab", { name: "Payments & receipts", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Payments and receipts" }),
  ).toContainText("TRANSFER-RECEIVED-123");
  await page.screenshot({
    path: ".local/payment-evidence/ledger-390.png",
    fullPage: true,
  });
  await page.goto(firstReceiptUrl);
  await expect(
    page.getByRole("article", { name: "Payment receipt" }),
  ).toContainText("600.00");
  await page.goto(`/members/${x.memberId}?organizationId=${f.orgA}`);
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Member payments" }),
  ).toContainText("2");
  expect(errors).toEqual([]);
});

test("lost payment response safely replays one payment with retained review", async ({
  page,
}) => {
  const x = await invoice(page, "Retry payment");
  const d = await payment(page, "Retry payment");
  let lost = false;
  await page.route("**/api/payments", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      const r = await route.fetch();
      expect(r.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("Your review is kept");
  expect(await count(x.invoiceId)).toBe(1);
  await expect(d.getByLabel("Amount received", { exact: true })).toHaveValue(
    "400.00",
  );
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(
    d.getByRole("region", { name: "Payment confirmation" }),
  ).toBeVisible();
  expect(await count(x.invoiceId)).toBe(1);
});

test("committed payment with failed refresh retains receipt and blocks another write", async ({
  page,
}) => {
  const x = await invoice(page, "Refresh payment");
  const d = await payment(page, "Refresh payment");
  await page.route("**/api/invoices?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "Refresh unavailable" } }),
    }),
  );
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(
    d.getByRole("region", { name: "Payment confirmation" }),
  ).toBeVisible();
  await expect(d.getByRole("alert")).toContainText("Payment saved");
  await expect(
    d.getByRole("link", { name: "View paid receipt" }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Record payment", exact: true }),
  ).toBeDisabled();
  expect(await count(x.invoiceId)).toBe(1);
  await page.unroute("**/api/invoices?*");
  await page.getByRole("button", { name: "Reload invoices" }).click();
  await expect(
    page.getByRole("button", { name: "Record payment", exact: true }),
  ).toBeEnabled();
});

test("concurrent operator balance change keeps stale payment review without overpayment", async ({
  page,
}) => {
  const x = await invoice(page, "Stale payment");
  const d = await payment(page, "Stale payment", "700.00");
  const r = await page.request.post("/api/payments", {
    headers: origin,
    data: {
      organizationId: f.orgA,
      invoiceId: x.invoiceId,
      amountMinor: "70000",
      expectedBalanceMinor: "100000",
      currency: "PKR",
      method: "cash",
      paidOn: today,
      requestKey: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(d.getByRole("alert")).toContainText("balance changed");
  await expect(d.getByLabel("Amount received", { exact: true })).toHaveValue(
    "700.00",
  );
  expect(await count(x.invoiceId)).toBe(1);
});

test("theme applies across existing screens with square controls and glass fallback", async ({
  page,
}) => {
  test.setTimeout(120000);
  await session(page);
  for (const route of [
    "/workspace",
    "/members",
    "/plans",
    "/settings",
    "/payments",
    "/dashboard",
  ]) {
    await page.goto(route + "?organizationId=" + f.orgA);
    await page.waitForLoadState("networkidle");
    for (const width of [1440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(241, 244, 247)");
      expect(
        await page
          .locator("button:visible")
          .evaluateAll((els) =>
            els.every((el) => getComputedStyle(el).borderRadius === "0px"),
          ),
      ).toBe(true);
      await page.screenshot({
        path:
          ".local/payment-evidence/theme-" +
          route.slice(1) +
          "-" +
          width +
          ".png",
        fullPage: true,
      });
    }
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await page.goto("/payments?organizationId=" + f.orgA);
  expect(
    await page
      .locator(".panel")
      .first()
      .evaluate((el) => ({
        bg: getComputedStyle(el).backgroundColor,
        filter: getComputedStyle(el).backdropFilter,
      })),
  ).toEqual({ bg: "rgb(255, 255, 255)", filter: "none" });
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });
  await cdp.detach();
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await page.screenshot({
    path: ".local/payment-evidence/theme-sign-in-390.png",
    fullPage: true,
  });
});

async function correct(
  page: Page,
  invoiceId: string,
  kind: string,
  amount: string,
  reason: string,
) {
  await page.goto(`/payments?organizationId=${f.orgA}&invoiceId=${invoiceId}`);
  await page
    .getByRole("button", { name: "Correct invoice", exact: true })
    .click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Correction type", { exact: true }).selectOption(kind);
  if (kind !== "void")
    await d.getByLabel("Correction amount (PKR)", { exact: true }).fill(amount);
  await d.getByLabel("Reason", { exact: true }).fill(reason);
  await d
    .getByRole("button", { name: "Review correction", exact: true })
    .click();
  await expect(
    d.getByRole("region", { name: "Correction review" }),
  ).toBeVisible();
  return d;
}
test("owner refunds and credits preserve receipts, balances and correction history", async ({
  page,
}) => {
  const x = await invoice(page, "Correction member");
  let d = await payment(page, "Correction member", "1000.00");
  await d.getByRole("button", { name: "Confirm payment", exact: true }).click();
  await expect(
    d.getByRole("region", { name: "Payment confirmation" }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  d = await correct(
    page,
    x.invoiceId,
    "refund",
    "250.00",
    "Returned unused coaching funds",
  );
  await d
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Financial corrections", exact: true }),
  ).toContainText("Returned unused coaching funds");
  expect(
    (
      await admin.query(
        "select balance_minor::text balance from gym.invoice_balances where invoice_id=$1",
        [x.invoiceId],
      )
    ).rows[0].balance,
  ).toBe("25000");
  d = await correct(
    page,
    x.invoiceId,
    "refund_credit",
    "100.00",
    "Return and waive agreed charge",
  );
  await d
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  expect(
    (
      await admin.query(
        "select balance_minor::text balance from gym.invoice_balances where invoice_id=$1",
        [x.invoiceId],
      )
    ).rows[0].balance,
  ).toBe("25000");
  d = await correct(
    page,
    x.invoiceId,
    "credit",
    "250.00",
    "Waive remaining approved charge",
  );
  let lost = false;
  await page.route("**/api/invoices/*/corrections", async (route) => {
    if (!lost) {
      lost = true;
      const r = await route.fetch();
      expect(r.status()).toBe(200);
      await route.abort("failed");
    } else await route.continue();
  });
  await d
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(d.getByRole("alert")).toContainText("retry safely");
  await d
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  expect(
    (
      await admin.query(
        "select count(*)::int n from gym.financial_corrections where invoice_id=$1",
        [x.invoiceId],
      )
    ).rows[0].n,
  ).toBe(3);
  await expect(
    page.getByRole("region", { name: "Financial corrections", exact: true }),
  ).toContainText("Latest 3 of 3");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({
    path: ".local/payment-evidence/corrections-390.png",
    fullPage: true,
  });
  expect(await count(x.invoiceId)).toBe(1);
});
test("void keeps the issued number and downloads a clearly void PDF", async ({
  page,
}) => {
  const x = await invoice(page, "Void member");
  const d = await correct(
    page,
    x.invoiceId,
    "void",
    "",
    "Unused duplicate charge voided",
  );
  await d
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "Correction recorded", exact: true }),
  ).toBeVisible();
  await d.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".pill").first()).toHaveText(
    "Void",
  );
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Record payment", exact: true }),
  ).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await (await download).saveAs(".local/payment-evidence/invoice-void.pdf");
  const r = await page.request.get(
    `/api/invoices/${x.invoiceId}?organizationId=${f.orgA}`,
  );
  expect((await r.json()).data.invoice.status).toBe("void");
  expect(await count(x.invoiceId)).toBe(0);
});
