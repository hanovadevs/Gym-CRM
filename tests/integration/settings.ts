import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createSecurity } from "../../src/server/security/service";
import { configureAuth } from "../../src/server/auth/configure";
import { createSettingsService } from "../../src/modules/settings/service";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const key of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[key]!).pathname != "/gym_test")
    throw new Error("Isolated gym_test required");
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = "http://localhost:3100";
const f = await securityFixture(admin, secret, baseURL);
const extraEmails: string[] = [];
const auth = configureAuth(pool, {
    secret,
    baseURL,
    sendReset: async () => {},
  }),
  security = createSecurity(pool, (headers) =>
    auth.api.getSession({ headers }),
  );
const settings = createSettingsService(security, async (db, input) => {
  const setup = configureAuth(db, {
    secret,
    baseURL,
    allowProvisioning: true,
    sendReset: async () => {},
  });
  return (await setup.api.signUpEmail({ body: input })).user;
});
const headers: Record<string, Headers> = {};
const deny = (fn: () => Promise<unknown>, code: string) =>
  assert.rejects(
    fn,
    (e: unknown) => e instanceof Error && "code" in e && e.code === code,
  );
try {
  for (const [name, u] of Object.entries(f.users)) {
    const response = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
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
    manager = headers["Shared Staff"],
    reception = headers["Reception A"];
  const org = { organizationId: f.orgA };
  await deny(() => settings.get(new Headers(), org), "UNAUTHENTICATED");
  await deny(() => settings.get(reception, org), "FORBIDDEN");
  await deny(
    () => settings.get(owner, { organizationId: f.orgB }),
    "NOT_FOUND",
  );
  let current = await settings.get(owner, org);
  assert.equal(current.version, 1);
  assert.equal(current.staff.length, 3);
  assert.equal(current.values.graceDays, 0);
  assert.equal(current.values.paidActivation, true);
  const saved = await settings.save(owner, {
    ...org,
    version: 1,
    changes: {
      name: "Calm Fitness",
      currency: "USD",
      timeZone: "Asia/Dubai",
      locale: "en-GB",
      receiptPrefix: "CALM",
      receiptFooter: "Saved receipt footer",
      email: "gym-contact@example.invalid",
      graceDays: 3,
    },
    reason: "Configure gym policies",
  });
  current = await settings.get(owner, org);
  assert.equal(current.version, 2);
  assert.equal(current.values.receiptPrefix, "CALM");
  assert.equal(current.values.receiptFooter, "Saved receipt footer");
  assert.equal(current.values.graceDays, 3);
  const workspace = await security.workspace(owner, org);
  assert.equal(workspace.organization.name, "Calm Fitness");
  assert.equal(workspace.organization.currency, "USD");
  assert.equal(workspace.organization.timeZone, "Asia/Dubai");
  const event = (
    await admin.query("select * from gym.audit_events where request_id=$1", [
      saved.requestId,
    ])
  ).rows[0];
  assert.equal(event.actor_user_id, f.users["Owner A"].id);
  assert.ok(!JSON.stringify(event).includes("gym-contact@example.invalid"));
  await deny(
    () =>
      settings.save(owner, {
        ...org,
        version: 1,
        changes: { name: "Stale" },
        reason: "Stale edit",
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      settings.save(owner, {
        ...org,
        version: 2,
        changes: { timeZone: "Bad/Timezone" },
        reason: "Bad time zone",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      settings.save(owner, {
        ...org,
        version: 2,
        changes: { graceDays: 31 },
        reason: "Bad grace",
      }),
    "VALIDATION_ERROR",
  );
  await deny(
    () =>
      settings.save(owner, {
        ...org,
        version: 2,
        changes: { role: "owner" },
        reason: "Inject field",
      }),
    "VALIDATION_ERROR",
  );
  const managerData = await settings.get(manager, org);
  assert.equal(managerData.canManageStaff, false);
  assert.equal(managerData.staff.length, 0);
  assert.equal(managerData.audit.length, 0);
  assert.equal(managerData.branches.length, 1);
  await settings.save(manager, {
    ...org,
    version: 2,
    changes: { phone: "0300-1234567" },
    reason: "Update public contact",
  });
  await deny(
    () =>
      settings.save(manager, {
        ...org,
        version: 3,
        changes: { currency: "PKR" },
        reason: "Attempt financial edit",
      }),
    "FORBIDDEN",
  );
  await deny(
    () =>
      settings.staffSave(manager, {
        ...org,
        id: f.memberships.sharedA,
        version: 1,
        role: "owner",
        active: true,
        branchIds: [f.a1],
        reason: "Self promotion",
      }),
    "FORBIDDEN",
  );
  await settings.staffSave(owner, {
    ...org,
    id: f.memberships.reception,
    version: 1,
    role: "manager",
    active: true,
    branchIds: [f.a2],
    reason: "Move to North",
  });
  assert.deepEqual(
    (await security.workspace(reception, org)).branches.map((b) => b.id),
    [f.a2],
  );
  await deny(
    () =>
      settings.staffSave(owner, {
        ...org,
        id: f.memberships.reception,
        version: 1,
        role: "receptionist",
        active: true,
        branchIds: [f.a1],
        reason: "Stale staff edit",
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      settings.staffSave(owner, {
        ...org,
        id: f.memberships.reception,
        version: 2,
        role: "manager",
        active: true,
        branchIds: [f.b1],
        reason: "Foreign branch",
      }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      settings.staffSave(owner, {
        ...org,
        id: f.memberships.ownerB,
        version: 1,
        role: "owner",
        active: true,
        branchIds: [],
        reason: "Foreign staff",
      }),
    "NOT_FOUND",
  );
  await deny(
    () =>
      settings.staffSave(owner, {
        ...org,
        id: f.memberships.ownerA,
        version: 1,
        role: "manager",
        active: true,
        branchIds: [f.a1],
        reason: "Remove last owner",
      }),
    "CONFLICT",
  );
  const newBranch = await settings.branchSave(owner, {
    ...org,
    name: "South",
    code: "SOUTH",
    active: true,
    reason: "Open South",
  });
  assert.equal(newBranch.version, 1);
  await deny(
    () =>
      settings.branchSave(owner, {
        ...org,
        name: "Duplicate",
        code: "SOUTH",
        active: true,
        reason: "Duplicate code",
      }),
    "CONFLICT",
  );
  await settings.branchSave(owner, {
    ...org,
    id: f.a1,
    version: 1,
    name: "Central",
    code: "CENTRAL",
    active: false,
    reason: "Close Central",
  });
  await settings.branchSave(owner, {
    ...org,
    id: f.a2,
    version: 1,
    name: "North",
    code: "NORTH",
    active: false,
    reason: "Close North",
  });
  await deny(
    () =>
      settings.branchSave(owner, {
        ...org,
        id: newBranch.id,
        version: 1,
        name: "South",
        code: "SOUTH",
        active: false,
        reason: "Close last branch",
      }),
    "CONFLICT",
  );
  await settings.branchSave(owner, {
    ...org,
    id: f.a1,
    version: 2,
    name: "Central",
    code: "CENTRAL",
    active: true,
    reason: "Reopen Central",
  });
  await settings.branchSave(owner, {
    ...org,
    id: f.a2,
    version: 2,
    name: "North",
    code: "NORTH",
    active: true,
    reason: "Reopen North",
  });
  const email = randomUUID() + "@example.invalid",
    password = randomBytes(20).toString("hex");
  extraEmails.push(email);
  await settings.staffCreate(owner, {
    ...org,
    name: "New Accountant",
    email,
    password,
    role: "accountant",
    active: true,
    branchIds: [f.a1],
    reason: "Add accountant",
  });
  const login = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  assert.equal(login.status, 200);
  const signed = new Headers({
    cookie: login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join(";"),
  });
  assert.equal((await security.workspace(signed, org)).role, "accountant");
  await deny(
    () =>
      settings.staffCreate(owner, {
        ...org,
        name: "Duplicate",
        email,
        password,
        role: "accountant",
        active: true,
        branchIds: [f.a1],
        reason: "Duplicate email",
      }),
    "CONFLICT",
  );
  await deny(
    () =>
      settings.staffCreate(owner, {
        ...org,
        name: "Other gym identity",
        email: f.users["Owner B"].email,
        password,
        role: "owner",
        active: true,
        branchIds: [],
        reason: "Attempt existing identity",
      }),
    "CONFLICT",
  );
  const audits = await admin.query(
    "select * from gym.audit_events where organization_id=$1",
    [f.orgA],
  );
  assert.ok(!JSON.stringify(audits.rows).includes(password));
  assert.ok(!JSON.stringify(audits.rows).includes(email));
  await assert.rejects(
    pool.query("update gym.audit_events set reason=$1", ["Tamper"]),
    { code: "42501" },
  );
  await assert.rejects(pool.query("delete from gym.audit_events"), {
    code: "42501",
  });
  assert.equal(
    (await pool.query("select * from gym.audit_events")).rowCount,
    0,
  );
  const beforeFailure = await settings.get(owner, org);
  const failedEmail = randomUUID() + "@example.invalid";
  extraEmails.push(failedEmail);
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  try {
    await assert.rejects(
      settings.save(owner, {
        ...org,
        version: beforeFailure.version,
        changes: { name: "Must roll back" },
        reason: "Force audit failure",
      }),
      { code: "42501" },
    );
    await assert.rejects(
      settings.staffCreate(owner, {
        ...org,
        name: "Rollback identity",
        email: failedEmail,
        password,
        role: "trainer",
        active: true,
        branchIds: [f.a1],
        reason: "Force account rollback",
      }),
      { code: "42501" },
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  const afterFailure = await settings.get(owner, org);
  assert.equal(afterFailure.version, beforeFailure.version);
  assert.equal(afterFailure.values.name, beforeFailure.values.name);
  assert.equal(
    (
      await admin.query('select id from app_auth."user" where email=$1', [
        failedEmail,
      ])
    ).rowCount,
    0,
  );
  const races = await Promise.allSettled(
    ["First", "Second"].map((phone) =>
      settings.save(owner, {
        ...org,
        version: afterFailure.version,
        changes: { phone },
        reason: "Competing settings change",
      }),
    ),
  );
  assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    races.filter((r) => r.status === "rejected" && r.reason.code === "CONFLICT")
      .length,
    1,
  );
  const sharedEmail = randomUUID() + "@example.invalid";
  extraEmails.push(sharedEmail);
  const provisioning = await Promise.allSettled(
    [
      [owner, f.orgA, f.a1],
      [headers["Owner B"], f.orgB, f.b1],
    ].map(([h, organizationId, branchId]) =>
      settings.staffCreate(h as Headers, {
        organizationId,
        name: "Shared email race",
        email: sharedEmail,
        password,
        role: "receptionist",
        active: true,
        branchIds: [branchId],
        reason: "Provision concurrently",
      }),
    ),
  );
  assert.equal(provisioning.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    provisioning.filter(
      (r) => r.status === "rejected" && r.reason.code === "CONFLICT",
    ).length,
    1,
  );
  const secondOwner = randomUUID();
  await admin.query(
    "insert into gym.staff_memberships(id,organization_id,auth_user_id,role) values($1,$2,$3,'owner')",
    [secondOwner, f.orgA, f.users["Owner B"].id],
  );
  const ownersRace = await Promise.allSettled(
    [
      [owner, f.memberships.ownerA],
      [headers["Owner B"], secondOwner],
    ].map(([h, id]) =>
      settings.staffSave(h as Headers, {
        ...org,
        id,
        version: 1,
        role: "manager",
        active: true,
        branchIds: [f.a1],
        reason: "Competing owner demotion",
      }),
    ),
  );
  assert.equal(ownersRace.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await admin.query(
        "select id from gym.staff_memberships where organization_id=$1 and role='owner' and active=true",
        [f.orgA],
      )
    ).rowCount,
    1,
  );
  console.log(
    "PASS: persisted/versioned settings, live workspace formatting context, manager field limits, staff provisioning with maintained hashes, role/grant updates, tenant denial, append-only/sanitized atomic audit, forced account rollback, duplicate provisioning race, stale-save race and concurrent last-owner protection.",
  );
} finally {
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await admin.query('delete from app_auth."user" where email=any($1::text[])', [
    extraEmails,
  ]);
  await admin.end();
  await pool.end();
}
