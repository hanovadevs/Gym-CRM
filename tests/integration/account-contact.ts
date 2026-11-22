import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { configureAuth } from "../../src/server/auth/configure";
import { accountMailTarget } from "../../src/server/auth/account-contact";
import { createPlatformService } from "../../src/modules/platform/service";
import { bootstrapPlatformAdmin } from "../../src/server/platform/bootstrap";
import { enqueueMail, deliverMail } from "../../src/server/mail/service";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[k]!).pathname !== "/gym_test")
    throw Error("Only isolated gym_test");
const captures: string[] = [];
const admin = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 3,
});
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = process.env.APP_URL!;
const f = await securityFixture(admin, secret, baseURL);
const auth = configureAuth(pool, {
  secret,
  baseURL,
  sendReset: async (message) => {
    const user = (
      await pool.query('select id from app_auth."user" where email=$1', [
        message.email,
      ])
    ).rows[0];
    const target = await accountMailTarget(pool, user.id);
    assert.ok(target?.recipient_email);
    const id = await enqueueMail(pool, {
      userId: user.id,
      email: target.recipient_email,
      url: message.url,
      kind: "recovery",
    });
    await deliverMail(pool, id, {
      source: { MAIL_TRANSPORT: "capture", APP_ENV: "test" },
    });
    captures.push(id);
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

let platformUserId: string | undefined;
const orgs: string[] = [],
  users: string[] = [];
try {
  const adminEmail = randomUUID() + "@example.invalid",
    adminPassword = randomBytes(20).toString("hex");
  platformUserId = (
    await bootstrapPlatformAdmin(
      admin,
      {
        name: "Contact routing operator",
        email: adminEmail,
        password: adminPassword,
      },
      { secret, baseURL },
    )
  ).userId;
  const headers = await login(adminEmail, adminPassword),
    contact = randomUUID() + "@example.invalid",
    newContact = randomUUID() + "@example.invalid",
    password = randomBytes(20).toString("hex");
  const body = {
    operation: "create",
    name: "Split login gym",
    slug: "contact-" + randomUUID(),
    ownerName: "Gym owner",
    ownerEmail: contact,
    email: randomUUID() + "@mojym.local",
    password,
    reason: "Verify separate primary login and recovery contact",
    requestKey: randomUUID(),
  };
  const gym = await service.save(headers, body);
  orgs.push(gym.organizationId);
  const owner = (
    await admin.query('select id from app_auth."user" where email=$1', [
      body.email,
    ])
  ).rows[0];
  users.push(owner.id);
  const target = await accountMailTarget(pool, owner.id);
  assert.equal(target?.recipient_email, contact);
  assert.equal(target?.login_email, body.email);
  assert.equal(target?.is_gym_account, true);
  await login(body.email, password);
  assert.equal(
    (
      await auth.api.signInEmail({
        body: { email: contact, password },
        asResponse: true,
      })
    ).status,
    401,
    "Real contact is not the gym login ID",
  );
  assert.equal(
    (
      await pool.query(
        "select gym.recovery_account_identifier($1,null) email",
        [contact],
      )
    ).rows[0].email,
    body.email,
  );
  await auth.api.requestPasswordReset({
    body: { email: body.email, redirectTo: baseURL + "/reset-password" },
  });
  const oldCapture = JSON.parse(
    await readFile(".local/mail/" + captures[0] + ".json", "utf8"),
  );
  assert.equal(oldCapture.email, contact);
  assert.equal(oldCapture.loginEmail, body.email);
  const oldToken = new URL(oldCapture.url).pathname.split("/").pop()!;
  await service.save(headers, {
    operation: "update",
    organizationId: gym.organizationId,
    version: 1,
    name: body.name,
    active: true,
    email: body.email,
    ownerEmail: newContact,
    reason: "Change owner recovery mailbox",
    requestKey: randomUUID(),
  });
  assert.equal(
    (await accountMailTarget(pool, owner.id))?.recipient_email,
    newContact,
  );
  await assert.rejects(
    auth.api.resetPassword({
      body: { token: oldToken, newPassword: randomBytes(20).toString("hex") },
    }),
    /token/i,
  );
  await auth.api.requestPasswordReset({
    body: { email: body.email, redirectTo: baseURL + "/reset-password" },
  });
  const fresh = JSON.parse(
    await readFile(".local/mail/" + captures[1] + ".json", "utf8"),
  );
  assert.equal(fresh.email, newContact);
  const newPassword = randomBytes(20).toString("hex");
  await auth.api.resetPassword({
    body: { token: new URL(fresh.url).pathname.split("/").pop()!, newPassword },
  });
  await login(body.email, newPassword);
  const secondBody = {
    ...body,
    name: "Second contact gym",
    slug: "contact-" + randomUUID(),
    email: randomUUID() + "@mojym.local",
    ownerEmail: newContact,
    requestKey: randomUUID(),
  };
  const second = await service.save(headers, secondBody);
  orgs.push(second.organizationId);
  users.push(
    (
      await admin.query('select id from app_auth."user" where email=$1', [
        secondBody.email,
      ])
    ).rows[0].id,
  );
  assert.equal(
    (
      await pool.query(
        "select gym.recovery_account_identifier($1,null) email",
        [newContact],
      )
    ).rows[0].email,
    null,
    "Shared owner contact needs a gym identifier",
  );
  assert.equal(
    (
      await pool.query("select gym.recovery_account_identifier($1,$2) email", [
        newContact,
        body.email,
      ])
    ).rows[0].email,
    body.email,
  );
  assert.equal(
    (
      await pool.query("select gym.recovery_account_identifier($1,$2) email", [
        contact,
        body.email,
      ])
    ).rows[0].email,
    null,
    "Old contact cannot select the gym account",
  );
  const staff = await accountMailTarget(pool, f.users["Reception A"].id);
  assert.equal(staff?.recipient_email, f.users["Reception A"].email);
  assert.equal(staff?.is_gym_account, false);
  await assert.rejects(
    enqueueMail(pool, {
      userId: owner.id,
      email: body.email,
      url: fresh.url,
      kind: "recovery",
    }),
    /does not match/,
    "Login aliases cannot become mail delivery addresses",
  );
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('app.organization_id',$1,true)", [
      gym.organizationId,
    ]);
    await db.query(
      "update gym.gym_accounts set owner_email=$2,version=version+1 where organization_id=$1",
      [gym.organizationId, contact],
    );
    let resolved = false;
    const waiting = accountMailTarget(pool, owner.id).then((t) => {
      resolved = true;
      return t;
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(
      resolved,
      false,
      "Mail target waits for in-flight contact changes",
    );
    await db.query("rollback");
    assert.equal((await waiting)?.recipient_email, newContact);
  } finally {
    await db.query("rollback");
    db.release();
  }
  const functions = (
    await admin.query(
      "select p.prosecdef,p.proconfig,has_function_privilege('public',p.oid,'EXECUTE') public_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='gym' and p.proname in ('account_mail_target','recovery_account_identifier')",
    )
  ).rows;
  assert.equal(functions.length, 2);
  assert.ok(
    functions.every(
      (f) =>
        f.prosecdef &&
        !f.public_execute &&
        f.proconfig.includes("search_path=pg_catalog, pg_temp"),
    ),
  );
  console.log(
    "PASS separate gym alias login/real owner recovery, fixed sender capture, contact change invalidates old maintained reset links, new reset/login, shared contact disambiguation, staff fallback, alias delivery denial, recipient row-lock serialization and helper ACLs. No external emails.",
  );
} finally {
  for (const id of captures)
    await unlink(".local/mail/" + id + ".json").catch(() => {});
  await admin.query(
    "delete from app_auth.mail_outbox where auth_user_id=any($1::text[])",
    [users],
  );
  await admin.query(
    "delete from platform.events where organization_id=any($1::uuid[])",
    [orgs],
  );
  for (const table of [
    "audit_events",
    "gym_accounts",
    "staff_branch_grants",
    "staff_memberships",
    "branches",
  ])
    await admin.query(
      "delete from gym." + table + " where organization_id=any($1::uuid[])",
      [orgs],
    );
  await admin.query("delete from gym.organizations where id=any($1::uuid[])", [
    orgs,
  ]);
  if (platformUserId) {
    await admin.query("delete from platform.administrators where user_id=$1", [
      platformUserId,
    ]);
    users.push(platformUserId);
  }
  await f.cleanup();
  await admin.query('delete from app_auth."user" where id=any($1::text[])', [
    users,
  ]);
  await pool.end();
  await admin.end();
}
