import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { configureAuth } from "../../src/server/auth/configure";
import { createSecurity } from "../../src/server/security/service";
import { createSettingsService } from "../../src/modules/settings/service";
import { provisionStaff } from "../../src/modules/settings";
import {
  enqueueMail,
  deliverMail,
  accountMessage,
} from "../../src/server/mail/service";
import { securityFixture } from "../helpers/security-fixture";
config({ path: ".env.local", quiet: true });
for (const k of ["TEST_DATABASE_URL", "TEST_MIGRATION_DATABASE_URL"])
  if (new URL(process.env[k]!).pathname !== "/gym_test")
    throw new Error("Isolated gym_test required");
process.env.MAIL_TRANSPORT = "capture";
const admin = new pg.Client({
    connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
  }),
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    max: 4,
  });
await admin.connect();
const secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = process.env.APP_URL!,
  f = await securityFixture(admin, secret, baseURL),
  captures: string[] = [],
  extra: string[] = [];
try {
  const auth = configureAuth(pool, {
      secret,
      baseURL,
      sendReset: async () => {},
    }),
    security = createSecurity(pool, (h) => auth.api.getSession({ headers: h }));
  const u = f.users["Owner A"],
    r = await auth.api.signInEmail({
      body: { email: u.email, password: u.password },
      asResponse: true,
    }),
    headers = new Headers({
      cookie: r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join(";"),
    });
  const service = createSettingsService(security, provisionStaff);
  const input = {
    organizationId: f.orgA,
    name: "Invited Staff",
    email: randomUUID() + "@example.invalid",
    delivery: "email",
    role: "receptionist",
    active: true,
    branchIds: [f.a1],
    reason: "Invite front desk staff",
  };
  extra.push(input.email);
  const result = await service.staffCreate(headers, input);
  assert.ok(result.mailId);
  captures.push(result.mailId!);
  assert.equal(
    (
      await pool.query("select status from app_auth.mail_outbox where id=$1", [
        result.mailId,
      ])
    ).rows[0].status,
    "pending",
  );
  assert.equal(await deliverMail(pool, result.mailId!), "sent");
  const capture = JSON.parse(
    await readFile(`.local/mail/${result.mailId}.json`, "utf8"),
  );
  assert.equal(capture.from, "contact@hanovadevs.com");
  assert.equal(capture.kind, "invitation");
  assert.equal(
    (
      await pool.query("select payload from app_auth.mail_outbox where id=$1", [
        result.mailId,
      ])
    ).rows[0].payload,
    null,
  );
  const redirect = await auth.handler(new Request(capture.url));
  const token = new URL(redirect.headers.get("location")!).searchParams.get(
    "token",
  );
  assert.ok(token);
  await auth.api.resetPassword({
    body: { newPassword: "Verified invitation password 2026", token: token! },
  });
  const invited = await auth.api.signInEmail({
    body: { email: input.email, password: "Verified invitation password 2026" },
    asResponse: true,
  });
  assert.equal(invited.status, 200);
  await assert.rejects(() =>
    auth.api.resetPassword({
      body: { newPassword: "Another invitation password", token: token! },
    }),
  );
  const queue = () =>
    enqueueMail(pool, {
      userId: u.id,
      email: u.email,
      url: new URL("/reset-password?token=fictional", baseURL).href,
      kind: "recovery",
    });
  let calls = 0;
  const id = await queue();
  const send = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { messageId: "mocked", accepted: [u.email], rejected: [] };
  };
  await Promise.all([
    deliverMail(pool, id, { send }),
    deliverMail(pool, id, { send }),
  ]);
  assert.equal(calls, 1);
  assert.equal(await deliverMail(pool, id, { send }), "sent");
  assert.equal(calls, 1);
  const failed = await queue();
  assert.equal(
    await deliverMail(pool, failed, {
      send: async () => {
        throw Object.assign(new Error("Rejected"), {
          code: "EAUTH",
          responseCode: 535,
        });
      },
    }),
    "failed",
  );
  assert.equal(await deliverMail(pool, failed, { send }), "failed");
  assert.equal(
    await deliverMail(pool, failed, { send, retryFailed: true }),
    "sent",
  );
  const uncertain = await queue();
  assert.equal(
    await deliverMail(pool, uncertain, {
      send: async () => {
        throw Object.assign(new Error("Connection lost"), { code: "ESOCKET" });
      },
    }),
    "uncertain",
  );
  assert.equal(
    await deliverMail(pool, uncertain, { send, retryFailed: true }),
    "uncertain",
  );
  const unknown = await queue();
  assert.equal(
    await deliverMail(pool, unknown, {
      send: async () => {
        throw new Error("Unknown delivery outcome");
      },
    }),
    "uncertain",
  );
  assert.equal(
    await deliverMail(pool, unknown, { send, retryFailed: true }),
    "uncertain",
  );
  const acknowledged = await queue();
  const interruptedPool = {
    query: async (sql: string, values: unknown[]) => {
      if (sql.includes("set status='sent'"))
        throw new Error("Acknowledgement persistence lost");
      return pool.query(sql, values);
    },
  } as unknown as pg.Pool;
  const beforeAcknowledged = calls;
  assert.equal(
    await deliverMail(interruptedPool, acknowledged, { send }),
    "uncertain",
  );
  assert.equal(
    await deliverMail(pool, acknowledged, { send, retryFailed: true }),
    "uncertain",
  );
  assert.equal(
    calls,
    beforeAcknowledged + 1,
    "Accepted delivery must not be resent after persistence failure",
  );
  const expired = await queue();
  await admin.query(
    "update app_auth.mail_outbox set created_at=now()-interval '31 minutes' where id=$1",
    [expired],
  );
  assert.equal(await deliverMail(pool, expired, { send }), "expired");
  await assert.rejects(() =>
    enqueueMail(pool, {
      userId: u.id,
      email: "another@example.invalid",
      url: baseURL,
      kind: "recovery",
    }),
  );
  await assert.rejects(() =>
    enqueueMail(pool, {
      userId: u.id,
      email: u.email,
      url: "https://untrusted.example/reset",
      kind: "recovery",
    }),
  );
  const message = accountMessage("invitation", {
    email: u.email,
    url: baseURL,
    gymName: '<script>alert("bad")</script>',
  });
  assert.ok(!message.html.includes("<script>"));
  assert.equal(message.from.address, "contact@hanovadevs.com");
  await admin.query("revoke insert on gym.audit_events from gym_runtime");
  const rollbackEmail = randomUUID() + "@example.invalid";
  extra.push(rollbackEmail);
  try {
    await assert.rejects(() =>
      service.staffCreate(headers, { ...input, email: rollbackEmail }),
    );
  } finally {
    await admin.query("grant insert on gym.audit_events to gym_runtime");
  }
  assert.equal(
    (
      await admin.query('select id from app_auth."user" where email=$1', [
        rollbackEmail,
      ])
    ).rowCount,
    0,
  );
  console.log(
    "PASS: transactional staff invitation outbox, fixed sender, maintained one-use password setup/login, payload cleanup, concurrent single delivery, safe failed retry and uncertain hold, expiry, recipient/origin bounds, template escaping and account/outbox rollback. No external emails sent by this suite.",
  );
} finally {
  for (const id of captures)
    await unlink(`.local/mail/${id}.json`).catch(() => {});
  await admin.query("grant insert on gym.audit_events to gym_runtime");
  await f.cleanup();
  await admin.query('delete from app_auth."user" where email=any($1::text[])', [
    extra,
  ]);
  await admin.end();
  await pool.end();
}
