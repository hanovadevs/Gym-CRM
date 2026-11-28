import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { securityFixture } from "../helpers/security-fixture";
import { createEnquiriesService } from "../../src/modules/enquiries/service";
import { createPlansService } from "../../src/modules/plans/service";
import { todayInZone } from "../../src/modules/plans/format";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  assert.equal(new URL(process.env[k]!).pathname, "/gym_test");
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: "-c TimeZone=UTC",
    max: 5,
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
  service = createEnquiriesService(security);
try {
  const h: Record<string, Headers> = {};
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    h[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join(";"),
    });
  }
  const owner = h["Owner A"],
    desk = h["Reception A"],
    manager = h["Shared Staff"],
    org = { organizationId: f.orgA },
    today = todayInZone("Asia/Karachi");
  const deny = (fn: () => Promise<unknown>, code: string) =>
    assert.rejects(
      fn,
      (e: unknown) => e instanceof Error && "code" in e && e.code === code,
    );
  await deny(() => service.get(new Headers(), org), "UNAUTHENTICATED");
  await deny(() => service.get(h["Owner B"], org), "NOT_FOUND");
  const input = {
    ...org,
    operation: "create",
    id: randomUUID(),
    requestKey: randomUUID(),
    branchId: f.a1,
    name: "Ayesha enquiry",
    email: randomUUID() + "@example.invalid",
    phone: "",
    interest: "Strength classes",
    contactAllowed: true,
    stage: "new",
    trialAt: null,
    assigneeId: null,
    reason: "New enquiry",
  };
  const first = await Promise.all([
    service.post(owner, input),
    service.post(owner, input),
  ]);
  assert.equal(first[0].id, first[1].id);
  assert.equal((await service.get(owner, org)).total, 1);
  await deny(
    () => service.post(owner, { ...input, name: "Different" }),
    "CONFLICT",
  );
  await deny(
    () =>
      service.post(desk, {
        ...input,
        id: randomUUID(),
        requestKey: randomUUID(),
        branchId: f.a2,
      }),
    "NOT_FOUND",
  );
  const trial = new Date(Date.now() + 86400000);
  const stamp = trial.toISOString().slice(0, 10) + "T18:00:00+05:00";
  const edit = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "branchId"),
  );
  await service.post(desk, {
    ...edit,
    operation: "edit",
    requestKey: randomUUID(),
    version: 1,
    stage: "trial_booked",
    trialAt: stamp,
  });
  const detail = await service.get(owner, { ...org, selectedId: input.id });
  assert.equal(detail.selected?.stage, "trial_booked");
  assert.ok(detail.selected?.trialAt);
  await deny(
    () =>
      service.post(owner, {
        ...edit,
        operation: "edit",
        requestKey: randomUUID(),
        version: 1,
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      service.post(owner, {
        ...edit,
        operation: "edit",
        requestKey: randomUUID(),
        version: 2,
        stage: "trial_booked",
        trialAt: stamp.replace("+05:00", "+00:00"),
      }),
    "VALIDATION_ERROR",
  );
  const task = {
    ...org,
    id: input.id,
    operation: "task",
    requestKey: randomUUID(),
    action: "Confirm trial attendance",
    dueOn: today,
    reason: "Trial follow-up",
  };
  const t = await service.post(desk, task);
  await service.post(desk, task);
  assert.equal((await service.get(owner, org)).taskTotal, 1);
  const done = {
    ...org,
    id: input.id,
    operation: "complete_task",
    requestKey: randomUUID(),
    taskId: t.taskId,
    reason: "Trial confirmed",
  };
  await Promise.all([service.post(desk, done), service.post(desk, done)]);
  assert.equal((await service.get(owner, org)).taskTotal, 0);
  assert.equal(
    (await service.get(owner, { ...org, taskStatus: "done" })).taskTotal,
    1,
  );
  const plan = await createPlansService(security).create(owner, {
    ...org,
    branchId: f.a1,
    code: "LEAD-PLAN",
    values: {
      name: "Lead conversion",
      amountMinor: 500000,
      currency: "PKR",
      durationUnit: "months",
      durationCount: 1,
      accessMode: "home_branch",
      gymFloor: true,
      classes: true,
      personalTraining: false,
    },
    requestKey: randomUUID(),
    reason: "Conversion test plan",
  });
  const conversion = {
    ...org,
    id: input.id,
    operation: "convert",
    version: 2,
    requestKey: randomUUID(),
    joinedOn: today,
    enrollment: {
      mode: "enroll",
      planVersionId: plan.versionId,
      startOn: today,
    },
    reason: "Joined after trial",
  };
  const converted = await Promise.all([
    service.post(desk, conversion),
    service.post(desk, conversion),
  ]);
  assert.equal(converted[0].memberId, converted[1].memberId);
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.members where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.invoices where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    1,
  );
  const joined = await service.get(owner, {
    ...org,
    selectedId: input.id,
    stage: "joined",
  });
  assert.equal(joined.selected?.convertedMemberId, converted[0].memberId);
  assert.ok(joined.history.length >= 4);
  await deny(
    () => service.post(owner, { ...conversion, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await deny(
    () =>
      service.post(owner, {
        ...edit,
        operation: "edit",
        requestKey: randomUUID(),
        version: 3,
      }),
    "CONFLICT",
  );
  const second = {
    ...input,
    id: randomUUID(),
    requestKey: randomUUID(),
    name: "A second enquiry",
  };
  await service.post(owner, second);
  const convertOnly = {
    ...org,
    id: second.id,
    operation: "convert",
    version: 1,
    joinedOn: today,
    enrollment: { mode: "later" },
    requestKey: randomUUID(),
    reason: "Register only",
  };
  await deny(() => service.post(owner, convertOnly), "CONFLICT");
  await service.post(owner, {
    ...convertOnly,
    sharedContactReason: "Siblings share this contact",
  });
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.invoices where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    1,
  );
  // A failure after member creation and before the request journal must roll back all writes.
  const third = {
    ...input,
    id: randomUUID(),
    requestKey: randomUUID(),
    email: randomUUID() + "@example.invalid",
  };
  await service.post(owner, third);
  await deny(
    () =>
      service.post(owner, {
        ...convertOnly,
        id: third.id,
        requestKey: randomUUID(),
        enrollment: {
          mode: "enroll",
          planVersionId: randomUUID(),
          startOn: today,
        },
      }),
    "NOT_FOUND",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.members where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    2,
  );
  await admin.query(
    "create function gym.test_enquiry_journal_fail() returns trigger language plpgsql as $$ begin if NEW.operation='enquiry.convert' then raise exception 'injected rollback'; end if; return NEW; end $$",
  );
  await admin.query(
    "create trigger test_enquiry_journal_fail before insert on gym.schedule_requests for each row execute function gym.test_enquiry_journal_fail()",
  );
  try {
    await assert.rejects(() =>
      service.post(owner, {
        ...convertOnly,
        id: third.id,
        requestKey: randomUUID(),
      }),
    );
  } finally {
    await admin.query(
      "drop trigger test_enquiry_journal_fail on gym.schedule_requests",
    );
    await admin.query("drop function gym.test_enquiry_journal_fail()");
  }
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.members where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (await service.get(owner, { ...org, selectedId: third.id })).selected
      ?.stage,
    "new",
  );
  await deny(() => service.get(desk, { ...org, branchId: f.a2 }), "NOT_FOUND");
  await deny(
    () => service.get(manager, { ...org, branchId: f.a2 }),
    "NOT_FOUND",
  );
  assert.equal((await service.get(owner, { ...org, q: "%" })).total, 0);
  await admin.query("begin");
  try {
    await assert.rejects(() =>
      admin.query(
        "update gym.enquiries set converted_member_id=null,stage='new',version=version+1 where id=$1",
        [input.id],
      ),
    );
  } finally {
    await admin.query("rollback");
  }

  const lost = {
    ...input,
    id: randomUUID(),
    requestKey: randomUUID(),
    stage: "lost",
    email: randomUUID() + "@example.invalid",
  };
  await service.post(owner, lost);
  await deny(
    () =>
      service.post(owner, {
        ...convertOnly,
        id: lost.id,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  for (let i = 0; i < 26; i++)
    await service.post(owner, {
      ...input,
      id: randomUUID(),
      requestKey: randomUUID(),
      name: "Paged lead " + String(i).padStart(2, "0"),
      email: randomUUID() + "@example.invalid",
    });
  const page = await service.get(owner, { ...org, q: "Paged lead" });
  assert.equal(page.total, 26);
  assert.equal(page.rows.length, 25);
  assert.equal(
    (await service.get(owner, { ...org, q: "Paged lead", page: 2 })).rows
      .length,
    1,
  );
  assert.equal(
    (await service.get(owner, { ...org, q: "Paged lead", page: 999 })).query
      .page,
    2,
  );
  for (const role of ["trainer", "accountant"]) {
    await admin.query(
      "update gym.staff_memberships set role=$2,version=version+1 where auth_user_id=$1 and organization_id=$3",
      [f.users["Shared Staff"].id, role, f.orgA],
    );
    await deny(() => service.get(manager, org), "FORBIDDEN");
    await deny(
      () => service.post(manager, { ...task, requestKey: randomUUID() }),
      "FORBIDDEN",
    );
  }
  console.log(
    "PASS enquiry stages/trial time zones/tasks/history, conversion+enrollment atomicity, replay/races, duplicate contacts, branch/tenant scope and injected journal rollback",
  );
} finally {
  await f.cleanup();
  await pool.end();
  await admin.end();
}
