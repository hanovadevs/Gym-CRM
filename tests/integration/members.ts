import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createMembersService } from "../../src/modules/members/service";
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
    max: 5,
  });
await admin.connect();
const baseURL = "http://localhost:3100",
  secret = process.env.BETTER_AUTH_SECRET!;
const f = await securityFixture(admin, secret, baseURL);
const auth = configureAuth(pool, {
  secret,
  baseURL,
  sendReset: async () => {},
});
const service = createMembersService(
  createSecurity(pool, (h) => auth.api.getSession({ headers: h })),
);
const headers: Record<string, Headers> = {};
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
const org = { organizationId: f.orgA };
const input = (changes: Record<string, unknown> = {}) => ({
  ...org,
  name: "Sara Ahmed",
  phone: "0300 123-4567",
  email: "",
  homeBranchId: f.a1,
  joinedOn: "2026-01-01",
  registrationKey: randomUUID(),
  ...changes,
});
try {
  for (const [name, u] of Object.entries(f.users)) {
    const r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    });
    headers[name] = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join(";"),
    });
  }
  const owner = headers["Owner A"],
    reception = headers["Reception A"],
    manager = headers["Shared Staff"],
    other = headers["Owner B"];
  await deny(() => service.list(new Headers(), org), "UNAUTHENTICATED");
  await deny(() => service.create(new Headers(), input()), "UNAUTHENTICATED");
  await deny(
    () => service.list(owner, { organizationId: f.orgB }),
    "NOT_FOUND",
  );
  await deny(
    () => service.create(reception, input({ homeBranchId: f.a2 })),
    "NOT_FOUND",
  );
  await deny(
    () => service.create(owner, input({ homeBranchId: f.b1 })),
    "NOT_FOUND",
  );
  await deny(
    () => service.create(owner, input({ email: "", phone: "" })),
    "VALIDATION_ERROR",
  );
  await deny(
    () => service.create(owner, input({ joinedOn: "2099-01-01" })),
    "VALIDATION_ERROR",
  );
  await deny(
    () => service.list(owner, { ...org, sort: "name;drop table gym.members" }),
    "VALIDATION_ERROR",
  );
  const firstInput = input();
  const first = await service.create(reception, firstInput);
  assert.equal(first.member.memberCode, "M-000001");
  assert.equal(first.member.joinedOn, "2026-01-01");
  assert.equal((await service.list(owner, org)).members[0].id, first.member.id);
  assert.equal(
    (await service.create(reception, firstInput)).member.id,
    first.member.id,
  );
  await deny(
    () => service.create(reception, { ...firstInput, name: "Changed retry" }),
    "CONFLICT",
  );
  const b = await service.create(
    other,
    input({ organizationId: f.orgB, homeBranchId: f.b1 }),
  );
  assert.equal(b.member.memberCode, "M-000001"); // codes and contacts may repeat across gyms
  await assert.rejects(
    () =>
      service.create(
        owner,
        input({ name: "Shared family", phone: "(0300) 1234567" }),
      ),
    (e: unknown) => {
      const details = (e as { details?: { duplicates: { id: string }[] } })
        .details;
      return Boolean(
        details?.duplicates.some((m) => m.id === first.member.id) &&
        !details.duplicates.some((m) => m.id === b.member.id),
      );
    },
  );
  await service.create(
    owner,
    input({
      name: "Shared family",
      phone: "(0300) 1234567",
      acknowledgeDuplicate: true,
      duplicateReason: "Shared family number",
    }),
  );
  const north = await service.create(
    owner,
    input({ name: "North Member", homeBranchId: f.a2, phone: "03001112222" }),
  );
  assert.ok(
    !(await service.list(reception, org)).members.some(
      (m) => m.id === north.member.id,
    ),
  );
  await deny(
    () => service.list(reception, { ...org, branchId: f.a2 }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      service.update(reception, {
        ...north.member,
        organizationId: f.orgA,
        reason: "Forbidden edit",
        branchName: undefined,
        memberCode: undefined,
      }),
    "VALIDATION_ERROR",
  );
  const edit = (
    m: typeof first.member,
    changes: Record<string, unknown> = {},
  ) => ({
    ...org,
    id: m.id,
    version: m.version,
    name: m.name,
    phone: m.phone,
    email: m.email,
    homeBranchId: m.homeBranchId,
    joinedOn: m.joinedOn,
    reason: "Correct member details",
    ...changes,
  });
  await deny(() => service.update(reception, edit(north.member)), "NOT_FOUND");
  await deny(
    () => service.update(reception, edit(first.member, { homeBranchId: f.a2 })),
    "NOT_FOUND",
  );
  await deny(() => service.update(owner, edit(b.member)), "NOT_FOUND");
  const updated = await service.update(
    owner,
    edit(first.member, { name: "Sara Updated", email: "SARA@example.invalid" }),
  );
  assert.equal(updated.member.email, "sara@example.invalid");
  assert.equal(updated.member.version, 2);
  await deny(
    () => service.update(owner, edit(first.member, { name: "Stale edit" })),
    "CONFLICT",
  );
  assert.equal(
    (await service.list(reception, { ...org, q: "Sara Updated" })).total,
    1,
  );
  for (const q of [
    "0300-123-4567",
    "sara@example.invalid",
    first.member.memberCode,
  ])
    assert.ok(
      (await service.list(reception, { ...org, q })).members.some(
        (m) => m.id === first.member.id,
      ),
    );
  await service.create(
    owner,
    input({ name: "100% Fit", phone: "", email: "percent@example.invalid" }),
  );
  assert.equal((await service.list(owner, { ...org, q: "%" })).total, 1);
  assert.equal(
    (await service.list(owner, { ...org, q: "' OR 1=1 --" })).total,
    0,
  );
  const key = input({
    name: "Concurrent retry",
    phone: "",
    email: "retry@example.invalid",
  });
  const retries = await Promise.all([
    service.create(owner, key),
    service.create(owner, key),
  ]);
  assert.equal(retries[0].member.id, retries[1].member.id);
  assert.equal(retries.filter((r) => r.replayed).length, 1);
  const simultaneous = await Promise.allSettled([
    service.create(
      owner,
      input({ name: "Same contact A", phone: "03009998888" }),
    ),
    service.create(
      owner,
      input({ name: "Same contact B", phone: "03009998888" }),
    ),
  ]);
  assert.equal(simultaneous.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    simultaneous.filter(
      (r) => r.status === "rejected" && r.reason.code === "CONFLICT",
    ).length,
    1,
  );
  const more = await Promise.all(
    Array.from({ length: 28 }, (_, i) =>
      service.create(
        owner,
        input({
          name: `Directory ${String(i).padStart(2, "0")}`,
          phone: "",
          email: `${randomUUID()}@example.invalid`,
        }),
      ),
    ),
  );
  assert.equal(new Set(more.map((r) => r.member.memberCode)).size, 28);
  const page1 = await service.list(owner, { ...org, q: "Directory", page: 1 }),
    page2 = await service.list(owner, { ...org, q: "Directory", page: 2 });
  assert.equal(page1.total, 28);
  assert.equal(page1.members.length, 25);
  assert.equal(page2.members.length, 3);
  assert.ok(
    page2.members.every((m) => !page1.members.some((x) => x.id === m.id)),
  );
  assert.equal(
    (await service.list(owner, { ...org, q: "Directory", page: 999 })).page,
    2,
  );
  assert.equal(
    (await service.list(owner, { ...org, branchId: f.a2 })).total,
    1,
  );
  const race = await Promise.allSettled([
    service.update(owner, edit(updated.member, { name: "Race one" })),
    service.update(owner, edit(updated.member, { name: "Race two" })),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    race.filter((r) => r.status === "rejected" && r.reason.code === "CONFLICT")
      .length,
    1,
  );
  const event = (
    await admin.query("select * from gym.audit_events where request_id=$1", [
      first.requestId,
    ])
  ).rows[0];
  assert.equal(event.actor_user_id, f.users["Reception A"].id);
  const audits = JSON.stringify(
    (
      await admin.query(
        'select "before","after" from gym.audit_events where organization_id=$1',
        [f.orgA],
      )
    ).rows,
  );
  assert.ok(
    !audits.includes("0300") &&
      !audits.includes("sara@example") &&
      !audits.includes("Sara Updated"),
  );
  const before = (
    await admin.query(
      "select (select count(*)::int from gym.members where organization_id=$1) as members,(select value::text from gym.number_counters where organization_id=$1 and kind='member') as counter",
      [f.orgA],
    )
  ).rows[0];
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  try {
    await assert.rejects(
      () =>
        service.create(
          owner,
          input({ phone: "", email: "rollback@example.invalid" }),
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        service.update(owner, edit(north.member, { name: "Must roll back" })),
      /permission denied/,
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  const after = (
    await admin.query(
      "select (select count(*)::int from gym.members where organization_id=$1) as members,(select value::text from gym.number_counters where organization_id=$1 and kind='member') as counter",
      [f.orgA],
    )
  ).rows[0];
  assert.deepEqual(after, before);
  assert.equal(
    (await service.list(owner, { ...org, q: "North Member" })).members[0]
      .version,
    1,
  );
  const runtime = await pool.connect();
  try {
    assert.equal(
      (await runtime.query("select count(*)::int n from gym.members")).rows[0]
        .n,
      0,
    );
    assert.equal(
      (await runtime.query("select count(*)::int n from gym.number_counters"))
        .rows[0].n,
      0,
    );
    await assert.rejects(
      () => runtime.query("delete from gym.members"),
      (e: { code: string }) => e.code === "42501",
    );
    await runtime.query("begin");
    await runtime.query("select set_config('app.organization_id',$1,true)", [
      f.orgA,
    ]);
    await assert.rejects(
      () =>
        runtime.query(
          "insert into gym.members(organization_id,home_branch_id,member_code,name,email,joined_on,registration_key,registration_hash,created_by,updated_by) values($1,$2,'FK-TEST','Invalid','invalid@example.invalid','2026-01-01',$3,'hash',$4,$4)",
          [f.orgA, f.b1, randomUUID(), f.users["Owner A"].id],
        ),
      (e: { code: string }) => e.code === "23503",
    );
    await runtime.query("rollback");
  } finally {
    await runtime.query("rollback");
    runtime.release();
  }
  await admin.query(
    "update gym.staff_memberships set role='trainer' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => service.list(reception, org), "FORBIDDEN");
  await deny(() => service.create(reception, input()), "FORBIDDEN");
  await admin.query(
    "update gym.staff_memberships set role='accountant' where id=$1",
    [f.memberships.reception],
  );
  await deny(() => service.list(reception, org), "FORBIDDEN");
  await admin.query(
    "update gym.staff_memberships set role='receptionist' where id=$1",
    [f.memberships.reception],
  );
  await admin.query("update gym.branches set active=false where id=$1", [f.a2]);
  assert.ok(
    !(await service.list(owner, org)).members.some(
      (m) => m.id === north.member.id,
    ),
  );
  await admin.query("update gym.branches set active=true where id=$1", [f.a2]);
  await admin.query(
    "delete from gym.staff_branch_grants where staff_membership_id=$1",
    [f.memberships.sharedA],
  );
  await deny(() => service.list(manager, org), "NOT_FOUND");
  assert.equal(
    (await service.list(other, { organizationId: f.orgB })).total,
    1,
  );
  console.log(
    "PASS: persisted member registration/edit/search/pagination; scoped roles/branches and two-gym isolation; usable contacts/shared-contact review; atomic codes and replay-safe concurrent registration; stale-edit race; audit/counter rollback; restricted RLS/FK/delete and live revocation.",
  );
} finally {
  await f.cleanup();
  await admin.end();
  await pool.end();
}
