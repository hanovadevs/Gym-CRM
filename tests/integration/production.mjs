import { config } from "dotenv";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const url = "http://127.0.0.1:3200/dashboard";
let occupied = false;
try {
  await fetch(url);
  occupied = true;
} catch {}
if (occupied)
  throw new Error(
    "Production test port 3200 is occupied; refusing to reuse it",
  );
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  {
    env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "false" },
    stdio: "ignore",
  },
);
try {
  let response;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production server exited");
    try {
      response = await fetch(url);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(response, "Production server must start");
  assert.equal(response.status, 200);
  const html = await response.text();
  // fetch follows HTTP redirects, but Next may stream the legacy alias as a
  // meta redirect. Verify its real destination too, as a browser does.
  let protectedResponse = response,
    protectedHtml = html;
  if (html.includes("url=/workspace") || html.includes("url=/dashboard")) {
    protectedResponse = await fetch("http://127.0.0.1:3200/dashboard");
    protectedHtml = await protectedResponse.text();
  }
  assert.ok(
    protectedResponse.url.endsWith("/sign-in") ||
      protectedHtml.includes("url=/sign-in"),
  );
  assert.ok(!html.includes("Good afternoon, Ali"));
  assert.ok(!html.includes("Demo data"));
  const denied = await fetch("http://127.0.0.1:3200/api/workspace");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("cache-control"), "no-store");
  assert.equal((await denied.json()).error.code, "UNAUTHENTICATED");
  const org = "00000000-0000-4000-8000-000000000001";
  const planValues = {
    name: "Blocked plan",
    amountMinor: 450000,
    currency: "PKR",
    durationUnit: "months",
    durationCount: 1,
    accessMode: "home_branch",
    gymFloor: true,
    classes: false,
    personalTraining: false,
  };
  for (const [path, method, body] of [
    [`/api/expenses?organizationId=${org}`, "GET"],
    [`/api/files/${org}?organizationId=${org}`, "GET"],
    [
      "/api/expenses/categories",
      "POST",
      {
        organizationId: org,
        operation: "create",
        id: org,
        name: "Blocked category",
        reason: "Anonymous guard",
      },
    ],
    [
      "/api/expenses",
      "POST",
      {
        organizationId: org,
        branchId: org,
        categoryId: org,
        requestKey: org,
        description: "Blocked expense",
        amountMinor: "100",
        currency: "PKR",
        paidOn: "2026-11-22",
        method: "cash",
      },
    ],
    [
      `/api/expenses/${org}/reverse`,
      "POST",
      {
        organizationId: org,
        requestKey: org,
        cashOn: "2026-11-22",
        reason: "Anonymous guard",
      },
    ],
    [`/api/dashboard?organizationId=${org}`, "GET"],
    [`/api/attendance?organizationId=${org}`, "GET"],
    [
      `/api/attendance/lookup?organizationId=${org}&branchId=${org}&q=member`,
      "GET",
    ],
    [
      "/api/attendance",
      "POST",
      {
        organizationId: org,
        branchId: org,
        memberId: org,
        requestKey: org,
        operation: "check_in",
      },
    ],
    [`/api/members/${org}/access-code`, "POST", { organizationId: org }],
    ["/api/platform", "GET"],
    ["/api/platform/analytics", "GET"],
    ["/api/trainers", "GET"],
    ["/api/reports", "GET"],
    ["/api/reports/export", "GET"],
    ["/api/training", "GET"],
    ["/api/training/members?organizationId="+org+"&branchId="+org+"&trainerId="+org, "GET"],
    ["/api/training", "POST", {operation:"assignment",organizationId:org,id:org,requestKey:org,trainerId:org,branchId:org,memberId:org,startOn:"2026-11-23",endOn:null,active:true,reason:"Anonymous denial check"}],
    ["/api/payroll", "GET"],
    ["/api/classes", "GET"],
    ["/api/member-fees", "GET"],
    ["/api/member-fees", "POST", {operation:"digest",organizationId:org}],
    ["/api/classes/members?organizationId="+org+"&classId="+org+"&q=member", "GET"],
    ["/api/classes", "POST", {operation:"room",organizationId:org,id:org,requestKey:org,branchId:org,name:"Anonymous room",capacity:10,active:true,reason:"Anonymous denial check"}],
    [
      "/api/payroll",
      "POST",
      {
        operation: "employee",
        organizationId: org,
        id: org,
        requestKey: org,
        name: "Anonymous employee",
        title: "Anonymous employee",
        branchId: org,
        startOn: "2026-11-01",
        active: true,
        salaryMinor: null,
        currency: "PKR",
        payDay: 1,
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/trainers",
      "POST",
      {
        organizationId: org,
        id: org,
        requestKey: org,
        name: "Anonymous trainer",
        branchIds: [org],
        reason: "Anonymous denial check",
      },
    ],
    ["/api/platform/billing", "GET"],
    ["/api/platform/billing", "POST", {}],
    ["/api/platform", "POST", {}],
    [
      `/api/invoices/${org}/corrections`,
      "POST",
      {
        organizationId: org,
        invoiceId: org,
        requestKey: org,
        kind: "credit",
        amountMinor: "1",
        expectedBalanceMinor: "1",
        currency: "PKR",
        cashOn: "2026-11-21",
        reason: "Anonymous correction guard",
      },
    ],
    [`/api/payments?organizationId=${org}`, "GET"],
    [`/api/payments/targets?organizationId=${org}`, "GET"],
    [`/api/receipts/${org}?organizationId=${org}`, "GET"],
    [`/api/receipts/${org}/pdf?organizationId=${org}`, "GET"],
    [
      "/api/payments",
      "POST",
      {
        organizationId: org,
        invoiceId: org,
        requestKey: org,
        amountMinor: "100",
        expectedBalanceMinor: "100",
        currency: "PKR",
        method: "cash",
        paidOn: "2026-11-21",
      },
    ],
    [`/api/invoices?organizationId=${org}`, "GET"],
    [`/api/invoices/${org}?organizationId=${org}`, "GET"],
    [`/api/invoices/${org}/pdf?organizationId=${org}`, "GET"],
    [`/api/invoices/recipients?organizationId=${org}`, "GET"],
    [
      "/api/invoices",
      "POST",
      {
        organizationId: org,
        memberId: org,
        requestKey: org,
        reason: "Anonymous invoice guard",
        values: {
          description: "Blocked charge",
          currency: "PKR",
          dueOn: "2026-11-21",
          lines: [
            {
              description: "Blocked fee",
              quantity: 1,
              unitMinor: 100,
              discountMinor: 0,
            },
          ],
        },
      },
    ],
    [
      `/api/invoices/${org}`,
      "PATCH",
      {
        organizationId: org,
        operation: "issue",
        version: 1,
        requestKey: org,
        reason: "Anonymous invoice guard",
      },
    ],
    [`/api/members/${org}/memberships?organizationId=${org}`, "GET"],
    [
      `/api/members/${org}/memberships`,
      "POST",
      {
        organizationId: org,
        memberVersion: 1,
        mode: "enroll",
        planVersionId: org,
        requestKey: org,
        reason: "Anonymous denial check",
      },
    ],
    [
      `/api/members/${org}/memberships/preview`,
      "POST",
      {
        organizationId: org,
        memberVersion: 1,
        mode: "enroll",
        planVersionId: org,
      },
    ],
    [
      `/api/members/${org}/memberships`,
      "PATCH",
      {
        organizationId: org,
        memberVersion: 1,
        membershipId: org,
        version: 1,
        operation: "cancel",
        requestKey: org,
        effectiveOn: "2026-11-21",
        reason: "Anonymous denial check",
      },
    ],
    ["/api/plans", "GET"],
    [`/api/plans/${org}?organizationId=${org}`, "GET"],
    [
      "/api/plans",
      "POST",
      {
        organizationId: org,
        branchId: org,
        code: "BLOCKED",
        requestKey: org,
        values: planValues,
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/plans",
      "PATCH",
      {
        organizationId: org,
        id: org,
        revision: 1,
        requestKey: org,
        values: planValues,
        reason: "Anonymous denial check",
      },
    ],
    [
      `/api/plans/${org}/archive`,
      "POST",
      {
        organizationId: org,
        revision: 1,
        archived: true,
        reason: "Anonymous denial check",
      },
    ],
    ["/api/settings", "GET"],
    ["/api/members", "GET"],
    [`/api/members/${org}`, "GET"],
    [
      `/api/members/${org}/contact`,
      "PATCH",
      {
        organizationId: org,
        version: 1,
        reason: "Anonymous denial check",
        contact: null,
      },
    ],
    [
      `/api/members/${org}/archive`,
      "POST",
      {
        organizationId: org,
        version: 1,
        reason: "Anonymous denial check",
        archived: true,
      },
    ],
    [
      `/api/members/${org}/notes`,
      "POST",
      {
        organizationId: org,
        requestKey: org,
        body: "Blocked note",
        visibility: "operational",
      },
    ],
    ["/api/staff/mail", "POST", { organizationId: org, mailId: org }],
    [
      "/api/members",
      "POST",
      {
        organizationId: org,
        registrationKey: org,
        name: "Blocked member",
        phone: "",
        email: "blocked@example.invalid",
        homeBranchId: org,
        joinedOn: "2026-01-01",
      },
    ],
    [
      "/api/members",
      "PATCH",
      {
        organizationId: org,
        id: org,
        version: 1,
        name: "Blocked edit",
        phone: "",
        email: "blocked@example.invalid",
        homeBranchId: org,
        joinedOn: "2026-01-01",
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/settings",
      "PATCH",
      {
        organizationId: org,
        version: 1,
        changes: { phone: "0300-0000000" },
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/staff",
      "PATCH",
      {
        organizationId: org,
        id: org,
        version: 1,
        role: "owner",
        active: true,
        branchIds: [],
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/branches",
      "POST",
      {
        organizationId: org,
        name: "Blocked branch",
        code: "BLOCKED",
        active: true,
        reason: "Anonymous denial check",
      },
    ],
  ]) {
    const result = await fetch("http://127.0.0.1:3200" + path, {
      method,
      headers: {
        Origin: new URL(process.env.APP_URL).origin,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(result.status, 401, path + " requires authentication");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).error.code, "UNAUTHENTICATED");
  }
  for (const path of [
    "/member-fees",
    "/employees",
    "/trainers",
    "/training",
    "/workspace",
    "/members",
    "/settings",
    "/plans",
    "/payments",
    "/admin/gyms/00000000-0000-4000-8000-000000000001",
  ]) {
    const protectedPage = await fetch("http://127.0.0.1:3200" + path);
    // Next inserts a meta redirect when the loading boundary has already streamed.
    assert.ok(
      protectedPage.url.endsWith("/sign-in") ||
        (await protectedPage.text()).includes("url=/sign-in"),
    );
  }
  const configured = new URL(process.env.APP_URL);
  if (["localhost", "127.0.0.1"].includes(configured.hostname)) {
    configured.hostname =
      configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
    const rejected = await fetch("http://127.0.0.1:3200/api/members", {
      method: "POST",
      headers: {
        Origin: configured.origin,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(
      rejected.status,
      403,
      "Production rejects the unconfigured loopback alias",
    );
    const rejectedAuth = await fetch(
      "http://127.0.0.1:3200/api/auth/sign-in/email",
      {
        method: "POST",
        headers: {
          Origin: configured.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "blocked@example.invalid",
          password: "Fictional test password",
        }),
      },
    );
    assert.equal(
      rejectedAuth.status,
      403,
      "Production auth rejects the unconfigured alias",
    );
  }
  const files = await readdir(".next/static", {
    recursive: true,
    withFileTypes: true,
  });
  let count = 0;
  const sensitive = [
    process.env.DATABASE_URL,
    process.env.MIGRATION_DATABASE_URL,
    process.env.BETTER_AUTH_SECRET,
    process.env.SMTP_PASSWORD,
  ].filter(Boolean);
  for (const file of files) {
    if (!file.isFile()) continue;
    const bytes = await readFile(file.parentPath + "/" + file.name);
    count++;
    for (const secret of sensitive)
      assert.ok(
        !bytes.includes(Buffer.from(secret)),
        "Server secret appeared in client asset",
      );
  }
  console.log(
    `PASS: production preview disabled; workspace/settings/staff/branch/member/profile/note/mail/plan/membership/invoice/PDF APIs 401/no-store and protected pages redirect to sign-in; ${count} client assets contain no configured database URLs/auth/SMTP secret.`,
  );
} finally {
  server.kill();
}
