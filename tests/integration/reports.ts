import { createMembersService } from "../../src/modules/members/service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { createPaymentsService } from "../../src/modules/payments/service";
import { createCorrectionsService } from "../../src/modules/billing/corrections";
import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { securityFixture } from "../helpers/security-fixture";
import { createReportsService } from "../../src/modules/reports/service";
import { createExpensesService } from "../../src/modules/expenses/service";
import { reportCsv } from "../../src/modules/reports/csv";
import { todayInZone } from "../../src/modules/plans/format";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  assert.equal(new URL(process.env[key]!).pathname, "/gym_test");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  options: "-c TimeZone=UTC",
});
await admin.connect();
const f = await securityFixture(
  admin,
  process.env.BETTER_AUTH_SECRET!,
  "http://127.0.0.1:3100",
);
const auth = configureAuth(pool, {
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: "http://127.0.0.1:3100",
  sendReset: async () => {
    throw Error("No mail");
  },
});
const security = createSecurity(pool, (h) =>
    auth.api.getSession({ headers: h }),
  ),
  reports = createReportsService(security),
  expenses = createExpensesService(security);
try {
  const sessions: Record<string, Headers> = {};
  for (const name of ["Owner A", "Owner B", "Reception A"]) {
    const u = f.users[name],
      r = await auth.api.signInEmail({
        body: { email: u.email, password: u.password },
        asResponse: true,
      });
    sessions[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";"),
    });
  }
  const owner = sessions["Owner A"],
    org = { organizationId: f.orgA },
    today = todayInZone("Asia/Karachi");
  await assert.rejects(() => reports(new Headers(), org));
  await assert.rejects(() => reports(sessions["Reception A"], org));
  await assert.rejects(() => reports(sessions["Owner B"], org));
  for (const report of ["collections", "memberships", "attendance"]) {
    const d = await reports(owner, { ...org, report });
    assert.equal(d.rows.length, 0);
    assert.equal(d.total, 0);
  }
  const categoryId = randomUUID();
  await expenses.category(owner, {
    ...org,
    id: categoryId,
    operation: "create",
    name: "Report reconciliation",
    reason: "Report acceptance",
  });
  const p = await expenses.post(owner, {
    ...org,
    branchId: f.a1,
    categoryId,
    requestKey: randomUUID(),
    description: "Report cost",
    amountMinor: "12345",
    currency: "PKR",
    paidOn: today,
    method: "cash",
    reference: "",
    payee: "",
  });
  const d = await reports(owner, { ...org, from: today, to: today });
  assert.equal(d.summary[0].expenses, "12345");
  assert.equal(d.summary[0].netCash, "-12345");
  assert.equal(d.rows[0].values[7], "123.45");
  const exported = await reports(
    owner,
    { ...org, from: today, to: today },
    true,
  );
  assert.deepEqual(exported.rows, d.rows);
  assert.equal((await reports(owner, { ...org, branchId: f.a2 })).total, 0);
  await expenses.reverse(owner, {
    expenseId: p.expenseId,
    ...org,
    requestKey: randomUUID(),
    cashOn: today,
    reason: "Report reversal",
  });
  const corrected = await reports(owner, { ...org, from: today, to: today });
  assert.equal(corrected.summary[0].netCash, "0");
  assert.equal(corrected.summary[0].reversals, "12345");
  await assert.rejects(() =>
    reports(owner, { ...org, from: "2026-11-30", to: "2026-11-01" }),
  );
  assert.ok(
    reportCsv(["Name"], [["=SUM(A1)"], ['a,"b']]).includes("'=SUM(A1)"),
  );

  const member = (
    await createMembersService(security).create(owner, {
      ...org,
      name: "=Report Member",
      email: randomUUID() + "@example.invalid",
      phone: "",
      homeBranchId: f.a1,
      joinedOn: today,
      registrationKey: randomUUID(),
    })
  ).member;
  const plan = await createPlansService(security).create(owner, {
    ...org,
    branchId: f.a1,
    code: "REPORT-PLAN",
    values: {
      name: "Report plan",
      amountMinor: 100000,
      currency: "PKR",
      durationCount: 1,
      durationUnit: "months",
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Report reconciliation plan",
  });
  const membership = await createMembershipsService(security).enroll(
    owner,
    member.id,
    {
      ...org,
      mode: "enroll",
      memberVersion: 1,
      planVersionId: plan.versionId,
      startOn: today,
      requestKey: randomUUID(),
      reason: "Report enrollment",
    },
  );
  const invoiceId = (
    await admin.query("select id from gym.invoices where membership_id=$1", [
      membership.membershipId,
    ])
  ).rows[0].id;
  const paid = await createPaymentsService(security).record(owner, {
    ...org,
    invoiceId,
    amountMinor: "100000",
    expectedBalanceMinor: "100000",
    currency: "PKR",
    method: "cash",
    paidOn: today,
    requestKey: randomUUID(),
  });
  await createCorrectionsService(security).record(owner, {
    ...org,
    invoiceId,
    paymentId: paid.paymentId,
    kind: "refund",
    amountMinor: "25000",
    expectedBalanceMinor: "0",
    currency: "PKR",
    cashOn: today,
    method: "cash",
    reason: "Report refund",
    requestKey: randomUUID(),
  });
  const finance = await reports(owner, { ...org, from: today, to: today });
  assert.equal(finance.summary[0].received, "100000");
  assert.equal(finance.summary[0].refunded, "25000");
  assert.equal(finance.summary[0].netCollections, "75000");
  assert.equal(finance.summary[0].netCash, "75000");
  const terms = await reports(owner, { ...org, report: "memberships" });
  assert.equal(terms.total, 1);
  assert.equal(terms.rows[0].values[3], "Report plan");
  assert.equal(terms.summary[0]["Active members at period end"], "1");
  assert.equal(terms.summary[0]["Renewal rate"], "N/A");
  // Raw fixture timestamps bracket the gym-local midnight boundary while DB runs UTC.
  await admin.query(
    "insert into gym.attendance_visits(organization_id,member_id,branch_id,checked_in_at,checked_out_at,checked_in_by,checked_out_by,eligibility_snapshot) values($1,$2,$3,($4::date::timestamp at time zone 'Asia/Karachi'),($4::date::timestamp at time zone 'Asia/Karachi')+interval '1 hour',$5,$5,$6::jsonb)",
    [
      f.orgA,
      member.id,
      f.a1,
      today,
      f.users["Owner A"].id,
      JSON.stringify({ allowed: true, reason: "active" }),
    ],
  );
  const attendance = await reports(owner, {
    ...org,
    report: "attendance",
    from: today,
    to: today,
  });
  assert.equal(attendance.total, 1);
  assert.equal(attendance.rows[0].values[5], "60.00");
  assert.equal(attendance.summary[0]["Unique visitors"], "1");
  assert.ok(attendance.rows[0].values[3].endsWith("00:00:00"));
  const noVisit = await reports(owner, {
    ...org,
    report: "attendance",
    branchId: f.a2,
  });
  assert.equal(noVisit.total, 0);
  console.log(
    "PASS report queries, role/tenant/branch scope, exact expense/reversal reconciliation, export parity and CSV escaping",
  );
} finally {
  await f.cleanup();
  await pool.end();
  await admin.end();
}
