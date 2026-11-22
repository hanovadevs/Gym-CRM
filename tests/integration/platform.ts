import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { bootstrapPlatformAdmin } from "../../src/server/platform/bootstrap";
import { createPlatformService } from "../../src/modules/platform/service";
import { createSecurity } from "../../src/server/security/service";
import { securityFixture } from "../helpers/security-fixture";
import { createMembersService } from "../../src/modules/members/service";
import { createBillingService } from "../../src/modules/billing/service";
import { createPaymentsService } from "../../src/modules/payments/service";
import { createCorrectionsService } from "../../src/modules/billing/corrections";
import { createExpensesService } from "../../src/modules/expenses/service";
import { createAttendanceService } from "../../src/modules/attendance/service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { todayInZone, previousDay } from "../../src/modules/plans/format";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname !== "/gym_test")
    throw Error("Isolated gym_test required");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 3,
});
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = "http://127.0.0.1:3100";
const f = await securityFixture(admin, secret, baseURL);
const auth = configureAuth(pool, {
  secret,
  baseURL,
  sendReset: async () => {
    throw Error("No mail during platform checks");
  },
});
const service = createPlatformService(
  pool,
  (h) => auth.api.getSession({ headers: h }),
  async (db, input) => {
    const setup = configureAuth(db, {
      secret,
      baseURL,
      allowProvisioning: true,
      sendReset: async () => {
        throw Error("No mail during provisioning");
      },
    });
    return { id: (await setup.api.signUpEmail({ body: input })).user.id };
  },
  secret,
);
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);
const email = randomUUID() + "@example.invalid",
  password = randomBytes(20).toString("hex");
let platformUserId: string | undefined;
const createdOrgs: string[] = [],
  createdUsers: string[] = [];
async function login(email: string, password: string) {
  const r = await auth.api.signInEmail({
    body: { email, password },
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
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  const setup = await bootstrapPlatformAdmin(
    admin,
    { name: "Platform QA", email, password },
    { secret, baseURL },
  );
  platformUserId = setup.userId;
  assert.equal(setup.created, true);
  const again = await bootstrapPlatformAdmin(
    admin,
    {
      name: "Ignored duplicate",
      email,
      password: randomBytes(20).toString("hex"),
    },
    { secret, baseURL },
  );
  assert.equal(again.created, false);
  const headers = await login(email, password),
    owner = await login(f.users["Owner A"].email, f.users["Owner A"].password);
  await assert.rejects(
    bootstrapPlatformAdmin(
      admin,
      { name: "No elevation", email: f.users["Owner A"].email, password },
      { secret, baseURL },
    ),
    /explicit grant review/,
  );
  await deny(() => service.get(new Headers(), {}), "UNAUTHENTICATED");
  await deny(() => service.get(owner, {}), "FORBIDDEN");
  await deny(
    () => service.analytics(new Headers(), { organizationId: f.orgA }),
    "UNAUTHENTICATED",
  );
  await deny(
    () => service.analytics(owner, { organizationId: f.orgA }),
    "FORBIDDEN",
  );
  const emptyAnalytics = await service.analytics(headers, {
    organizationId: f.orgA,
  });
  assert.equal(emptyAnalytics.members.total, 0);
  assert.deepEqual(emptyAnalytics.finances, []);
  await deny(
    () => service.analytics(headers, { organizationId: randomUUID() }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      service.analytics(headers, { organizationId: f.orgA, branchId: f.b1 }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      service.analytics(headers, {
        organizationId: f.orgA,
        from: "2020-01-01",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      service.analytics(headers, {
        organizationId: f.orgA,
        from: "2026-02-30",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      service.analytics(headers, { organizationId: f.orgA, extra: "invalid" }),
    "VALIDATION_ERROR",
  );
  assert.equal(await service.available(owner), false);
  const unsafePool = new pg.Pool({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  });
  try {
    const unsafe = createPlatformService(
      unsafePool,
      (h) => auth.api.getSession({ headers: h }),
      async () => {
        throw Error("Forbidden");
      },
      secret,
    );
    await assert.rejects(
      unsafe.get(headers, {}),
      /Unsafe database runtime role/,
    );
  } finally {
    await unsafePool.end();
  }
  const payload = {
    operation: "create",
    name: "Platform created gym",
    slug: "qa-" + randomUUID(),
    ownerName: "New gym owner",
    ownerEmail: randomUUID() + "@example.invalid",
    password: randomBytes(20).toString("hex"),
    email: "gym-contact@example.invalid",
    phone: "03001234567",
    address: "Isolated test gym address",
    reason: "Authorized isolated gym setup",
    requestKey: randomUUID(),
  };
  const [created, replay] = await Promise.all([
    service.save(headers, payload),
    service.save(headers, payload),
  ]);
  assert.equal(created.organizationId, replay.organizationId);
  createdOrgs.push(created.organizationId);
  const user = (
    await admin.query('select id from app_auth."user" where email=$1', [
      payload.ownerEmail,
    ])
  ).rows[0];
  createdUsers.push(user.id);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from platform.events where organization_id=$1",
        [created.organizationId],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.branches where organization_id=$1",
        [created.organizationId],
      )
    ).rows[0].n,
    1,
  );
  await deny(
    () => service.save(headers, { ...payload, name: "Changed replay" }),
    "CONFLICT",
  );
  const data = await service.get(headers, {
    search: payload.name,
    organizationId: created.organizationId,
  });
  assert.equal(data.total, 1);
  assert.equal(data.gyms[0].staff, 1);
  assert.equal(data.gyms[0].email, payload.email);
  assert.equal(data.gyms[0].phone, payload.phone);
  assert.equal(data.gyms[0].address, payload.address);
  assert.ok(data.events.some((e) => e.action === "gym.created"));
  assert.ok(!JSON.stringify(data).includes(payload.password));
  const freshOwner = await login(payload.ownerEmail, payload.password);
  assert.equal(
    (await security.workspace(freshOwner, {})).organization.id,
    created.organizationId,
  );
  await deny(
    () => security.workspace(freshOwner, { organizationId: f.orgA }),
    "NOT_FOUND",
  );
  await deny(() => service.get(freshOwner, {}), "FORBIDDEN");
  const failedEmail = randomUUID() + "@example.invalid";
  await deny(
    () =>
      service.save(headers, {
        ...payload,
        ownerEmail: failedEmail,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  assert.equal(
    (
      await admin.query(
        'select count(*)::int n from app_auth."user" where email=$1',
        [failedEmail],
      )
    ).rows[0].n,
    0,
    "Unique-slug failure must roll back the new auth account",
  );
  // Reconcile independent persisted source workflows, including an old expense
  // reversed today and currencies which must never be combined.
  const today = todayInZone("Asia/Karachi"),
    yesterday = previousDay(today),
    org = { organizationId: f.orgA };
  const members = createMembersService(security),
    billing = createBillingService(security),
    payments = createPaymentsService(security),
    expenses = createExpensesService(security);
  const m = await members.create(owner, {
    ...org,
    name: "Analytics member",
    email: randomUUID() + "@example.invalid",
    phone: "",
    homeBranchId: f.a1,
    joinedOn: today,
    registrationKey: randomUUID(),
  });
  await members.create(owner, {
    ...org,
    name: "Other branch member",
    email: randomUUID() + "@example.invalid",
    phone: "",
    homeBranchId: f.a2,
    joinedOn: today,
    registrationKey: randomUUID(),
  });
  const invoice = await billing.create(owner, {
    ...org,
    memberId: m.member.id,
    values: {
      description: "Analytics charge",
      currency: "PKR",
      dueOn: today,
      lines: [
        {
          description: "Coaching",
          quantity: 1,
          unitMinor: 10000,
          discountMinor: 0,
        },
      ],
    },
    requestKey: randomUUID(),
    reason: "Analytics source reconciliation",
  });
  await billing.change(owner, invoice.invoiceId, {
    ...org,
    operation: "issue",
    version: 1,
    requestKey: randomUUID(),
    reason: "Issue agreed charge",
  });
  const paid = await payments.record(owner, {
    ...org,
    invoiceId: invoice.invoiceId,
    amountMinor: "4000",
    expectedBalanceMinor: "10000",
    currency: "PKR",
    method: "cash",
    paidOn: today,
    reference: "",
    note: "",
    requestKey: randomUUID(),
  });
  await createCorrectionsService(security).record(owner, {
    ...org,
    invoiceId: invoice.invoiceId,
    paymentId: paid.paymentId,
    kind: "refund",
    amountMinor: "1000",
    expectedBalanceMinor: "6000",
    currency: "PKR",
    method: "cash",
    cashOn: today,
    reference: "Analytics refund",
    reason: "Approved refund reconciliation",
    requestKey: randomUUID(),
  });
  const categoryId = randomUUID();
  await expenses.category(owner, {
    ...org,
    id: categoryId,
    operation: "create",
    name: "Analytics operations",
    reason: "Source expense reconciliation",
  });
  const expense = {
    ...org,
    branchId: f.a1,
    categoryId,
    description: "Retained service expense",
    payee: "Service vendor",
    amountMinor: "2000",
    currency: "PKR",
    paidOn: yesterday,
    method: "cash",
    reference: "",
    requestKey: randomUUID(),
  };
  const oldExpense = await expenses.post(owner, expense);
  await expenses.reverse(owner, {
    ...org,
    expenseId: oldExpense.expenseId,
    cashOn: today,
    reason: "Correct service posting",
    requestKey: randomUUID(),
  });
  await expenses.post(owner, {
    ...expense,
    amountMinor: "1000",
    paidOn: today,
    requestKey: randomUUID(),
    replacesExpenseId: oldExpense.expenseId,
  });
  await admin.query("update gym.organizations set currency='USD' where id=$1", [
    f.orgA,
  ]);
  await expenses.post(owner, {
    ...expense,
    amountMinor: "500",
    paidOn: today,
    currency: "USD",
    requestKey: randomUUID(),
  });
  await admin.query("update gym.organizations set currency='PKR' where id=$1", [
    f.orgA,
  ]);
  await createAttendanceService(security).record(owner, {
    ...org,
    branchId: f.a1,
    memberId: m.member.id,
    operation: "check_in",
    overrideReason: "Approved single-visit analytics fixture",
    requestKey: randomUUID(),
  });
  const freePlan = await createPlansService(security).create(owner, {
    ...org,
    branchId: f.a1,
    code: "ANALYTICS-FREE",
    values: {
      name: "Seven day access",
      amountMinor: 0,
      currency: "PKR",
      durationCount: 7,
      durationUnit: "days",
      accessMode: "home_branch",
      gymFloor: true,
      classes: false,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Current membership analytics source",
  });
  await createMembershipsService(security).enroll(owner, m.member.id, {
    ...org,
    mode: "enroll",
    memberVersion: (await admin.query('select version from gym.members where id=$1',[m.member.id])).rows[0].version,
    planVersionId: freePlan.versionId,
    startOn: today,
    requestKey: randomUUID(),
    reason: "Analytics effective term check",
  });
  const analytics = await service.analytics(headers, {
    ...org,
    from: today,
    to: today,
  });
  assert.equal(analytics.members.total, 2);
  assert.equal(analytics.members.newRegistrations, 2);
  assert.equal(analytics.members.currentTerms, 1);
  assert.equal(analytics.members.renewals, 1);
  assert.equal(analytics.attendance.visits, 1);
  assert.equal(analytics.attendance.inside, 1);
  assert.equal(analytics.attendance.uniqueVisitors, 1);
  assert.equal(analytics.attendance.averageSeconds, null);
  assert.equal(analytics.daily.length, 1);
  assert.equal(analytics.daily[0].registrations, 2);
  assert.equal(analytics.daily[0].visits, 1);
  assert.deepEqual(
    analytics.finances.find((f) => f.currency === "PKR"),
    {
      currency: "PKR",
      receivedMinor: "4000",
      refundedMinor: "1000",
      netCollectedMinor: "3000",
      postedExpenseMinor: "1000",
      reversedExpenseMinor: "2000",
      netExpenseMinor: "-1000",
      netCashMinor: "4000",
      outstandingMinor: "7000",
      overdueMinor: "0",
      invoicedMinor: "10000",
    },
  );
  assert.equal(
    analytics.finances.find((f) => f.currency === "USD")!.netCashMinor,
    "-500",
  );
  assert.equal(
    (
      await service.analytics(headers, { ...org, from: yesterday, to: today })
    ).finances.find((f) => f.currency === "PKR")!.netExpenseMinor,
    "1000",
  );
  const otherBranch = await service.analytics(headers, {
    ...org,
    branchId: f.a2,
  });
  assert.equal(otherBranch.members.total, 1);
  assert.equal(otherBranch.attendance.visits, 0);
  assert.deepEqual(otherBranch.finances, []);
  assert.equal(
    (await service.analytics(headers, { organizationId: f.orgB })).members
      .total,
    0,
  );
  assert.ok(!JSON.stringify(analytics).includes(m.member.name));
  const update = {
    operation: "update",
    organizationId: f.orgA,
    name: "Suspension QA",
    active: false,
    version: 1,
    reason: "Testing platform suspension",
    requestKey: randomUUID(),
  };
  const suspended = await service.save(headers, update);
  assert.equal(suspended.version, 2);
  assert.equal(
    (await service.analytics(headers, org)).organization.active,
    false,
  );
  assert.equal((await service.analytics(headers, org)).members.total, 2);
  await deny(
    () => security.workspace(owner, { organizationId: f.orgA }),
    "NOT_FOUND",
  );
  await deny(
    () => service.save(headers, { ...update, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await service.save(headers, {
    ...update,
    name: "Scope Gym A",
    active: true,
    version: 2,
    requestKey: randomUUID(),
  });
  assert.equal(
    (await security.workspace(owner, { organizationId: f.orgA })).organization
      .id,
    f.orgA,
  );
  const auditText = JSON.stringify(
    (
      await admin.query(
        'select "after" from platform.events where actor_user_id=$1',
        [platformUserId],
      )
    ).rows,
  );
  assert.ok(!auditText.includes(payload.password));
  assert.ok(!auditText.includes(payload.ownerEmail));
  await admin.query(
    "update platform.administrators set active=false where user_id=$1",
    [platformUserId],
  );
  await deny(() => service.get(headers, {}), "FORBIDDEN");
  await deny(() => service.analytics(headers, org), "FORBIDDEN");
  await deny(() => service.save(headers, payload), "FORBIDDEN");
  await admin.query(
    "update platform.administrators set active=true where user_id=$1",
    [platformUserId],
  );
  const c = await pool.connect();
  try {
    assert.equal(
      (await c.query("select count(*)::int n from platform.events")).rows[0].n,
      0,
      "Platform context must clear after pooled operation",
    );
    assert.equal(
      (await c.query("select count(*)::int n from gym.members")).rows[0].n,
      0,
      "Analytics tenant context must clear after transaction",
    );
    await assert.rejects(
      c.query("select * from platform.administrators"),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "42501",
    );
    await assert.rejects(
      c.query(
        "insert into platform.administrators(user_id,reason) values($1,'No self elevation')",
        [f.users["Owner A"].id],
      ),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "42501",
    );
    const grants = (
      await c.query(
        "select has_table_privilege(current_user,'platform.events','UPDATE') or has_table_privilege(current_user,'platform.events','DELETE') writable",
      )
    ).rows[0];
    assert.equal(grants.writable, false);
  } finally {
    c.release();
  }
  const functions = (
    await admin.query(
      "select p.prosecdef,p.proconfig,has_function_privilege('public',p.oid,'EXECUTE') public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='platform'",
    )
  ).rows;
  assert.equal(functions.length, 3);
  assert.ok(
    functions.every(
      (r) =>
        r.prosecdef &&
        r.proconfig.includes("search_path=pg_catalog, pg_temp") &&
        !r.public_execute,
    ),
  );
  console.log(
    "PASS platform explicit grants, maintained-auth bootstrap, no owner elevation, atomic gym/owner/branch provisioning, concurrent replay, rollback, suspension/reactivation, activity filtering, current grant revocation and restricted runtime ACL/RLS.",
  );
} finally {
  await admin.query(
    "delete from platform.events where organization_id=any($1::uuid[])",
    [[f.orgA, f.orgB, ...createdOrgs]],
  );
  for (const id of createdOrgs) {
    for (const table of [
      "audit_events",
      "staff_branch_grants",
      "staff_memberships",
      "branches",
    ])
      await admin.query(`delete from gym.${table} where organization_id=$1`, [
        id,
      ]);
    await admin.query("delete from gym.organizations where id=$1", [id]);
  }
  if (platformUserId) {
    await admin.query("delete from platform.administrators where user_id=$1", [
      platformUserId,
    ]);
    createdUsers.push(platformUserId);
  }
  await f.cleanup();
  await admin.query('delete from app_auth."user" where id=any($1::text[])', [
    createdUsers,
  ]);
  await pool.end();
  await admin.end();
}
