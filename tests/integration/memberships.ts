import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createProfileService } from "../../src/modules/members/profile-service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { createSettingsService } from "../../src/modules/settings/service";
import { endOn } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[k]!).pathname !== "/gym_test")
    throw new Error("Isolated gym_test required");
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 4,
  });
await admin.connect();
const f = await securityFixture(
  admin,
  process.env.BETTER_AUTH_SECRET!,
  process.env.APP_URL!,
);
const auth = configureAuth(pool, {
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.APP_URL!,
    sendReset: async () => {},
  }),
  security = createSecurity(pool, (h) => auth.api.getSession({ headers: h })),
  members = createMembersService(security),
  profiles = createProfileService(security),
  plans = createPlansService(security),
  subs = createMembershipsService(security),
  settings = createSettingsService(security, async () => {
    throw new Error("No provisioning in this suite");
  }),
  headers: Record<string, Headers> = {};
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    headers[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join(";"),
    });
  }
  const owner = headers["Owner A"],
    reception = headers["Reception A"],
    manager = headers["Shared Staff"],
    org = { organizationId: f.orgA };
  const initialContext = await security.workspace(owner, org),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: initialContext.organization.timeZone,
    }).format(new Date());
  const values = {
    name: "Monthly strength",
    amountMinor: 450000,
    currency: "PKR",
    durationCount: 1,
    durationUnit: "months",
    accessMode: "home_branch",
    gymFloor: true,
    classes: false,
    personalTraining: false,
  };
  const plan = await plans.create(owner, {
    ...org,
    branchId: f.a1,
    code: "SUB-MONTHLY",
    values,
    requestKey: randomUUID(),
    reason: "Membership suite plan",
  });
  const create = async (
    name: string,
    branch = f.a1,
    h = owner,
    organizationId = f.orgA,
  ) =>
    (
      await members.create(h, {
        organizationId,
        name,
        email: randomUUID() + "@example.invalid",
        phone: "",
        homeBranchId: branch,
        joinedOn: today,
        registrationKey: randomUUID(),
      })
    ).member;
  const member = await create("Lifecycle member");
  const context = (id = member.id, h = owner, organizationId = f.orgA) =>
    subs.get(h, id, { organizationId });
  let c = await context();
  assert.equal(c.total, 0);
  assert.equal(c.plans[0].id, plan.versionId);
  assert.equal(
    (await subs.get(owner, member.id, { ...org, planQuery: "MONTHLY" }))
      .planCount,
    1,
  );
  assert.equal(
    (await subs.get(owner, member.id, { ...org, planQuery: "%" })).planCount,
    0,
  );
  const payload = {
    ...org,
    memberVersion: c.memberVersion,
    mode: "enroll",
    planVersionId: String(plan.versionId),
    startOn: c.today,
    requestKey: randomUUID(),
    reason: "Enroll after exact review",
  };
  const {
    requestKey: unusedKey,
    reason: unusedReason,
    ...previewPayload
  } = payload;
  void unusedKey;
  void unusedReason;
  const preview = await subs.preview(owner, member.id, previewPayload);
  assert.equal(preview.endOn, endOn(c.today, 1, "months"));
  assert.equal(preview.activation, "pending");
  assert.equal(
    (
      await admin.query("select id from gym.invoices where member_id=$1", [
        member.id,
      ])
    ).rowCount,
    0,
  );
  const enrolled = await subs.enroll(reception, member.id, payload);
  c = await context();
  let m = c.memberships[0];
  const originalInvoice = JSON.stringify(m.invoice);
  assert.equal(m.lifecycle, "pending");
  assert.equal(m.amountMinor, 450000);
  assert.equal(c.eligibility.reason, "pending_activation");
  assert.equal(
    (await profiles.get(owner, member.id, org)).eligibility.reason,
    "pending_activation",
  );
  assert.equal(
    (await subs.enroll(reception, member.id, payload)).membershipId,
    enrolled.membershipId,
  );
  await deny(
    () =>
      subs.enroll(reception, member.id, {
        ...payload,
        reason: "Changed key details",
      }),
    "CONFLICT",
  );
  async function change(
    operation: string,
    extra: Record<string, unknown> = {},
    id = member.id,
    membershipId = String(enrolled.membershipId),
    h = owner,
    key = randomUUID(),
  ) {
    const d = await context(id, h),
      row = d.memberships.find((r) => r.id === membershipId)!;
    return subs.change(h, id, {
      ...org,
      memberVersion: d.memberVersion,
      membershipId,
      version: row.version,
      requestKey: key,
      reason: "Reasoned " + operation,
      operation,
      ...extra,
    });
  }
  await deny(
    () => change("activate", {}, member.id, m.id, reception),
    "FORBIDDEN",
  );
  await change("activate");
  c = await context();
  m = c.memberships[0];
  assert.equal(m.lifecycle, "active");
  assert.equal(c.eligibility.allowed, true);
  assert.equal(JSON.stringify(m.invoice), originalInvoice);
  const freezePayload = {
    ...org,
    operation: "freeze",
    membershipId: m.id,
    memberVersion: c.memberVersion,
    version: m.version,
    startOn: c.today,
    endOn: endOn(c.today, 2, "days"),
    requestKey: randomUUID(),
    reason: "Prospective two-day break",
  };
  const frozen = await subs.change(manager, member.id, freezePayload);
  assert.equal(
    (await subs.change(manager, member.id, freezePayload)).freezeId,
    frozen.freezeId,
  );
  c = await context();
  assert.equal(c.memberships[0].endOn, endOn(preview.endOn, 2, "days"));
  assert.equal(c.eligibility.reason, "frozen");
  assert.equal(c.memberships[0].freezes.length, 1);
  await deny(
    () =>
      change("freeze", { startOn: c.today, endOn: endOn(c.today, 1, "days") }),
    "CONFLICT",
  );
  await change("reverse_freeze", { freezeId: frozen.freezeId });
  c = await context();
  assert.equal(c.memberships[0].endOn, preview.endOn);
  assert.ok(c.memberships[0].freezes[0].reversedAt);
  assert.equal(c.eligibility.allowed, true);
  const beforePlan = (await plans.history(owner, String(plan.id), org)).plan;
  const newer = await plans.publish(owner, {
    ...org,
    id: plan.id,
    revision: beforePlan.revision,
    values: { ...values, name: "Updated strength", amountMinor: 550000 },
    requestKey: randomUUID(),
    reason: "New rate for renewals",
  });
  c = await context();
  const renewal = {
    ...org,
    memberVersion: c.memberVersion,
    mode: "renew",
    planVersionId: String(newer.versionId),
    requestKey: randomUUID(),
    reason: "Reserve next calendar term",
  };
  const renew = await subs.enroll(reception, member.id, renewal);
  c = await context();
  assert.equal(c.total, 2);
  const next = c.memberships.find((r) => r.id === renew.membershipId)!;
  assert.equal(next.startOn, preview.endOn);
  assert.equal(next.amountMinor, 550000);
  m = c.memberships.find((r) => r.id === enrolled.membershipId)!;
  assert.equal(m.snapshot.name, "Monthly strength");
  assert.equal(m.amountMinor, 450000);
  assert.equal(JSON.stringify(m.invoice), originalInvoice);
  await deny(
    () =>
      change("freeze", { startOn: c.today, endOn: endOn(c.today, 1, "days") }),
    "CONFLICT",
  );
  const moved = {
    ...org,
    id: member.id,
    version: c.memberVersion,
    name: member.name,
    phone: member.phone,
    email: member.email,
    homeBranchId: f.a2,
    joinedOn: member.joinedOn,
    reason: "Membership branch move test",
  };
  await deny(() => members.update(owner, moved), "CONFLICT");
  await change("cancel", { effectiveOn: c.today });
  c = await context();
  m = c.memberships.find((r) => r.id === enrolled.membershipId)!;
  assert.equal(m.lifecycle, "cancelled");
  assert.equal(m.cancelledEffectiveOn, c.today);
  assert.equal(JSON.stringify(m.invoice), originalInvoice);
  const archivedMember = await create("Archived enrollment");
  let a = await context(archivedMember.id);
  await profiles.archive(owner, {
    ...org,
    id: archivedMember.id,
    version: a.memberVersion,
    archived: true,
    reason: "Archived before enrollment",
  });
  a = await context(archivedMember.id);
  assert.equal(a.eligibility.reason, "archived");
  await deny(
    () =>
      subs.enroll(owner, archivedMember.id, {
        ...renewal,
        mode: "enroll",
        memberVersion: a.memberVersion,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  const raceMember = await create("Concurrent renewals");
  let raceContext = await context(raceMember.id);
  const initial = {
    ...payload,
    planVersionId: String(newer.versionId),
    memberVersion: raceContext.memberVersion,
    requestKey: randomUUID(),
  };
  const simultaneous = await Promise.all([
    subs.enroll(owner, raceMember.id, initial),
    subs.enroll(owner, raceMember.id, initial),
  ]);
  assert.equal(simultaneous[0].membershipId, simultaneous[1].membershipId);
  raceContext = await context(raceMember.id);
  const r1 = {
      ...renewal,
      memberVersion: raceContext.memberVersion,
      requestKey: randomUUID(),
    },
    r2 = {
      ...renewal,
      memberVersion: raceContext.memberVersion,
      requestKey: randomUUID(),
    };
  const results = await Promise.allSettled([
    subs.enroll(owner, raceMember.id, r1),
    subs.enroll(owner, raceMember.id, r2),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await context(raceMember.id)).total, 2);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.invoices where member_id=$1",
        [raceMember.id],
      )
    ).rows[0].n,
    2,
  );
  const rollback = await create("Rollback enrollment"),
    rb = await context(rollback.id),
    rbPayload = {
      ...initial,
      memberVersion: rb.memberVersion,
      requestKey: randomUUID(),
    };
  const counterBefore = (
    await admin.query(
      "select value::text n from gym.number_counters where organization_id=$1 and kind='invoice'",
      [f.orgA],
    )
  ).rows[0].n;
  for (const table of ["gym.audit_events", "gym.invoices"]) {
    await admin.query(`revoke insert on ${table} from gym_runtime`);
    try {
      await assert.rejects(() => subs.enroll(owner, rollback.id, rbPayload));
    } finally {
      await admin.query(`grant insert on ${table} to gym_runtime`);
    }
  }
  assert.equal((await context(rollback.id)).total, 0);
  assert.equal((await context(rollback.id)).memberVersion, rb.memberVersion);
  assert.equal(
    (
      await admin.query(
        "select value::text n from gym.number_counters where organization_id=$1 and kind='invoice'",
        [f.orgA],
      )
    ).rows[0].n,
    counterBefore,
  );
  assert.equal(
    (
      await admin.query(
        "select id from gym.membership_requests where member_id=$1",
        [rollback.id],
      )
    ).rowCount,
    0,
  );
  let leapYear = Number(today.slice(0, 4)) + 1;
  while (leapYear % 4 !== 0 || (leapYear % 100 === 0 && leapYear % 400 !== 0))
    leapYear++;
  const leapMember = await create("Leap term"),
    lc = await context(leapMember.id),
    leapStart = `${leapYear}-01-31`;
  await subs.enroll(owner, leapMember.id, {
    ...initial,
    memberVersion: lc.memberVersion,
    startOn: leapStart,
    requestKey: randomUUID(),
  });
  assert.equal(
    (await context(leapMember.id)).memberships[0].endOn,
    `${leapYear}-02-29`,
  );
  const fixedPlan = await plans.create(owner, {
      ...org,
      branchId: f.a1,
      code: "FIXED-FREE",
      values: {
        ...values,
        amountMinor: 0,
        durationUnit: "days",
        durationCount: 30,
      },
      requestKey: randomUUID(),
      reason: "Fixed-day free plan",
    }),
    fixedMember = await create("Fixed term"),
    fc = await context(fixedMember.id);
  await subs.enroll(owner, fixedMember.id, {
    ...initial,
    memberVersion: fc.memberVersion,
    planVersionId: String(fixedPlan.versionId),
    startOn: leapStart,
    requestKey: randomUUID(),
  });
  const fixedContext = await context(fixedMember.id);
  assert.equal(fixedContext.memberships[0].endOn, endOn(leapStart, 30, "days"));
  assert.equal(fixedContext.memberships[0].lifecycle, "active");
  assert.equal(fixedContext.memberships[0].invoice.totalMinor, 0);
  let sv = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: sv.version,
    changes: { paidActivation: false, debtBlocksAccess: false, graceDays: 3 },
    reason: "Verify saved access policy consumers",
  });
  const policy = await create("Policy consumer"),
    pc = await context(policy.id);
  const policyCreated = await subs.enroll(owner, policy.id, {
    ...initial,
    memberVersion: pc.memberVersion,
    requestKey: randomUUID(),
  });
  let policyContext = await context(policy.id);
  assert.equal(policyContext.memberships[0].lifecycle, "active");
  assert.equal(policyContext.eligibility.allowed, true);
  const graceMember = await create("Grace fixture"),
    gc = await context(graceMember.id);
  await subs.enroll(owner, graceMember.id, {
    ...initial,
    memberVersion: gc.memberVersion,
    requestKey: randomUUID(),
  });
  // Guarded historical fixture only: normal enrollment intentionally rejects backdating.
  await admin.query(
    "update gym.memberships set start_on=$2::date-31,original_end_on_exclusive=$2::date-1,end_on_exclusive=$2::date-1 where organization_id=$1 and member_id=$3",
    [f.orgA, today, graceMember.id],
  );
  assert.equal((await context(graceMember.id)).eligibility.reason, "grace");
  sv = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: sv.version,
    changes: { debtBlocksAccess: true },
    reason: "Enable due-debt blocking",
  });
  assert.equal((await context(policy.id)).eligibility.reason, "debt_blocked");
  sv = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: sv.version,
    changes: { debtBlocksAccess: false },
    reason: "Continue lifecycle checks",
  });
  const policyMembership = policyContext.memberships[0];
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  try {
    await assert.rejects(() =>
      change(
        "freeze",
        { startOn: pc.today, endOn: endOn(pc.today, 1, "days") },
        policy.id,
        policyMembership.id,
      ),
    );
    await assert.rejects(() =>
      change(
        "cancel",
        { effectiveOn: pc.today },
        policy.id,
        policyMembership.id,
      ),
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  policyContext = await context(policy.id);
  assert.equal(policyContext.memberships[0].version, policyMembership.version);
  assert.equal(policyContext.memberships[0].freezes.length, 0);
  assert.equal(policyContext.memberships[0].cancelledEffectiveOn, null);
  const rawMember = await create("Direct database overlap");
  const malformedMember=await create('Snapshot constraint');
  await assert.rejects(()=>admin.query(`insert into gym.memberships(organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,lifecycle,activated_at,created_by) select organization_id,$2,home_branch_id,plan_version_id,jsonb_build_object('planVersionId',plan_version_id,'amountMinor',amount_minor,'currency',currency),amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,'active',now(),created_by from gym.memberships where id=$1`,[policyCreated.membershipId,malformedMember.id]),(e:unknown)=>!!e&&typeof e==='object'&&'constraint'in e&&e.constraint==='membership_snapshot_shape');
  const rawSQL = `insert into gym.memberships(organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,lifecycle,activated_at,created_by) select organization_id,$2,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,'active',now(),created_by from gym.memberships where id=$1 returning id`;
  const rawRace = await Promise.allSettled([
    security.run(owner, org, "memberships.manage", (db) =>
      db.query(rawSQL, [policyCreated.membershipId, rawMember.id]),
    ),
    security.run(owner, org, "memberships.manage", (db) =>
      db.query(rawSQL, [policyCreated.membershipId, rawMember.id]),
    ),
  ]);
  assert.equal(rawRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(
    rawRace.some((r) => r.status === "rejected" && r.reason.code === "23514"),
  );
  for (const sql of [
    "update gym.invoices set total_minor=0 where member_id=$1",
    "delete from gym.invoices where member_id=$1",
    "update gym.memberships set snapshot='{}' where member_id=$1",
    "delete from gym.memberships where member_id=$1",
  ])
    await assert.rejects(
      () =>
        security.run(owner, org, "memberships.manage", (db) =>
          db.query(sql, [member.id]),
        ),
      (e: unknown) =>
        !!e && typeof e === "object" && "code" in e && e.code === (sql.startsWith("update gym.invoices") ? "23514" : "42501"),
    );
  assert.equal(
    (await pool.query("select count(*)::int n from gym.invoices")).rows[0].n,
    0,
  );
  const north = await create("North only", f.a2);
  await deny(() => context(north.id, manager), "NOT_FOUND");
  await deny(() => context(member.id, headers["Owner B"], f.orgB), "NOT_FOUND");
  const otherPlan = await plans.create(headers["Owner B"], {
    organizationId: f.orgB,
    branchId: f.b1,
    code: "SUB-MONTHLY",
    values,
    requestKey: randomUUID(),
    reason: "Second gym plan",
  });
  const otherMember = await create(
      "Other gym member",
      f.b1,
      headers["Owner B"],
      f.orgB,
    ),
    oc = await context(otherMember.id, headers["Owner B"], f.orgB);
  await subs.enroll(headers["Owner B"], otherMember.id, {
    ...payload,
    organizationId: f.orgB,
    memberVersion: oc.memberVersion,
    planVersionId: String(otherPlan.versionId),
    requestKey: randomUUID(),
  });
  await security.run(owner, org, "memberships.manage", async (db) =>
    assert.equal(
      (
        await db.query("select id from gym.invoices where member_id=$1", [
          otherMember.id,
        ])
      ).rowCount,
      0,
    ),
  );
  const pages = await create("History pages");
  let pgc = await context(pages.id);
  for (let i = 0; i < 21; i++) {
    await subs.enroll(owner, pages.id, {
      ...initial,
      mode: i ? "renew" : "enroll",
      startOn: undefined,
      memberVersion: pgc.memberVersion,
      requestKey: randomUUID(),
    });
    pgc = await context(pages.id);
  }
  assert.equal(pgc.total, 21);
  assert.equal(pgc.memberships.length, 20);
  const second = await subs.get(owner, pages.id, { ...org, page: 999 });
  assert.equal(second.page, 2);
  assert.equal(second.memberships.length, 1);
  assert.ok(!pgc.memberships.some((r) => r.id === second.memberships[0].id));
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => context(member.id, reception), "FORBIDDEN");
  console.log(
    "PASS: persisted membership/invoice snapshots, exact preview and policy consumers; role/branch/tenant/RLS and immutable ledger; replay/concurrent renewal/database overlap; freeze/reversal/cancellation invariants; charge/counter/audit rollback; historical paging. No external emails or real GYM fixtures.",
  );
} finally {
  await admin.query(
    "grant insert on gym.audit_events,gym.invoices to gym_runtime",
  );
  await f.cleanup();
  await admin.end();
  await pool.end();
}
