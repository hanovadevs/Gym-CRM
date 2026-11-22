import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createPayrollService } from "../../src/modules/payroll/service";
import { createExpensesService } from "../../src/modules/expenses/service";
import { securityFixture } from "../helpers/security-fixture";
import { todayInZone } from "../../src/modules/plans/format";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname !== "/gym_test")
    throw Error("Only isolated gym_test");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
await admin.connect();
const baseURL = "http://127.0.0.1:3100",
  f = await securityFixture(admin, process.env.BETTER_AUTH_SECRET!, baseURL);
const auth = configureAuth(pool, {
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL,
  sendReset: async () => {
    throw Error("No email during payroll checks");
  },
});
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);

const payroll = createPayrollService(security),
  expenses = createExpensesService(security);
async function login(name: string) {
  const u = f.users[name];
  const r = await auth.api.signInEmail({
    body: { email: u.email, password: u.password },
    asResponse: true,
  });
  assert.equal(r.status, 200);
  return new Headers({
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";"),
  });
}
try {
  const headers = await login("Owner A"),
    desk = await login("Reception A"),
    manager = await login("Shared Staff"),
    today = todayInZone("Asia/Karachi"),
    period = today.slice(0, 7) + "-01",
    id = randomUUID();
  const employee = {
    operation: "employee",
    organizationId: f.orgA,
    requestKey: randomUUID(),
    id,
    name: "Payroll colleague",
    title: "Reception supervisor",
    branchId: f.a1,
    trainerId: null,
    phone: "",
    email: "",
    startOn: period,
    active: true,
    salaryMinor: "10000",
    currency: "PKR",
    payDay: 1,
    reason: "Create salary profile",
  };
  await assert.rejects(payroll.get(new Headers(), { organizationId: f.orgA }), {
    code: "UNAUTHENTICATED",
  });
  await assert.rejects(payroll.get(desk, { organizationId: f.orgA }), {
    code: "FORBIDDEN",
  });
  const saved = await payroll.post(headers, employee);
  assert.equal(saved.employeeId, id);
  assert.equal((await payroll.post(headers, employee)).employeeId, id);
  await assert.rejects(
    payroll.post(headers, { ...employee, title: "Changed replay" }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    payroll.post(manager, {
      ...employee,
      id: randomUUID(),
      requestKey: randomUUID(),
      branchId: f.a2,
    }),
    { code: "NOT_FOUND" },
  );
  const charge = {
      operation: "charge",
      organizationId: f.orgA,
      requestKey: randomUUID(),
      employeeId: id,
      period,
      dueOn: today,
      amountMinor: "10000",
      currency: "PKR",
      reason: "Record monthly salary due",
    },
    c = await payroll.post(headers, charge),
    chargeId = c.chargeId as string;
  assert.equal((await payroll.post(headers, charge)).chargeId, chargeId);
  await assert.rejects(
    payroll.post(headers, { ...charge, requestKey: randomUUID() }),
    { code: "CONFLICT" },
  );
  await payroll.post(headers, {
    ...employee,
    requestKey: randomUUID(),
    version: 1,
    salaryMinor: "20000",
  });
  await assert.rejects(
    payroll.post(headers, {
      ...employee,
      requestKey: randomUUID(),
      version: 1,
    }),
    { code: "CONFLICT" },
  );
  let data = await payroll.get(headers, {
    organizationId: f.orgA,
    employeeId: id,
  });
  assert.equal(data.selected?.salaryMinor, "20000");
  assert.equal(data.selectedCharge?.amountMinor, "10000");
  const pay = {
    operation: "payment",
    organizationId: f.orgA,
    requestKey: randomUUID(),
    chargeId,
    expectedBalanceMinor: "10000",
    amountMinor: "4000",
    currency: "PKR",
    paidOn: today,
    method: "cash",
    reference: "",
    reason: "Pay first salary installment",
  };
  const paid = await payroll.post(headers, pay);
  assert.equal((await payroll.post(headers, pay)).expenseId, paid.expenseId);
  data = await payroll.get(headers, { organizationId: f.orgA, employeeId: id });
  assert.equal(data.selectedCharge?.balanceMinor, "6000");
  assert.equal(data.payments.length, 1);
  await assert.rejects(
    payroll.post(headers, { ...pay, requestKey: randomUUID() }),
    { code: "CONFLICT" },
  );
  const races = await Promise.allSettled(
    [1, 2].map(() =>
      payroll.post(headers, {
        ...pay,
        requestKey: randomUUID(),
        amountMinor: "6000",
        expectedBalanceMinor: "6000",
      }),
    ),
  );
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  data = await payroll.get(headers, { organizationId: f.orgA, employeeId: id });
  assert.equal(data.selectedCharge?.balanceMinor, "0");
  assert.equal(data.paymentTotal, 2);
  await assert.rejects(
    payroll.post(headers, {
      operation: "void",
      organizationId: f.orgA,
      requestKey: randomUUID(),
      chargeId,
      reason: "Cannot void paid salary",
    }),
    { code: "CONFLICT" },
  );
  await expenses.reverse(headers, {
    organizationId: f.orgA,
    expenseId: paid.expenseId,
    requestKey: randomUUID(),
    cashOn: today,
    reason: "Correct mistaken salary entry",
  });
  data = await payroll.get(headers, { organizationId: f.orgA, employeeId: id });
  assert.equal(data.selectedCharge?.balanceMinor, "4000");
  assert.ok(
    data.payments.find((p) => p.expenseId === paid.expenseId)?.reversed,
  );
  const expenseLedger = await expenses.get(headers, { organizationId: f.orgA });
  assert.equal(
    expenseLedger.summary.find((s) => s.currency === "PKR")?.netMinor,
    "6000",
    "Payroll cash counted once through expenses",
  );
  const other = data.payments.find((p) => !p.reversed)!;
  await expenses.reverse(headers, {
    organizationId: f.orgA,
    expenseId: other.expenseId,
    requestKey: randomUUID(),
    cashOn: today,
    reason: "Reverse retained installment",
  });
  await payroll.post(headers, {
    operation: "void",
    organizationId: f.orgA,
    requestKey: randomUUID(),
    chargeId,
    reason: "Replace wrong salary amount",
  });
  const replacement = await payroll.post(headers, {
    ...charge,
    requestKey: randomUUID(),
    amountMinor: "20000",
  });
  assert.notEqual(replacement.chargeId, chargeId);
  await assert.rejects(
    payroll.get(headers, { organizationId: f.orgB, employeeId: id }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    payroll.get(manager, { organizationId: f.orgA, branchId: f.a2 }),
    { code: "NOT_FOUND" },
  );
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      f.orgB,
    ]);
    assert.equal(
      (await db.query("select * from gym.payroll_charges")).rowCount,
      0,
    );
    await db.query("rollback");
    for (const statement of [
      "update gym.payroll_charges set amount_minor=1",
      "delete from gym.payroll_charges",
      "delete from gym.employees",
    ]) {
      await db.query("begin");
      await db.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      await assert.rejects(db.query(statement), { code: "42501" });
      await db.query("rollback");
    }
  } finally {
    db.release();
  }
  await admin.query(
    "create function gym.test_payroll_request_fail() returns trigger language plpgsql as $$ begin raise exception 'Payroll test rollback';end $$",
  );
  await admin.query(
    "create trigger test_payroll_request_fail before insert on gym.payroll_requests for each row execute function gym.test_payroll_request_fail()",
  );
  const before = (
    await admin.query(
      "select count(*)::int n from gym.expenses where organization_id=$1",
      [f.orgA],
    )
  ).rows[0].n;
  await assert.rejects(
    payroll.post(headers, {
      ...pay,
      requestKey: randomUUID(),
      chargeId: replacement.chargeId,
      expectedBalanceMinor: "20000",
    }),
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.expenses where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    before,
    "Failed payroll audit rolls back expense and payment link",
  );
  await admin.query(
    "drop trigger test_payroll_request_fail on gym.payroll_requests",
  );
  await admin.query("drop function gym.test_payroll_request_fail()");
  console.log(
    "PASS payroll employee/version/rate snapshots, monthly uniqueness, partial/full payments, replay/stale/concurrent caps, expense integration counted once, full reversal/reopened balance/void/replacement, branch/tenant/role denial, immutable grants and journal failure rollback.",
  );
} finally {
  await admin.query(
    "drop trigger if exists test_payroll_request_fail on gym.payroll_requests",
  );
  await admin.query("drop function if exists gym.test_payroll_request_fail()");
  await f.cleanup();
  await pool.end();
  await admin.end();
}
