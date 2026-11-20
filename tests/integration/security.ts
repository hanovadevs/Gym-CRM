import { config } from "dotenv";
import pg from "pg";
import type { PoolClient } from "pg";
import assert from "node:assert/strict";
import { createSecurity } from "../../src/server/security/service";
import { configureAuth } from "../../src/server/auth/configure";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname != "/gym_test")
    throw new Error("Isolated targets required");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 1,
});
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = "http://localhost:3100";
const auth = configureAuth(pool, {
  secret,
  baseURL,
  sendReset: async () => {},
});
const security = createSecurity(pool, (headers) =>
  auth.api.getSession({ headers }),
);
const f = await securityFixture(admin, secret, baseURL);
const headers: Record<string, Headers> = {};
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (error: unknown) =>
      error instanceof Error && "code" in error && error.code === code,
  );
try {
  for (const [name, user] of Object.entries(f.users)) {
    const response = await auth.api.signInEmail({
      body: { email: user.email, password: user.password },
      asResponse: true,
    });
    headers[name] = new Headers({
      cookie: response.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";"),
    });
  }
  const owner = headers["Owner A"],
    reception = headers["Reception A"];
  const unsafePool = new pg.Pool({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
    max: 1,
  });
  try {
    const unsafe = createSecurity(unsafePool, (headers) =>
      auth.api.getSession({ headers }),
    );
    await assert.rejects(
      unsafe.workspace(owner, {}),
      /Unsafe database runtime role/,
    );
  } finally {
    await unsafePool.end();
  }
  await deny(() => security.workspace(new Headers(), {}), "UNAUTHENTICATED");
  await deny(
    () =>
      security.workspace(
        new Headers({ cookie: "better-auth.session_token=forged" }),
        {},
      ),
    "UNAUTHENTICATED",
  );
  assert.equal(
    (await pool.query("select * from gym.organizations")).rowCount,
    0,
  );
  assert.equal(
    (await pool.query("select * from gym.staff_memberships")).rowCount,
    0,
  );
  const directory = await pool.query("select * from gym.staff_directory($1)", [
    f.users["Owner A"].id,
  ]);
  assert.deepEqual(
    directory.rows.map((r) => r.organization_id),
    [f.orgA],
  );
  assert.equal(
    (await pool.query("select * from gym.staff_directory($1)", ["unknown"]))
      .rowCount,
    0,
  );
  const proc = (
    await admin.query(
      "select p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,exists(select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='gym' and p.proname='staff_directory'",
    )
  ).rows[0];
  assert.equal(proc.prosecdef, true);
  assert.equal(proc.owner, "gym_migrator");
  assert.equal(proc.public_execute, false);
  assert.ok(proc.proconfig.includes("search_path=pg_catalog, pg_temp"));
  const a = await security.workspace(owner, {});
  assert.equal(a.organization.id, f.orgA);
  assert.equal(a.branches.length, 2);
  assert.equal(a.organizations.length, 1);
  const r = await security.workspace(reception, {});
  assert.deepEqual(
    r.branches.map((b) => b.id),
    [f.a1],
  );
  for (const selection of [
    { organizationId: f.orgB },
    { branchId: f.b1 },
    { branchId: f.a2 },
  ])
    await deny(() => security.workspace(reception, selection), "NOT_FOUND");
  await deny(
    () => security.workspace(owner, { role: "owner" }),
    "VALIDATION_ERROR",
  );
  let ran = false;
  for (const action of ["billing.adjust", "staff.manage"] as const)
    await deny(
      () =>
        security.run(reception, {}, action, async () => {
          ran = true;
        }),
      "FORBIDDEN",
    );
  assert.equal(ran, false);
  await security.run(owner, {}, "billing.adjust", async (db) => {
    assert.equal((await db.query("select 1")).rowCount, 1);
  });
  await security.run(owner, {}, "workspace.read", async (db) => {
    assert.equal(
      (await db.query("select * from gym.branches where id=$1", [f.b1]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("update gym.branches set name=$1 where id=$2", [
          "Cross tenant",
          f.b1,
        ])
      ).rowCount,
      0,
    );
  });
  assert.equal(
    (await admin.query("select name from gym.branches where id=$1", [f.b1]))
      .rows[0].name,
    "Private B",
  );
  for (let i = 0; i < 4; i++) {
    const b = await security.workspace(headers["Owner B"], {});
    assert.equal(b.organization.id, f.orgB);
    await security.workspace(owner, {});
    assert.equal((await pool.query("select * from gym.branches")).rowCount, 0);
  }
  await assert.rejects(
    security.run(owner, {}, "workspace.read", async (db) => {
      await db.query("update gym.branches set name=$1 where id=$2", [
        "Rollback",
        f.a1,
      ]);
      throw new Error("forced rollback");
    }),
    /forced rollback/,
  );
  assert.equal(
    (await admin.query("select name from gym.branches where id=$1", [f.a1]))
      .rows[0].name,
    "Central",
  );
  assert.equal(
    (await pool.query("select * from gym.organizations")).rowCount,
    0,
  );
  const shared = await security.workspace(headers["Shared Staff"], {
    organizationId: f.orgB,
  });
  assert.equal(shared.organizations.length, 2);
  assert.equal(shared.organization.id, f.orgB);
  assert.deepEqual(
    shared.branches.map((b) => b.id),
    [f.b1],
  );
  await admin.query("update gym.staff_memberships set role=$1 where id=$2", [
    "receptionist",
    f.memberships.ownerA,
  ]);
  await deny(
    () => security.run(owner, {}, "billing.adjust", async () => {}),
    "FORBIDDEN",
  );
  await admin.query("update gym.staff_memberships set role=$1 where id=$2", [
    "owner",
    f.memberships.ownerA,
  ]);
  await admin.query("update gym.branches set active=false where id=$1", [f.a1]);
  await deny(() => security.workspace(reception, {}), "FORBIDDEN");
  await admin.query("update gym.branches set active=true where id=$1", [f.a1]);
  await admin.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1",
    [f.memberships.reception],
  );
  await deny(() => security.workspace(reception, {}), "FORBIDDEN");
  await admin.query(
    "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
    [f.orgA, f.memberships.reception, f.a1],
  );
  const revokerPid = (await admin.query("select pg_backend_pid() as pid"))
    .rows[0].pid;
  let releaseOperation!: () => void;
  let signalStarted!: () => void;
  let runningClient!: PoolClient;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const release = new Promise<void>((resolve) => {
    releaseOperation = resolve;
  });
  const inFlight = security.run(reception, {}, "workspace.read", async (db) => {
    runningClient = db;
    signalStarted();
    await release;
  });
  await started;
  const revoke = admin.query(
    "update gym.staff_memberships set active=false where id=$1",
    [f.memberships.reception],
  );
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await runningClient.query(
        "select cardinality(pg_blocking_pids($1))>0 as blocked",
        [revokerPid],
      );
      if (result.rows[0].blocked) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(
      blocked,
      "Membership revocation must wait for the authorized operation",
    );
  } finally {
    releaseOperation();
    await inFlight;
    await revoke;
  }
  assert.ok(await auth.api.getSession({ headers: reception }));
  await deny(() => security.workspace(reception, {}), "FORBIDDEN");
  await admin.query(
    'update app_auth.session set "expiresAt"=now()-interval \'1 minute\' where "userId"=$1',
    [f.users["Owner B"].id],
  );
  await deny(
    () => security.workspace(headers["Owner B"], {}),
    "UNAUTHENTICATED",
  );
  await admin.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1",
    [f.memberships.sharedA],
  );
  const fallback = await security.workspace(headers["Shared Staff"], {});
  assert.equal(fallback.organization.id, f.orgB);
  assert.equal(fallback.organizations.length, 1);
  console.log(
    "PASS: real sessions; directory ACL/search path; two-gym reads/writes; owner/assigned branches; role/action denial; multi-gym selection; live role/grant/membership revocation; expired/forged sessions; rollback and reused max-1 pool isolation.",
  );
} finally {
  await f.cleanup();
  await admin.end();
  await pool.end();
}
