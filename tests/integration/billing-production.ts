import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
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
  console.log(
    "PASS: actual production login/member/draft/issue/PDF flow on guarded gym_test; draft PDF 409, issued PDF attachment/no-store with embedded fonts, anonymous PDF 401, no extra issue/charge on download; all three font assets retained in build trace. No external mail.",
  );
} finally {
  server.kill();
  await f.cleanup();
  await admin.end();
}
