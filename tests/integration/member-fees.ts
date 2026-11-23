import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
import { createPlansService } from "../../src/modules/plans/service";
import { createMembershipsService } from "../../src/modules/memberships/service";
import { endOn } from "../../src/modules/plans/format";
import { securityFixture } from "../helpers/security-fixture";
import { createMemberFeesService } from "../../src/modules/member-fees/service";
import { deliverFeeDigest } from "../../src/modules/member-fees/delivery";
import { runFeeReminderWorker } from "../../src/modules/member-fees/worker";
import { createPaymentsService } from "../../src/modules/payments/service";
import { readFile, unlink } from "node:fs/promises";
const captureIds: string[] = [];
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
  plans = createPlansService(security),
  subs = createMembershipsService(security),
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
    org = { organizationId: f.orgA },
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
    }).format(new Date());
  const plan = await plans.create(owner, {
    ...org,
    branchId: f.a1,
    code: "FEE-MONTHLY",
    values: {
      name: "Monthly access",
      amountMinor: 500000,
      currency: "PKR",
      durationCount: 1,
      durationUnit: "months",
      accessMode: "home_branch",
      gymFloor: true,
      classes: true,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Fee suite monthly plan",
  });
  const body = {
    ...org,
    name: "Individual fee member",
    phone: "",
    email: randomUUID() + "@example.invalid",
    homeBranchId: f.a1,
    joinedOn: today,
    registrationKey: randomUUID(),
    monthlyFee: {
      planVersionId: plan.versionId,
      amountMinor: "375050",
      startOn: today,
      reminderDays: 7,
    },
  };
  const [a, b] = await Promise.all([
    members.create(owner, body),
    members.create(owner, body),
  ]);
  assert.equal(a.member.id, b.member.id);
  assert.equal([a, b].filter((x) => x.replayed).length, 1);
  const member = a.member,
    ctx = await subs.get(owner, member.id, org),
    term = ctx.memberships[0];
  assert.equal(ctx.total, 1);
  assert.equal(term.amountMinor, 375050);
  assert.equal(term.snapshot.catalogAmountMinor, 500000);
  assert.ok(term.snapshot.feeAgreementId);
  assert.equal(term.invoice.totalMinor, 375050);
  assert.equal(term.startOn, today);
  assert.equal(term.endOn, endOn(today, 1, "months"));
  assert.equal(term.lifecycle, "pending");
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.payments where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    0,
  );
  const due = (
    await admin.query(
      "select due_kind,due_on::text,amount_minor::text from gym.member_fee_due where organization_id=$1 and member_id=$2",
      [f.orgA, member.id],
    )
  ).rows[0];
  assert.equal(due.due_kind, "invoice");
  assert.equal(due.amount_minor, "375050");
  assert.equal(due.due_on, today);
  const renew = {
    ...org,
    memberVersion: member.version,
    mode: "renew",
    planVersionId: plan.versionId,
    startOn: term.endOn,
    requestKey: randomUUID(),
    reason: "Renew at saved individual monthly rate",
  };
  const preview = await subs.preview(
    owner,
    member.id,
    renewWithoutJournal(renew),
  );
  assert.equal(preview.plan.amountMinor, 375050);
  await subs.enroll(headers["Reception A"], member.id, renew);
  const periods = (
    await admin.query(
      "select m.amount_minor::text,m.start_on::text from gym.member_fee_periods p join gym.memberships m on m.id=p.membership_id where p.organization_id=$1 order by m.start_on",
      [f.orgA],
    )
  ).rows;
  assert.equal(periods.length, 2);
  assert.ok(periods.every((p) => p.amount_minor === "375050"));
  await deny(
    () =>
      members.create(headers["Reception A"], {
        ...body,
        registrationKey: randomUUID(),
      }),
    "FORBIDDEN",
  );
  await deny(
    () =>
      members.create(owner, {
        ...body,
        monthlyFee: { ...body.monthlyFee, amountMinor: "375051" },
      }),
    "CONFLICT",
  );
  await deny(() => members.create(headers["Owner B"], body), "NOT_FOUND");
  const countBefore = (
    await admin.query(
      "select count(*)::int n from gym.members where organization_id=$1",
      [f.orgA],
    )
  ).rows[0].n;
  await deny(
    () =>
      members.create(owner, {
        ...body,
        email: randomUUID() + "@example.invalid",
        registrationKey: randomUUID(),
        monthlyFee: { ...body.monthlyFee, startOn: "2020-01-01" },
      }),
    "VALIDATION_ERROR",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.members where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    countBefore,
    "Failed enrollment rolls back registration and agreement",
  );
  const raw = await pool.connect();
  try {
    await raw.query("begin");
    await raw.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      raw.query(
        "update gym.member_fee_agreements set amount_minor=1 where member_id=$1",
        [member.id],
      ),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "42501",
    );
    await raw.query("rollback");
    await raw.query("begin");
    await raw.query("select set_config('app.organization_id',$1,true)", [
      f.orgB,
    ]);
    assert.equal(
      (
        await raw.query(
          "select * from gym.member_fee_agreements where member_id=$1",
          [member.id],
        )
      ).rowCount,
      0,
    );
    await raw.query("rollback");
  } finally {
    await raw.query("rollback");
    raw.release();
  }
  const current = await subs.get(owner, member.id, org);
  const repriced = {
    ...renew,
    memberVersion: current.memberVersion,
    startOn: current.nextStartOn,
    requestKey: randomUUID(),
    monthlyFee: { amountMinor: "410025", reminderDays: 10 },
    reason: "Agreed fee changes for a future term only",
  };
  await deny(
    () =>
      subs.preview(
        headers["Reception A"],
        member.id,
        renewWithoutJournal(repriced),
      ),
    "FORBIDDEN",
  );
  assert.equal(
    (await subs.preview(owner, member.id, renewWithoutJournal(repriced))).plan
      .amountMinor,
    410025,
  );
  await subs.enroll(owner, member.id, repriced);
  const feeHistory = (
    await admin.query(
      "select amount_minor::text,ended_at is not null ended from gym.member_fee_agreements where member_id=$1 order by created_at",
      [member.id],
    )
  ).rows;
  assert.deepEqual(
    feeHistory.map((x) => [x.amount_minor, x.ended]),
    [
      ["375050", true],
      ["410025", false],
    ],
  );
  const retainedDue = (
    await admin.query(
      "select amount_minor::text,due_kind from gym.member_fee_due where member_id=$1",
      [member.id],
    )
  ).rows[0];
  assert.equal(
    retainedDue.amount_minor,
    "375050",
    "Old unpaid terms remain due after repricing",
  );
  const fees = createMemberFeesService(security, pool);
  const contact = randomUUID() + "@example.invalid";
  await admin.query(
    "insert into gym.gym_accounts(organization_id,auth_user_id,owner_email,created_by,updated_by) values($1,$2,$3,$2,$2)",
    [f.orgA, f.users["Owner A"].id, contact],
  );
  const roleDb = await pool.connect();
  try {
    await roleDb.query("begin");
    await roleDb.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      roleDb.query(
        "update gym.staff_memberships set role='manager',version=version+1 where organization_id=$1 and auth_user_id=$2",
        [f.orgA, f.users["Owner A"].id],
      ),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "23514",
    );
  } finally {
    await roleDb.query("rollback");
    roleDb.release();
  }
  assert.equal((await fees.get(owner, org)).total, 1);
  await deny(() => fees.get(headers["Reception A"], org), "FORBIDDEN");
  await deny(() => fees.get(owner, { ...org, branchId: f.b1 }), "NOT_FOUND");
  process.env.MAIL_TRANSPORT = "capture";
  process.env.APP_ENV = "test";
  const client = await pool.connect();
  let queued;
  try {
    await client.query("begin");
    await client.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    const { enqueueFeeDigest } =
      await import("../../src/modules/member-fees/delivery");
    queued = await enqueueFeeDigest(client, f.orgA);
    await client.query("commit");
  } finally {
    await client.query("rollback");
    client.release();
  }
  assert.ok(queued.id);
  assert.equal(
    await deliverFeeDigest(pool, f.orgA, queued.id, {
      source: process.env,
      send: async () => {
        throw Object.assign(Error("Injected connection failure"), {
          code: "ECONNECTION",
        });
      },
    }),
    "failed",
  );
  assert.equal(
    (
      await fees.save(owner, {
        operation: "retry",
        ...org,
        id: queued.id,
        expectedAttempts: 1,
        reason: "Retry safely failed test connection",
      })
    ).status,
    "sent",
  );
  captureIds.push(queued.id);
  const captured = JSON.parse(
    await readFile(".local/fee-mail/" + queued.id + ".json", "utf8"),
  );
  assert.equal(captured.to, contact);
  assert.equal(captured.from, "Hanova Devs <contact@hanovadevs.com>");
  assert.ok(captured.text.includes("Invoice balance due"));
  assert.ok(captured.text.includes("not issued debt"));
  assert.equal(
    (await fees.save(owner, { operation: "digest", ...org })).status,
    "sent",
  );
  await deny(
    () =>
      fees.save(owner, {
        operation: "retry",
        ...org,
        id: queued.id,
        expectedAttempts: 1,
        reason: "Lost response must not send twice",
      }),
    "CONFLICT",
  );
  await fees.save(owner, {
    operation: "settings",
    ...org,
    enabled: false,
    version: 0,
    reason: "Disable daily email summary",
  });
  await deny(
    () =>
      fees.save(owner, {
        operation: "settings",
        ...org,
        enabled: true,
        version: 0,
        reason: "Reject stale preferences",
      }),
    "CONFLICT",
  );
  await fees.save(owner, {
    operation: "settings",
    ...org,
    enabled: true,
    version: 1,
    reason: "Restore daily email summary",
  });
  const ownerB = headers["Owner B"],
    planB = await plans.create(ownerB, {
      organizationId: f.orgB,
      branchId: f.b1,
      code: "FEE-B",
      values: {
        name: "Monthly B",
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
      reason: "Test uncertain summary isolation",
    });
  await members.create(ownerB, {
    ...body,
    organizationId: f.orgB,
    homeBranchId: f.b1,
    email: randomUUID() + "@example.invalid",
    registrationKey: randomUUID(),
    monthlyFee: { ...body.monthlyFee, planVersionId: planB.versionId },
  });
  const contactB = randomUUID() + "@example.invalid";
  await admin.query(
    "insert into gym.gym_accounts(organization_id,auth_user_id,owner_email,created_by,updated_by) values($1,$2,$3,$2,$2)",
    [f.orgB, f.users["Owner B"].id, contactB],
  );
  const c2 = await pool.connect();
  let jobB;
  try {
    await c2.query("begin");
    await c2.query("select set_config('app.organization_id',$1,true)", [
      f.orgB,
    ]);
    const { enqueueFeeDigest } =
      await import("../../src/modules/member-fees/delivery");
    jobB = await enqueueFeeDigest(c2, f.orgB);
    await c2.query("commit");
  } finally {
    await c2.query("rollback");
    c2.release();
  }
  assert.ok(jobB.id);
  let uncertainAttempts = 0;
  assert.equal(
    await deliverFeeDigest(pool, f.orgB, jobB.id, {
      source: process.env,
      send: async () => {
        uncertainAttempts++;
        throw Object.assign(
          Error("Injected timeout after possible acceptance"),
          { code: "ETIMEDOUT" },
        );
      },
    }),
    "uncertain",
  );
  assert.equal(
    await deliverFeeDigest(pool, f.orgB, jobB.id, {
      source: process.env,
      send: async () => {
        uncertainAttempts++;
        return { accepted: [contactB] };
      },
    }),
    "uncertain",
  );
  assert.equal(
    uncertainAttempts,
    1,
    "Uncertain messages are never blindly retried",
  );
  await deny(
    () =>
      fees.save(ownerB, {
        operation: "retry",
        organizationId: f.orgB,
        id: jobB.id,
        expectedAttempts: 1,
        reason: "Missing delivery review",
      }),
    "VALIDATION_ERROR",
  );
  assert.equal(
    (
      await fees.save(ownerB, {
        operation: "retry",
        organizationId: f.orgB,
        id: jobB.id,
        expectedAttempts: 1,
        reviewedUncertain: true,
        reason: "Mailbox checked; explicit test retry",
      })
    ).status,
    "sent",
  );
  captureIds.push(jobB.id);
  const work = await runFeeReminderWorker(pool, {
    source: process.env,
    budgetMs: 10000,
  });
  assert.equal(
    work.sent,
    0,
    "Already accepted daily digests do not send again",
  );
  const payments = createPaymentsService(security);
  const invoices = (
    await admin.query(
      "select i.id,b.balance_minor::text amount from gym.invoices i join gym.invoice_balances b on b.organization_id=i.organization_id and b.invoice_id=i.id where i.organization_id=$1 and i.member_id=$2 and b.balance_minor>0",
      [f.orgA, member.id],
    )
  ).rows;
  for (const inv of invoices)
    await payments.record(owner, {
      ...org,
      invoiceId: inv.id,
      requestKey: randomUUID(),
      amountMinor: inv.amount,
      expectedBalanceMinor: inv.amount,
      currency: "PKR",
      method: "cash",
      paidOn: today,
    });
  const renewalDue = (
    await admin.query(
      "select due_kind,due_on::text,amount_minor::text from gym.member_fee_due where member_id=$1",
      [member.id],
    )
  ).rows[0];
  assert.equal(renewalDue.due_kind, "renewal");
  assert.equal(renewalDue.amount_minor, "410025");
  assert.equal(
    (await fees.get(owner, org)).total,
    0,
    "Distant renewal is not yet an upcoming reminder",
  );
  const endContext = await subs.get(owner, member.id, org);
  const bypass = await pool.connect();
  try {
    await bypass.query("begin");
    await bypass.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await bypass.query(
      "insert into gym.memberships(organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,start_on,original_end_on_exclusive,end_on_exclusive,lifecycle,activated_at,created_by) select organization_id,member_id,home_branch_id,plan_version_id,snapshot,amount_minor,currency,$3::date,$4::date,$4::date,'active',now(),created_by from gym.memberships where organization_id=$1 and member_id=$2 order by start_on desc limit 1",
      [
        f.orgA,
        member.id,
        endContext.nextStartOn,
        endOn(endContext.nextStartOn, 1, "months"),
      ],
    );
    await assert.rejects(
      bypass.query("commit"),
      (e: unknown) => e instanceof Error && "code" in e && e.code === "23514",
      "Raw unlinked renewal cannot bypass the current agreed fee",
    );
  } finally {
    await bypass.query("rollback");
    bypass.release();
  }
  const endInput = {
    ...org,
    memberVersion: endContext.memberVersion,
    mode: "renew",
    planVersionId: plan.versionId,
    startOn: endContext.nextStartOn,
    useCatalogPrice: true,
    requestKey: randomUUID(),
    reason: "Owner explicitly ends individual pricing for future renewals",
  };
  await deny(
    () =>
      subs.preview(
        headers["Reception A"],
        member.id,
        renewWithoutJournal(endInput),
      ),
    "FORBIDDEN",
  );
  assert.equal(
    (await subs.preview(owner, member.id, renewWithoutJournal(endInput))).plan
      .amountMinor,
    500000,
  );
  await subs.enroll(owner, member.id, endInput);
  assert.equal((await subs.get(owner, member.id, org)).monthlyFee, null);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.member_fee_agreements where member_id=$1 and ended_at is null",
        [member.id],
      )
    ).rows[0].n,
    0,
  );
  const beforeFault = (
    await admin.query(
      "select (select count(*)::int from gym.members where organization_id=$1) members,(select count(*)::int from gym.memberships where organization_id=$1) terms,(select count(*)::int from gym.invoices where organization_id=$1) invoices,(select value::text from gym.number_counters where organization_id=$1 and kind='invoice') counter",
      [f.orgA],
    )
  ).rows[0];
  const trigger = "fee_fail_" + f.orgA.replaceAll("-", "");
  try {
    await admin.query(
      `create function gym.${trigger}() returns trigger language plpgsql as $$ begin if NEW.organization_id='${f.orgA}'::uuid and NEW.action='member.monthly_fee_agreed' then raise exception 'Injected fee audit failure';end if;return NEW;end $$`,
    );
    await admin.query(
      `create trigger ${trigger} before insert on gym.audit_events for each row execute function gym.${trigger}()`,
    );
    await assert.rejects(
      members.create(owner, {
        ...body,
        email: randomUUID() + "@example.invalid",
        registrationKey: randomUUID(),
      }),
      /Injected fee audit failure/,
    );
    const afterFault = (
      await admin.query(
        "select (select count(*)::int from gym.members where organization_id=$1) members,(select count(*)::int from gym.memberships where organization_id=$1) terms,(select count(*)::int from gym.invoices where organization_id=$1) invoices,(select value::text from gym.number_counters where organization_id=$1 and kind='invoice') counter",
        [f.orgA],
      )
    ).rows[0];
    assert.deepEqual(
      afterFault,
      beforeFault,
      "An audit failure after enrollment rolls back member, agreement, term, invoice and numbering together",
    );
  } finally {
    await admin.query(`drop trigger if exists ${trigger} on gym.audit_events`);
    await admin.query(`drop function if exists gym.${trigger}()`);
  }
  console.log(
    "PASS atomic owner-set member fee registration, exact monthly invoice/access snapshots, no fake payment, concurrent replay, saved-rate renewal, due invoice source, failed-registration rollback, role/tenant and immutable SQL protections; repricing preserves past balances, real-owner digest capture/daily deduplication, safe-failure retry, uncertainty hold/review, preference stale guard and paid-invoice-to-renewal due dates. No external emails.",
  );
} finally {
  for (const id of captureIds)
    await unlink(".local/fee-mail/" + id + ".json").catch(() => {});
  await f.cleanup();
  await admin.end();
  await pool.end();
}
function renewWithoutJournal(v: Record<string, unknown>) {
  const { requestKey, reason, ...rest } = v;
  void requestKey;
  void reason;
  return rest;
}
