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
import { createPaymentsService } from "../../src/modules/payments/service";
import { createCorrectionsService } from "../../src/modules/billing/corrections";
import { createSettingsService } from "../../src/modules/settings/service";
import { createAttendanceService } from "../../src/modules/attendance/service";
import { todayInZone } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname !== "/gym_test")
    throw Error("Isolated gym_test required");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = "http://127.0.0.1:3100",
  today = todayInZone("Asia/Karachi");
const shift = (days: number) =>
  new Date(Date.parse(today + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const f = await securityFixture(admin, secret, baseURL);
const auth = configureAuth(pool, {
  secret,
  baseURL,
  sendReset: async () => {
    throw Error("No email during attendance verification");
  },
});
const security = createSecurity(pool, (h) =>
  auth.api.getSession({ headers: h }),
);
const members = createMembersService(security),
  profiles = createProfileService(security),
  plans = createPlansService(security),
  subs = createMembershipsService(security),
  payments = createPaymentsService(security),
  corrections = createCorrectionsService(security),
  attendance = createAttendanceService(security),
  settings = createSettingsService(security, async () => {
    throw Error("No provisioning in attendance checks");
  });
const deny = (action: () => Promise<unknown>, code: string) =>
  assert.rejects(
    action,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
const headers: Record<string, Headers> = {};
try {
  for (const [name, user] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: user.email, password: user.password },
      asResponse: true,
    });
    assert.equal(r.status, 200);
    headers[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";"),
    });
  }
  const owner = headers["Owner A"],
    reception = headers["Reception A"],
    foreign = headers["Owner B"],
    org = { organizationId: f.orgA };
  const createPlan = async (
    code: string,
    branch = f.a1,
    all = false,
    amount = 0,
  ) =>
    plans.create(owner, {
      ...org,
      branchId: branch,
      code,
      values: {
        name: code,
        amountMinor: amount,
        currency: "PKR",
        durationCount: 30,
        durationUnit: "days",
        accessMode: all ? "all_branches" : "home_branch",
        gymFloor: true,
        classes: true,
        personalTraining: false,
      },
      requestKey: randomUUID(),
      reason: "Attendance acceptance plan",
    });
  const homePlan = await createPlan("ATT-HOME"),
    allPlan = await createPlan("ATT-ALL", f.a1, true),
    northPlan = await createPlan("ATT-NORTH", f.a2, true),
    paidPlan = await createPlan("ATT-PAID", f.a1, false, 10000);
  async function member(name: string, branch = f.a1) {
    return (
      await members.create(owner, {
        ...org,
        name,
        email: randomUUID() + "@example.invalid",
        phone: "",
        homeBranchId: branch,
        joinedOn: shift(-100),
        registrationKey: randomUUID(),
      })
    ).member;
  }
  async function enrolled(
    name: string,
    plan = homePlan,
    startOn = today,
    branch = f.a1,
  ) {
    const m = await member(name, branch);
    const saved = await subs.enroll(owner, m.id, {
      ...org,
      memberVersion: m.version,
      mode: "enroll",
      planVersionId: plan.versionId,
      startOn,
      requestKey: randomUUID(),
      reason: "Reviewed attendance enrollment",
    });
    return { member: m, membershipId: String(saved.membershipId) };
  }
  const enter = (
    memberId: string,
    branchId = f.a1,
    overrideReason = "",
    requestKey = randomUUID(),
  ) => ({
    ...org,
    operation: "check_in",
    memberId,
    branchId,
    overrideReason,
    requestKey,
  });
  const leave = (visitId: string, branchId = f.a1) => ({
    ...org,
    operation: "check_out",
    visitId,
    branchId,
    requestKey: randomUUID(),
  });
  const visitCount = async (id: string) =>
    (
      await admin.query(
        "select count(*)::int n from gym.attendance_visits where member_id=$1",
        [id],
      )
    ).rows[0].n;
  await deny(() => attendance.get(new Headers(), org), "UNAUTHENTICATED");
  await deny(() => attendance.get(foreign, org), "NOT_FOUND");
  await deny(
    () => attendance.get(reception, { ...org, branchId: f.a2 }),
    "NOT_FOUND",
  );
  const plain = await member("No membership");
  await deny(
    () => attendance.record(reception, enter(plain.id)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(plain.id), 0);
  await deny(
    () =>
      attendance.record(
        reception,
        enter(plain.id, f.a1, "No override privilege"),
      ),
    "ACCESS_DENIED",
  );
  const override = await attendance.record(
    owner,
    enter(plain.id, f.a1, "Approved single guest visit"),
  );
  assert.equal(override.state, "checked_in");
  assert.equal(
    (
      await admin.query(
        "select override_reason from gym.attendance_visits where id=$1",
        [override.visitId],
      )
    ).rows[0].override_reason,
    "Approved single guest visit",
  );
  await attendance.record(reception, leave(override.visitId));
  const active = await enrolled("Paid-free active member");
  const firstInput = enter(active.member.id);
  const first = await attendance.record(reception, firstInput);
  assert.equal(first.state, "checked_in");
  assert.equal(
    (await attendance.record(reception, firstInput)).visitId,
    first.visitId,
  );
  await deny(
    () =>
      attendance.record(reception, {
        ...firstInput,
        overrideReason: "Changed same key",
      }),
    "CONFLICT",
  );
  assert.equal(
    (await attendance.record(reception, enter(active.member.id))).state,
    "already_inside",
  );
  assert.equal(await visitCount(active.member.id), 1);
  const profile = await profiles.get(owner, active.member.id, org);
  assert.equal(profile.visits.total, 1);
  assert.equal(profile.visits.rows[0].checkedOutAt, null);
  const beforeClose = (
    await admin.query(
      "select count(*)::int n from gym.audit_events where entity_id=$1 and action='attendance.checked_out'",
      [first.visitId],
    )
  ).rows[0].n;
  const closeInput = leave(first.visitId);
  await attendance.record(reception, closeInput);
  await attendance.record(reception, closeInput);
  await attendance.record(reception, leave(first.visitId));
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.audit_events where entity_id=$1 and action='attendance.checked_out'",
        [first.visitId],
      )
    ).rows[0].n,
    beforeClose + 1,
  );
  const closed = (await profiles.get(owner, active.member.id, org)).visits
    .rows[0];
  assert.ok(closed.checkedOutAt);
  assert.ok(closed.durationSeconds !== null && closed.durationSeconds >= 0);
  const code = await attendance.code(owner, {
    ...org,
    memberId: active.member.id,
  });
  assert.equal(
    (await attendance.code(reception, { ...org, memberId: active.member.id }))
      .payload,
    code.payload,
  );
  const qr = await attendance.lookup(reception, {
    ...org,
    branchId: f.a1,
    q: code.payload,
  });
  assert.equal(qr.candidates.length, 1);
  assert.equal(qr.candidates[0].id, active.member.id);
  assert.ok(!("email" in qr.candidates[0]));
  assert.ok(!("phone" in qr.candidates[0]));
  assert.equal(
    (await attendance.lookup(reception, { ...org, branchId: f.a1, q: "%" }))
      .candidates.length,
    0,
  );
  const race = await enrolled("Across-branch scan race", allPlan);
  const raced = await Promise.all([
    attendance.record(owner, enter(race.member.id, f.a1)),
    attendance.record(owner, enter(race.member.id, f.a2)),
  ]);
  assert.deepEqual(raced.map((r) => r.state).sort(), [
    "already_inside",
    "checked_in",
  ]);
  assert.equal(raced[0].visitId, raced[1].visitId);
  assert.equal(await visitCount(race.member.id), 1);
  const raceBranch = (
    await admin.query(
      "select branch_id from gym.attendance_visits where id=$1",
      [raced[0].visitId],
    )
  ).rows[0].branch_id;
  await attendance.record(owner, leave(raced[0].visitId, raceBranch));
  const crossHome = await enrolled(
    "All-branch visitor",
    northPlan,
    today,
    f.a2,
  );
  const visible = await attendance.lookup(reception, {
    ...org,
    branchId: f.a1,
    q: crossHome.member.memberCode,
  });
  assert.equal(visible.candidates[0].id, crossHome.member.id);
  const admitted = await attendance.record(
    reception,
    enter(crossHome.member.id),
  );
  await attendance.record(reception, leave(admitted.visitId));
  await deny(
    () => profiles.get(reception, crossHome.member.id, org),
    "NOT_FOUND",
  );
  const homeOnly = await enrolled("Wrong branch");
  await deny(
    () => attendance.record(owner, enter(homeOnly.member.id, f.a2)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(homeOnly.member.id), 0);
  const pending = await enrolled("Pending payment", paidPlan);
  await deny(
    () => attendance.record(reception, enter(pending.member.id)),
    "ACCESS_DENIED",
  );
  const invoice = (
    await admin.query("select id from gym.invoices where membership_id=$1", [
      pending.membershipId,
    ])
  ).rows[0].id;
  await payments.record(reception, {
    ...org,
    invoiceId: invoice,
    requestKey: randomUUID(),
    amountMinor: "10000",
    expectedBalanceMinor: "10000",
    currency: "PKR",
    method: "cash",
    paidOn: today,
  });
  const paid = await attendance.record(reception, enter(pending.member.id));
  await attendance.record(reception, leave(paid.visitId));
  const owing = await enrolled("Activated with debt", paidPlan);
  const owingContext = await subs.get(owner, owing.member.id, org);
  await subs.change(owner, owing.member.id, {
    ...org,
    operation: "activate",
    memberVersion: owingContext.memberVersion,
    membershipId: owing.membershipId,
    version: owingContext.memberships[0].version,
    requestKey: randomUUID(),
    reason: "Recorded activation with debt",
  });
  let debtSettings = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: debtSettings.version,
    changes: { debtBlocksAccess: true },
    reason: "Verify saved debt policy at check-in",
  });
  await deny(
    () => attendance.record(reception, enter(owing.member.id)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(owing.member.id), 0);
  const debtInvoice = (
    await admin.query("select id from gym.invoices where membership_id=$1", [
      owing.membershipId,
    ])
  ).rows[0].id;
  const debtPayment = await payments.record(reception, {
    ...org,
    invoiceId: debtInvoice,
    requestKey: randomUUID(),
    amountMinor: "10000",
    expectedBalanceMinor: "10000",
    currency: "PKR",
    method: "cash",
    paidOn: today,
  });
  const debtClear = await attendance.record(reception, enter(owing.member.id));
  await attendance.record(reception, leave(debtClear.visitId));
  await corrections.record(owner, {
    ...org,
    invoiceId: debtInvoice,
    paymentId: debtPayment.paymentId,
    requestKey: randomUUID(),
    kind: "refund",
    amountMinor: "1000",
    expectedBalanceMinor: "0",
    currency: "PKR",
    cashOn: today,
    method: "cash",
    reason: "Refund reopens admission debt",
  });
  await deny(
    () => attendance.record(reception, enter(owing.member.id)),
    "ACCESS_DENIED",
  );
  await corrections.record(owner, {
    ...org,
    invoiceId: debtInvoice,
    requestKey: randomUUID(),
    kind: "credit",
    amountMinor: "1000",
    expectedBalanceMinor: "1000",
    currency: "PKR",
    cashOn: today,
    reason: "Correct the remaining charge",
  });
  const adjusted = await attendance.record(reception, enter(owing.member.id));
  await attendance.record(reception, leave(adjusted.visitId));
  debtSettings = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: debtSettings.version,
    changes: { debtBlocksAccess: false },
    reason: "Restore default debt policy",
  });
  const upcoming = await enrolled("Future membership", homePlan, shift(1));
  await deny(
    () => attendance.record(reception, enter(upcoming.member.id)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(upcoming.member.id), 0);
  const expired = await enrolled("Expired membership", homePlan);
  // Historical gym_test fixture only; the real enrollment service rejects backdating.
  await admin.query(
    "update gym.memberships set start_on=$2::date-31,original_end_on_exclusive=$2::date-1,end_on_exclusive=$2::date-1 where organization_id=$1 and id=$3",
    [f.orgA, today, expired.membershipId],
  );
  await deny(
    () => attendance.record(reception, enter(expired.member.id)),
    "ACCESS_DENIED",
  );
  let currentSettings = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: currentSettings.version,
    changes: { graceDays: 3 },
    reason: "Verify saved grace in attendance",
  });
  const grace = await attendance.record(reception, enter(expired.member.id));
  assert.equal(
    (
      await admin.query(
        "select eligibility_snapshot->>'reason' reason from gym.attendance_visits where id=$1",
        [grace.visitId],
      )
    ).rows[0].reason,
    "grace",
  );
  await attendance.record(reception, leave(grace.visitId));
  currentSettings = await settings.get(owner, org);
  await settings.save(owner, {
    ...org,
    version: currentSettings.version,
    changes: { graceDays: 0 },
    reason: "Restore strict expiry policy",
  });
  const frozen = await enrolled("Frozen membership");
  const c = await subs.get(owner, frozen.member.id, org);
  await subs.change(owner, frozen.member.id, {
    ...org,
    operation: "freeze",
    memberVersion: c.memberVersion,
    membershipId: frozen.membershipId,
    version: c.memberships[0].version,
    startOn: today,
    endOn: shift(2),
    requestKey: randomUUID(),
    reason: "Recorded two-day freeze",
  });
  await deny(
    () => attendance.record(reception, enter(frozen.member.id)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(frozen.member.id), 0);
  const freezeOverride = await attendance.record(
    headers["Shared Staff"],
    enter(frozen.member.id, f.a1, "Approved one-visit frozen-period exception"),
  );
  await attendance.record(reception, leave(freezeOverride.visitId));
  await deny(
    () => attendance.record(reception, enter(frozen.member.id)),
    "ACCESS_DENIED",
  );
  const cancelled = await enrolled("Cancelled membership");
  const cc = await subs.get(owner, cancelled.member.id, org);
  await subs.change(owner, cancelled.member.id, {
    ...org,
    operation: "cancel",
    effectiveOn: today,
    memberVersion: cc.memberVersion,
    membershipId: cancelled.membershipId,
    version: cc.memberships[0].version,
    requestKey: randomUUID(),
    reason: "Cancellation denies actual attendance",
  });
  await deny(
    () => attendance.record(reception, enter(cancelled.member.id)),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(cancelled.member.id), 0);
  const noFloor = await plans.create(owner, {
    ...org,
    branchId: f.a1,
    code: "ATT-CLASSES",
    values: {
      name: "Classes only",
      amountMinor: 0,
      currency: "PKR",
      durationCount: 30,
      durationUnit: "days",
      accessMode: "home_branch",
      gymFloor: false,
      classes: true,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Class-only benefit check",
  });
  const classOnly = await enrolled("No gym floor benefit", noFloor);
  await deny(
    () => attendance.record(reception, enter(classOnly.member.id)),
    "ACCESS_DENIED",
  );
  assert.equal(
    (await profiles.get(owner, classOnly.member.id, org)).eligibility.reason,
    "plan_excludes_access",
  );
  const archived = await enrolled("Archived membership");
  const p = await profiles.get(owner, archived.member.id, org);
  await profiles.archive(owner, {
    ...org,
    id: archived.member.id,
    version: p.member.version,
    archived: true,
    reason: "Verify archival blocks actual visits",
  });
  await deny(
    () =>
      attendance.record(
        owner,
        enter(archived.member.id, f.a1, "Cannot override an archive"),
      ),
    "ACCESS_DENIED",
  );
  assert.equal(await visitCount(archived.member.id), 0);
  const retained = await profiles.get(owner, active.member.id, org);
  await profiles.archive(owner, {
    ...org,
    id: active.member.id,
    version: retained.member.version,
    archived: true,
    reason: "Keep attendance after archive",
  });
  assert.equal(
    (await profiles.get(owner, active.member.id, org)).visits.total,
    1,
  );
  const rollback = await enrolled("Audit rollback");
  const auditInput = enter(rollback.member.id);
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  await assert.rejects(attendance.record(owner, auditInput));
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  assert.equal(await visitCount(rollback.member.id), 0);
  const afterFailure = await attendance.record(owner, auditInput);
  await attendance.record(owner, leave(afterFailure.visitId));
  const branchGuard = await enrolled("Open branch visit");
  const open = await attendance.record(owner, enter(branchGuard.member.id));
  const settingsData = await settings.get(owner, org);
  const branch = settingsData.branches.find((b) => b.id === f.a1)!;
  await deny(
    () =>
      settings.branchSave(owner, {
        ...org,
        id: branch.id,
        name: branch.name,
        code: branch.code,
        active: false,
        version: branch.version,
        reason: "Cannot strand open attendance",
      }),
    "CONFLICT",
  );
  await attendance.record(owner, leave(open.visitId));
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => attendance.get(reception, org), "FORBIDDEN");
  await deny(() => attendance.record(reception, firstInput), "FORBIDDEN");
  await admin.query(
    "update gym.staff_memberships set role='receptionist' where id=$1",
    [f.memberships.reception],
  );
  const boundary = Date.parse(today + "T00:00:00Z") - 5 * 3600000;
  const before = (await attendance.get(owner, { ...org, branchId: f.a1 }))
    .summary.checkIns;
  for (const delta of [-1000, 1000])
    await admin.query(
      "insert into gym.attendance_visits(organization_id,member_id,branch_id,checked_in_by,checked_out_by,checked_in_at,checked_out_at,eligibility_snapshot) values($1,$2,$3,$4,$4,$5,$6,$7::jsonb)",
      [
        f.orgA,
        homeOnly.member.id,
        f.a1,
        f.users["Owner A"].id,
        new Date(boundary + delta),
        new Date(boundary + delta + 500),
        JSON.stringify({ allowed: true, reason: "allowed" }),
      ],
    );
  assert.equal(
    (await attendance.get(owner, { ...org, branchId: f.a1 })).summary.checkIns,
    before + 1,
  );
  const direct = await enrolled("Database duplicate guard", allPlan);
  async function runtime<T>(action: (db: pg.PoolClient) => Promise<T>) {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("select set_config('app.organization_id',$1,true)", [
        f.orgA,
      ]);
      const result = await action(db);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  const rawRace = await Promise.allSettled(
    [f.a1, f.a2].map((branchId) =>
      runtime((db) =>
        db.query(
          "insert into gym.attendance_visits(organization_id,member_id,branch_id,membership_id,checked_in_by,eligibility_snapshot) values($1,$2,$3,$4,$5,$6::jsonb) returning id",
          [
            f.orgA,
            direct.member.id,
            branchId,
            direct.membershipId,
            f.users["Owner A"].id,
            JSON.stringify({ allowed: true, reason: "allowed" }),
          ],
        ),
      ),
    ),
  );
  assert.equal(rawRace.filter((r) => r.status === "fulfilled").length, 1);
  const duplicate = rawRace.find((r) => r.status === "rejected");
  assert.equal(
    duplicate?.status === "rejected" && duplicate.reason.code,
    "23505",
  );
  const rawVisit = (
    await admin.query(
      "select id,branch_id from gym.attendance_visits where member_id=$1",
      [direct.member.id],
    )
  ).rows[0];
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.attendance_visits set checked_out_at='2000-01-01',checked_out_by=$2 where id=$1",
        [rawVisit.id, f.users["Owner A"].id],
      ),
    ),
    { code: "23514" },
  );
  await attendance.record(owner, leave(rawVisit.id, rawVisit.branch_id));
  await assert.rejects(
    runtime((db) =>
      db.query(
        "update gym.attendance_visits set checked_out_at=clock_timestamp(),checked_out_by=$2 where id=$1",
        [rawVisit.id, f.users["Owner A"].id],
      ),
    ),
    { code: "23514" },
  );
  await admin.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1 and branch_id=$2",
    [f.memberships.reception, f.a1],
  );
  await deny(() => attendance.record(reception, firstInput), "NOT_FOUND");
  await admin.query(
    "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
    [f.orgA, f.memberships.reception, f.a1],
  );
  await deny(
    () => attendance.record(foreign, enter(homeOnly.member.id)),
    "NOT_FOUND",
  );
  const raw = await pool.connect();
  try {
    assert.equal(
      (await raw.query("select count(*)::int n from gym.attendance_visits"))
        .rows[0].n,
      0,
    );
    await raw.query("begin");
    await raw.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      raw.query(
        "update gym.attendance_visits set checked_in_at=clock_timestamp() where id=$1",
        [first.visitId],
      ),
      { code: "42501" },
    );
    await raw.query("rollback");
    await raw.query("begin");
    await raw.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      raw.query("delete from gym.attendance_visits where id=$1", [
        first.visitId,
      ]),
      { code: "42501" },
    );
    await raw.query("rollback");
  } finally {
    await raw.query("rollback");
    raw.release();
  }
  console.log(
    "PASS attendance real-session registration/enrollment/payment/refund/credit/access integration; no-membership/pending/future/expired/frozen/cancelled/archived/debt/wrong-branch/class-only denial; saved grace; owner/manager override; minimal all-branch lookup; concurrent service scans and raw unique constraint; replay/conflicts/repeated checkout; retained visits; branch closure; audit rollback; fresh role/branch revocation and cross-gym denial; Karachi midnight; raw chronology/closed immutability and runtime RLS/grants.",
  );
} finally {
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await pool.end();
  await admin.end();
}
