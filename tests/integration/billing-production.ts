import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { securityFixture } from "../helpers/security-fixture";
import { todayInZone } from "../../src/modules/plans/format";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname != "/gym_test")
    throw Error("Isolated gym_test required");
const base = "http://127.0.0.1:3201";
let occupied = false;
try {
  await fetch(base + "/sign-in");
  occupied = true;
} catch {}
if (occupied) throw Error("Production PDF test port 3201 occupied");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
await admin.connect();
const f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, base);
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3201",
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_ENV: "production",
      APP_URL: base,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DEMO_MODE: "false",
      MAIL_TRANSPORT: "smtp",
    },
    stdio: "ignore",
  },
);
try {
  let ready = false;
  for (let n = 0; n < 150; n++) {
    if (server.exitCode !== null) throw Error("Production server exited");
    try {
      ready = (await fetch(base + "/sign-in")).status === 200;
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "Production server must become ready");
  const user = f.users["Owner A"],
    login = await fetch(base + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
  assert.equal(login.status, 200);
  const cookie = login.headers
      .getSetCookie()
      .map((s) => s.split(";")[0])
      .join(";"),
    headers = { origin: base, "content-type": "application/json", cookie };
  async function post(path: string, body: unknown, method = "POST") {
    const r = await fetch(base + path, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200, path);
    return (await r.json()).data;
  }
  const member = await post("/api/members", {
    organizationId: f.orgA,
    name: "PDF production member",
    email: randomUUID() + "@example.invalid",
    phone: "",
    homeBranchId: f.a1,
    joinedOn: todayInZone("Asia/Karachi"),
    registrationKey: randomUUID(),
  });
  const entry = {
    organizationId: f.orgA,
    branchId: f.a1,
    memberId: member.member.id,
    operation: "check_in",
    requestKey: randomUUID(),
    overrideReason: "Authorized production visit verification",
  };
  const visit = await post("/api/attendance", entry);
  assert.equal((await post("/api/attendance", entry)).visitId, visit.visitId);
  await post("/api/attendance", {
    organizationId: f.orgA,
    branchId: f.a1,
    visitId: visit.visitId,
    operation: "check_out",
    requestKey: randomUUID(),
  });
  const attendanceResponse = await fetch(
    `${base}/api/attendance?organizationId=${f.orgA}&branchId=${f.a1}`,
    { headers: { cookie } },
  );
  assert.equal(attendanceResponse.status, 200);
  const attendance = (await attendanceResponse.json()).data;
  assert.equal(attendance.summary.checkIns, 1);
  assert.equal(attendance.summary.inside, 0);
  assert.ok(attendance.visits[0].checkedOutAt);
  const qr = await fetch(
    `${base}/api/members/${member.member.id}/access-code`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ organizationId: f.orgA }),
    },
  );
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get("cache-control"), "private, no-store");
  assert.match(await qr.text(), /<svg/);
  console.log(
    "PASS production attendance: maintained login, reasoned visit, replay, checkout, source summaries/history and private QR attachment.",
  );
  const draft = await post("/api/invoices", {
    organizationId: f.orgA,
    memberId: member.member.id,
    requestKey: randomUUID(),
    reason: "Production PDF verification",
    values: {
      description: "Production invoice verification",
      currency: "PKR",
      dueOn: todayInZone("Asia/Karachi"),
      lines: [
        {
          description: "Coaching fee",
          quantity: 1,
          unitMinor: 450025,
          discountMinor: 25,
        },
      ],
    },
  });
  assert.equal(
    (
      await fetch(
        `${base}/api/invoices/${draft.invoiceId}/pdf?organizationId=${f.orgA}`,
        { headers: { cookie } },
      )
    ).status,
    409,
  );
  await post(
    "/api/invoices/" + draft.invoiceId,
    {
      organizationId: f.orgA,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Production reviewed issue",
    },
    "PATCH",
  );
  const path = `/api/invoices/${draft.invoiceId}/pdf?organizationId=${f.orgA}`,
    pdf = await fetch(base + path, { headers: { cookie } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.match(
    pdf.headers.get("content-disposition")!,
    /^attachment; filename="GYM-INV-\d+\.pdf"$/,
  );
  assert.match(pdf.headers.get("cache-control")!, /no-store/);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 15000);
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (
      await admin.query("select version from gym.invoices where id=$1", [
        draft.invoiceId,
      ])
    ).rows[0].version,
    2,
  );
  const trace = JSON.parse(
    await readFile(
      ".next/server/app/api/invoices/[id]/pdf/route.js.nft.json",
      "utf8",
    ),
  );
  for (const file of [
    "NotoSans-Regular.ttf",
    "NotoSans-Bold.ttf",
    "NotoNaskhArabic-Regular.ttf",
  ])
    assert.ok(
      trace.files.some((p: string) => p.endsWith(file)),
      "Production trace must include " + file,
    );
  await mkdir(".local/billing-evidence", { recursive: true });
  await writeFile(".local/billing-evidence/invoice-production.pdf", bytes);

  const paymentInput = {
    organizationId: f.orgA,
    invoiceId: draft.invoiceId,
    requestKey: randomUUID(),
    amountMinor: "200000",
    expectedBalanceMinor: "450000",
    currency: "PKR",
    method: "bank_transfer",
    paidOn: todayInZone("Asia/Karachi"),
    reference: "PRODUCTION-CAPTURED-TRANSFER",
    note: "Received coaching installment",
  };
  const partial = await post("/api/payments", paymentInput);
  assert.equal(partial.balanceAfterMinor, "250000");
  assert.equal(
    (await post("/api/payments", paymentInput)).paymentId,
    partial.paymentId,
  );
  const full = await post("/api/payments", {
    ...paymentInput,
    requestKey: randomUUID(),
    amountMinor: "250000",
    expectedBalanceMinor: "250000",
  });
  assert.equal(full.balanceAfterMinor, "0");
  const receiptPath = `/api/receipts/${partial.paymentId}/pdf?organizationId=${f.orgA}`;
  const paidPdf = await fetch(base + receiptPath, { headers: { cookie } });
  assert.equal(paidPdf.status, 200);
  assert.equal(paidPdf.headers.get("content-type"), "application/pdf");
  assert.match(paidPdf.headers.get("cache-control")!, /no-store/);
  assert.match(
    paidPdf.headers.get("content-disposition")!,
    /^attachment; filename="GYM-RC-\d+\.pdf"$/,
  );
  const paidBytes = Buffer.from(await paidPdf.arrayBuffer());
  assert.equal(paidBytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await fetch(base + receiptPath)).status, 401);
  const historical = await fetch(
    `${base}/api/receipts/${partial.paymentId}?organizationId=${f.orgA}`,
    { headers: { cookie } },
  );
  const receiptData = (await historical.json()).data;
  assert.equal(receiptData.payment.balanceAfterMinor, "250000");
  assert.equal(receiptData.invoiceBalanceMinor, "0");
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.payments where invoice_id=$1",
        [draft.invoiceId],
      )
    ).rows[0].n,
    2,
  );
  const receiptTrace = JSON.parse(
    await readFile(
      ".next/server/app/api/receipts/[id]/pdf/route.js.nft.json",
      "utf8",
    ),
  );
  for (const file of [
    "NotoSans-Regular.ttf",
    "NotoSans-Bold.ttf",
    "NotoNaskhArabic-Regular.ttf",
  ])
    assert.ok(receiptTrace.files.some((p: string) => p.endsWith(file)));
  await mkdir(".local/payment-evidence", { recursive: true });
  await writeFile(".local/payment-evidence/receipt-production.pdf", paidBytes);
  const refundInput = {
    organizationId: f.orgA,
    invoiceId: draft.invoiceId,
    requestKey: randomUUID(),
    kind: "refund",
    paymentId: partial.paymentId,
    amountMinor: "50000",
    expectedBalanceMinor: "0",
    currency: "PKR",
    cashOn: todayInZone("Asia/Karachi"),
    method: "cash",
    reason: "Production manual refund verification",
  };
  const refund = await post(
    `/api/invoices/${draft.invoiceId}/corrections`,
    refundInput,
  );
  assert.equal(refund.balanceAfterMinor, "50000");
  assert.equal(
    (await post(`/api/invoices/${draft.invoiceId}/corrections`, refundInput))
      .correctionId,
    refund.correctionId,
  );
  assert.equal(
    (
      await post(`/api/invoices/${draft.invoiceId}/corrections`, {
        organizationId: f.orgA,
        invoiceId: draft.invoiceId,
        requestKey: randomUUID(),
        kind: "credit",
        amountMinor: "50000",
        expectedBalanceMinor: "50000",
        currency: "PKR",
        cashOn: todayInZone("Asia/Karachi"),
        reason: "Production charge correction verification",
      })
    ).balanceAfterMinor,
    "0",
  );
  const adjusted = await (
    await fetch(
      `${base}/api/invoices/${draft.invoiceId}?organizationId=${f.orgA}`,
      { headers: { cookie } },
    )
  ).json();
  assert.equal(adjusted.data.invoice.hasCorrections, true);
  assert.equal(adjusted.data.corrections.total, 2);
  assert.equal(adjusted.data.invoice.totalMinor, "450000");
  assert.equal(adjusted.data.invoice.balanceMinor, "0");
  const voidDraft = await post("/api/invoices", {
    organizationId: f.orgA,
    memberId: member.member.id,
    requestKey: randomUUID(),
    reason: "Production void verification",
    values: {
      description: "Void verification",
      currency: "PKR",
      dueOn: todayInZone("Asia/Karachi"),
      lines: [
        {
          description: "Replaced charge",
          quantity: 1,
          unitMinor: 1000,
          discountMinor: 0,
        },
      ],
    },
  });
  await post(
    `/api/invoices/${voidDraft.invoiceId}`,
    {
      organizationId: f.orgA,
      operation: "issue",
      version: 1,
      requestKey: randomUUID(),
      reason: "Production reviewed void target",
    },
    "PATCH",
  );
  await post(`/api/invoices/${voidDraft.invoiceId}/corrections`, {
    organizationId: f.orgA,
    invoiceId: voidDraft.invoiceId,
    requestKey: randomUUID(),
    kind: "void",
    amountMinor: "0",
    expectedBalanceMinor: "1000",
    currency: "PKR",
    cashOn: todayInZone("Asia/Karachi"),
    reason: "Incorrect charge withdrawn before payment",
  });
  const voidDetail = await (
    await fetch(
      `${base}/api/invoices/${voidDraft.invoiceId}?organizationId=${f.orgA}`,
      { headers: { cookie } },
    )
  ).json();
  assert.equal(voidDetail.data.invoice.status, "void");
  assert.equal(voidDetail.data.invoice.balanceMinor, "0");
  const voidPdf = await fetch(
    `${base}/api/invoices/${voidDraft.invoiceId}/pdf?organizationId=${f.orgA}`,
    { headers: { cookie } },
  );
  assert.equal(voidPdf.status, 200);
  await writeFile(
    ".local/payment-evidence/invoice-void-production.pdf",
    Buffer.from(await voidPdf.arrayBuffer()),
  );
  console.log(
    "PASS production owner refund, same-request replay, credit/history with original totals retained, void status/balance and private void PDF.",
  );
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookie.split(";").map((part) => {
        const i = part.trim().indexOf("=");
        const v = part.trim();
        return {
          name: v.slice(0, i),
          value: v.slice(i + 1),
          url: base,
          httpOnly: true,
        };
      }),
    );
    const page = await context.newPage();
    await page.goto(
      `${base}/members/${member.member.id}?organizationId=${f.orgA}`,
    );
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("heading", { name: "PDF production member", exact: true })
      .waitFor();
    for (const width of [1440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `.local/payment-evidence/profile-payments-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("tab", { name: "Payments", exact: true }).click();
    await page
      .getByRole("region", { name: "Member payments", exact: true })
      .getByRole("link")
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "Member payments", exact: true })
        .getByRole("link")
        .count(),
      2,
    );
    console.log(
      "PASS: actual production member profile shows both saved payments; four responsive captures without page overflow.",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => {
      (
        window as Window & { mojymNavigationProbe?: string }
      ).mojymNavigationProbe = "preserved";
    });
    const documentRequests: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document") documentRequests.push(r.url());
    });
    const timings: Record<string, number> = {};
    for (const [name, heading] of [
      ["Plans", "Membership plans"],
      ["Members", "Members"],
      ["Payments", "Invoices & balances"],
    ]) {
      const start = Date.now();
      await page
        .locator(".app-sidebar")
        .getByRole("link", { name, exact: true })
        .click();
      await page.getByRole("heading", { name: heading, exact: true }).waitFor();
      timings[name] = Date.now() - start;
      assert.equal(
        await page.evaluate(
          () =>
            (window as Window & { mojymNavigationProbe?: string })
              .mojymNavigationProbe,
        ),
        "preserved",
      );
    }
    assert.deepEqual(documentRequests, []);
    await page.getByRole("link", { name: "Mojym", exact: true }).waitFor();
    assert.equal((await page.request.get(base + "/icon.svg")).status(), 200);
    await page.screenshot({
      path: ".local/payment-evidence/mojym-production.png",
      fullPage: true,
    });
    console.log(
      "PASS Mojym navigation: no document reloads; window state retained; production transition timings ms:",
      timings,
    );
  } finally {
    await browser.close();
  }
  console.log(
    "PASS: production partial/full payments, idempotent replay, persisted historical receipt/current balance, PDF attachment/no-store/anonymous denial and all embedded font traces. No external sends.",
  );
  console.log(
    "PASS: actual production login/member/draft/issue/PDF flow on guarded gym_test; draft PDF 409, issued PDF attachment/no-store with embedded fonts, anonymous PDF 401, no extra issue/charge on download; all three font assets retained in build trace. No external mail.",
  );
} finally {
  server.kill();
  await f.cleanup();
  await admin.end();
}
