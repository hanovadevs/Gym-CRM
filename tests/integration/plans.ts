import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import {
  createPlansService,
  resolvePlanSnapshot,
} from "../../src/modules/plans/service";
import { snapshotPlan } from "../../src/modules/plans/types";
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
  plans = createPlansService(security),
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
    manager = headers["Shared Staff"],
    reception = headers["Reception A"],
    org = { organizationId: f.orgA };
  const values = {
    name: "Monthly strength",
    amountMinor: 450000,
    currency: "PKR",
    durationUnit: "months",
    durationCount: 1,
    accessMode: "home_branch",
    gymFloor: true,
    classes: true,
    personalTraining: false,
  };
  const input = {
    ...org,
    branchId: f.a1,
    code: "MONTHLY",
    values,
    requestKey: randomUUID(),
    reason: "Initial plan publication",
  };
  const result = await plans.create(owner, input),
    list = await plans.list(owner, org);
  assert.equal(list.total, 1);
  let p = list.plans[0];
  assert.equal(result.id, p.id);
  assert.equal(p.current.amountMinor, 450000);
  assert.equal(p.code, "MONTHLY");
  const original = snapshotPlan(p),
    resolved = await security.run(
      reception,
      org,
      "memberships.manage",
      (db, scope) => resolvePlanSnapshot(db, scope, p.current.id),
    );
  assert.deepEqual(resolved, original);
  const otherGym = await plans.create(headers["Owner B"], {
    ...input,
    organizationId: f.orgB,
    branchId: f.b1,
    requestKey: randomUUID(),
  });
  assert.equal(
    (await plans.list(headers["Owner B"], { organizationId: f.orgB })).plans[0]
      .code,
    "MONTHLY",
  );
  await security.run(owner, org, "plans.manage", async (db) => {
    assert.equal(
      (await db.query("select id from gym.plans where id=$1", [otherGym.id]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("select id from gym.plan_versions where plan_id=$1", [
          otherGym.id,
        ])
      ).rowCount,
      0,
    );
  });
  await assert.rejects(
    () =>
      security.run(owner, org, "plans.manage", (db) =>
        db.query(
          "insert into gym.plans(organization_id,branch_id,code,created_by) values($1,$2,$3,$4)",
          [f.orgB, f.b1, "FORGED-TENANT", f.users["Owner A"].id],
        ),
      ),
    (e: unknown) =>
      !!e && typeof e === "object" && "code" in e && e.code === "42501",
  );
  assert.equal((await plans.create(owner, input)).id, p.id);
  await deny(
    () =>
      plans.create(owner, { ...input, values: { ...values, name: "Changed" } }),
    "CONFLICT",
  );
  const repeated = await Promise.all([
    plans.create(owner, {
      ...input,
      code: "REPLAY",
      requestKey: "00000000-0000-4000-8000-000000000001",
    }),
    plans.create(owner, {
      ...input,
      code: "REPLAY",
      requestKey: "00000000-0000-4000-8000-000000000001",
    }),
  ]);
  assert.equal(repeated[0].id, repeated[1].id);
  await deny(
    () => plans.create(owner, { ...input, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await deny(
    () =>
      plans.create(reception, {
        ...input,
        code: "NO",
        requestKey: randomUUID(),
      }),
    "FORBIDDEN",
  );
  await deny(
    () =>
      plans.create(manager, {
        ...input,
        branchId: f.a2,
        code: "NO",
        requestKey: randomUUID(),
      }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      plans.create(manager, {
        ...input,
        code: "NO",
        values: { ...values, accessMode: "all_branches" },
        requestKey: randomUUID(),
      }),
    "FORBIDDEN",
  );
  const allAccess = await plans.create(owner, {
    ...input,
    code: "ALL-ACCESS",
    values: { ...values, accessMode: "all_branches" },
    requestKey: randomUUID(),
  });
  const allPlan = (await plans.history(owner, allAccess.id, org)).plan;
  const allSnapshot = await security.run(
    reception,
    org,
    "memberships.manage",
    (db, s) => resolvePlanSnapshot(db, s, allPlan.current.id),
  );
  assert.equal(allSnapshot.accessMode, "all_branches");
  const privatePlan = await plans.create(owner, {
    ...input,
    branchId: f.a2,
    code: "NORTH",
    requestKey: randomUUID(),
  });
  await deny(() => plans.history(manager, privatePlan.id, org), "NOT_FOUND");
  assert.ok(
    !(await plans.list(manager, org)).plans.some(
      (r) => r.id === privatePlan.id,
    ),
  );
  await deny(
    () => plans.history(headers["Owner B"], p.id, { organizationId: f.orgB }),
    "NOT_FOUND",
  );
  await deny(() => plans.list(owner, { organizationId: f.orgB }), "NOT_FOUND");
  await deny(() => plans.list(owner, { ...org, branchId: f.b1 }), "NOT_FOUND");
  const changed = {
    ...org,
    id: p.id,
    revision: p.revision,
    values: {
      ...values,
      name: "Strength plus",
      amountMinor: 500000,
      classes: false,
    },
    requestKey: randomUUID(),
    reason: "New rate for future enrollment",
  };
  await plans.publish(owner, changed);
  p = (await plans.history(owner, p.id, org)).plan;
  assert.equal(p.current.version, 2);
  assert.equal(p.current.amountMinor, 500000);
  assert.equal(
    (await plans.history(owner, p.id, org)).versions[1].amountMinor,
    original.amountMinor,
  );
  assert.equal(original.amountMinor, 450000);
  assert.equal(original.classes, true);
  assert.equal((await plans.publish(owner, changed)).replayed, true);
  await deny(
    () => plans.publish(owner, { ...changed, requestKey: randomUUID() }),
    "CONFLICT",
  );
  await deny(
    () =>
      security.run(owner, org, "memberships.manage", (db, s) =>
        resolvePlanSnapshot(db, s, original.planVersionId),
      ),
    "CONFLICT",
  );
  const race = await Promise.allSettled([
    plans.publish(owner, {
      ...changed,
      revision: p.revision,
      requestKey: randomUUID(),
    }),
    plans.publish(owner, {
      ...changed,
      revision: p.revision,
      requestKey: randomUUID(),
    }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  p = (await plans.history(owner, p.id, org)).plan;
  const archiveRace = await Promise.allSettled([
    plans.publish(owner, {
      ...changed,
      revision: p.revision,
      requestKey: randomUUID(),
    }),
    plans.archive(owner, {
      ...org,
      id: p.id,
      revision: p.revision,
      archived: true,
      reason: "Retiring this plan",
    }),
  ]);
  assert.equal(archiveRace.filter((r) => r.status === "fulfilled").length, 1);
  p = (await plans.history(owner, p.id, org)).plan;
  if (!p.archivedAt)
    await plans.archive(owner, {
      ...org,
      id: p.id,
      revision: p.revision,
      archived: true,
      reason: "Retiring this plan",
    });
  p = (await plans.history(owner, p.id, org)).plan;
  assert.ok(p.archivedAt);
  assert.ok(
    (await plans.list(owner, { ...org, status: "archived" })).plans.some(
      (r) => r.id === p.id,
    ),
  );
  assert.ok(!(await plans.list(owner, org)).plans.some((r) => r.id === p.id));
  await deny(
    () =>
      plans.publish(owner, {
        ...changed,
        revision: p.revision,
        requestKey: randomUUID(),
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      security.run(owner, org, "memberships.manage", (db, s) =>
        resolvePlanSnapshot(db, s, p.current.id),
      ),
    "CONFLICT",
  );
  await plans.archive(owner, {
    ...org,
    id: p.id,
    revision: p.revision,
    archived: false,
    reason: "Return plan to catalog",
  });
  p = (await plans.history(owner, p.id, org)).plan;
  assert.equal(p.archivedAt, null);
  assert.equal(
    (await plans.history(owner, p.id, org)).versions.at(-1)!.amountMinor,
    450000,
  );
  for (let i = 0; i < 21; i++) {
    await plans.publish(owner, {
      ...changed,
      revision: p.revision,
      requestKey: randomUUID(),
    });
    p = (await plans.history(owner, p.id, org)).plan;
  }
  const first = await plans.history(owner, p.id, org),
    second = await plans.history(owner, p.id, { ...org, versionPage: 2 });
  assert.equal(first.versions.length, 20);
  assert.ok(second.versions.length > 0);
  assert.ok(
    !first.versions.some((v) => second.versions.some((w) => w.id === v.id)),
  );
  assert.equal(
    (await plans.history(owner, p.id, { ...org, versionPage: 999 })).page,
    2,
  );
  await plans.create(owner, {
    ...input,
    code: "PERCENT",
    values: { ...values, name: "100% floor" },
    requestKey: randomUUID(),
  });
  assert.equal((await plans.list(owner, { ...org, q: "%" })).total, 1);
  assert.equal(
    (await plans.list(owner, { ...org, q: "' OR 1=1 --" })).total,
    0,
  );
  for (let i = 0; i < 13; i++)
    await plans.create(owner, {
      ...input,
      code: "PAGE-" + i,
      requestKey: randomUUID(),
    });
  const page1 = await plans.list(owner, org),
    page2 = await plans.list(owner, { ...org, page: 2 });
  assert.equal(page1.plans.length, 12);
  assert.ok(!page1.plans.some((v) => page2.plans.some((w) => w.id === v.id)));
  assert.equal((await plans.list(owner, { ...org, page: 999 })).page, 2);
  const before = (
    await admin.query(
      "select count(*)::int n from gym.plan_versions where organization_id=$1",
      [f.orgA],
    )
  ).rows[0].n;
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  try {
    await assert.rejects(() =>
      plans.create(owner, {
        ...input,
        code: "ROLLBACK",
        requestKey: randomUUID(),
      }),
    );
    await assert.rejects(() =>
      plans.publish(owner, {
        ...changed,
        revision: p.revision,
        requestKey: randomUUID(),
      }),
    );
    await assert.rejects(() =>
      plans.archive(owner, {
        ...org,
        id: p.id,
        revision: p.revision,
        archived: true,
        reason: "Rollback proof",
      }),
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  assert.equal(
    (
      await admin.query(
        "select id from gym.plans where organization_id=$1 and code=$2",
        [f.orgA, "ROLLBACK"],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from gym.plan_versions where organization_id=$1",
        [f.orgA],
      )
    ).rows[0].n,
    before,
  );
  assert.equal(
    (await plans.history(owner, p.id, org)).plan.revision,
    p.revision,
  );
  assert.equal(
    (await pool.query("select count(*)::int n from gym.plans")).rows[0].n,
    0,
  );
  for (const sql of [
    "update gym.plan_versions set amount_minor=0 where plan_id=$1",
    "delete from gym.plan_versions where plan_id=$1",
    "delete from gym.plans where id=$1",
    "update gym.plans set code='ILLEGAL' where id=$1",
  ]) {
    await assert.rejects(
      () =>
        security.run(owner, org, "plans.manage", (db) => db.query(sql, [p.id])),
      (e: unknown) =>
        !!e && typeof e === "object" && "code" in e && e.code === "42501",
    );
  }
  await assert.rejects(
    () =>
      admin.query(
        "insert into gym.plans(organization_id,branch_id,code,created_by) values($1,$2,$3,$4)",
        [f.orgB, f.a1, "CROSS", f.users["Owner B"].id],
      ),
    (e: unknown) =>
      !!e && typeof e === "object" && "code" in e && e.code === "23503",
  );
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  assert.ok((await plans.list(reception, org)).total > 0);
  await deny(
    () =>
      plans.create(reception, {
        ...input,
        code: "ACCOUNTANT",
        requestKey: randomUUID(),
      }),
    "FORBIDDEN",
  );
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => plans.list(reception, org), "FORBIDDEN");
  await admin.query("update gym.organizations set currency='JPY' where id=$1", [
    f.orgA,
  ]);
  await deny(
    () =>
      plans.publish(owner, {
        ...changed,
        revision: p.revision,
        requestKey: randomUUID(),
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      security.run(owner, org, "memberships.manage", (db, s) =>
        resolvePlanSnapshot(db, s, p.current.id),
      ),
    "VALIDATION_ERROR",
  );
  assert.equal(
    (await plans.history(owner, p.id, org)).plan.current.currency,
    "PKR",
  );
  await admin.query(
    "update gym.staff_memberships set active=false where id=$1",
    [f.memberships.sharedA],
  );
  await deny(() => plans.list(manager, org), "NOT_FOUND");
  console.log(
    "PASS: real scoped plans, immutable version/snapshot history, exact rates, same-key replay, stale/version/archive races, literal search/pagination, branch/tenant/role denial, audit rollback, currency bounds, RLS/FK and runtime immutability, live revocation.",
  );
} finally {
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await admin.end();
  await pool.end();
}
