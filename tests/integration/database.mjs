import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import pg from "pg";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
if (new URL(process.env.TEST_DATABASE_URL).pathname != "/gym_test")
  throw new Error("Only isolated gym_test allowed");
const runtime = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
const migration = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
await runtime.connect();
await migration.connect();
const a = randomUUID(),
  b = randomUUID(),
  branch = randomUUID(),
  staff = randomUUID(),
  user = randomUUID();
try {
  const role = (
    await runtime.query(
      "select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user",
    )
  ).rows[0];
  assert.ok(Object.values(role).every((v) => v === false));
  await assert.rejects(runtime.query("create table gym.forbidden(id int)"), {
    code: "42501",
  });
  await migration.query(
    "insert into gym.organizations(id,name,slug) values ($1,$2,$3),($4,$5,$6)",
    [a, "Test A", a, b, "Test B", b],
  );
  await migration.query(
    'insert into app_auth."user"(id,name,email) values($1,$2,$3)',
    [user, "Fixture", user + "@example.invalid"],
  );
  await migration.query(
    "insert into gym.staff_memberships(id,organization_id,auth_user_id,role) values($1,$2,$3,$4)",
    [staff, a, user, "owner"],
  );
  await migration.query(
    "insert into gym.branches(id,organization_id,code,name) values($1,$2,$3,$4)",
    [branch, b, "MAIN", "Test B"],
  );
  await assert.rejects(
    migration.query(
      "insert into gym.staff_branch_grants(organization_id,staff_membership_id,branch_id) values($1,$2,$3)",
      [a, staff, branch],
    ),
    { code: "23503" },
  );
  assert.equal(
    (await runtime.query("select * from gym.organizations")).rowCount,
    0,
  );
  await runtime.query("BEGIN");
  await runtime.query("select set_config('app.organization_id',$1,true)", [a]);
  assert.deepEqual(
    (await runtime.query("select id from gym.organizations")).rows,
    [{ id: a }],
  );
  await assert.rejects(
    runtime.query(
      "insert into gym.branches(organization_id,code,name) values($1,$2,$3)",
      [b, "X", "Denied"],
    ),
    { code: "42501" },
  );
  await runtime.query("ROLLBACK");
  assert.equal(
    (await runtime.query("select * from gym.organizations")).rowCount,
    0,
  );
  await runtime.query("BEGIN");
  await runtime.query("select set_config('app.organization_id',$1,true)", [b]);
  assert.deepEqual(
    (await runtime.query("select id from gym.organizations")).rows,
    [{ id: b }],
  );
  await runtime.query("COMMIT");
  assert.equal(
    (await runtime.query("select * from gym.organizations")).rowCount,
    0,
  );
  console.log(
    "PASS: restricted role, DDL denial, scoped composite FK, missing context, tenant read/write isolation and reused-connection context cleanup.",
  );
} finally {
  await runtime.query("ROLLBACK");
  await migration.query("delete from gym.staff_memberships where id=$1", [
    staff,
  ]);
  await migration.query("delete from gym.branches where id=$1", [branch]);
  await migration.query("delete from gym.organizations where id in ($1,$2)", [
    a,
    b,
  ]);
  await migration.query('delete from app_auth."user" where id=$1', [user]);
  await runtime.end();
  await migration.end();
}
