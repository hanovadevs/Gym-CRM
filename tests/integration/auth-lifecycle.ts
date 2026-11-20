import { config } from "dotenv";
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { configureAuth } from "../../src/server/auth/configure";
import { bootstrapOwner } from "../../src/server/auth/bootstrap";
config({ path: ".env.local", quiet: true });
if (new URL(process.env.TEST_DATABASE_URL!).pathname != "/gym_test")
  throw new Error("Isolated DB required");
const client = new pg.Client({
  connectionString: process.env.TEST_MIGRATION_DATABASE_URL,
});
const runtime = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
});
await client.connect();
const email = `owner-${randomBytes(8).toString("hex")}@example.invalid`,
  password = randomBytes(20).toString("hex"),
  secret = process.env.BETTER_AUTH_SECRET!,
  baseURL = "http://localhost:3100";
let owner: { userId: string; organizationId: string } | undefined;
let recovery: { email: string; url: string } | undefined;
const auth = configureAuth(runtime, {
  secret,
  baseURL,
  sendReset: async (message) => {
    recovery = message;
  },
});
const request = (path: string, body?: unknown, cookie?: string) =>
  auth.handler(
    new Request(baseURL + "/api/auth" + path, {
      method: body ? "POST" : "GET",
      headers: {
        origin: baseURL,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
try {
  owner = await bootstrapOwner(
    client,
    {
      name: "Test Owner",
      email,
      password,
      gymName: "Auth Test",
      slug: "auth-test",
    },
    { secret, baseURL },
  );
  await assert.rejects(
    bootstrapOwner(
      client,
      {
        name: "Other",
        email: "other@example.invalid",
        password,
        gymName: "Second",
        slug: "second",
      },
      { secret, baseURL },
    ),
    /already initialized/,
  );
  assert.equal(
    (
      await request("/sign-up/email", {
        name: "Intruder",
        email: "intruder@example.invalid",
        password,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/sign-in/email", { email, password: "wrong-password" }))
      .status,
    401,
  );
  const signed = await request("/sign-in/email", { email, password });
  assert.equal(signed.status, 200);
  const cookie = signed.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join(";");
  assert.equal(
    (await (await request("/get-session", undefined, cookie)).json()).user
      .email,
    email,
  );
  const reset = await request("/request-password-reset", {
    email,
    redirectTo: baseURL + "/reset-password",
  });
  assert.equal(reset.status, 200);
  assert.ok(recovery);
  const callback = await auth.handler(new Request(recovery.url));
  const token = new URL(callback.headers.get("location")!).searchParams.get(
    "token",
  );
  assert.ok(token);
  const stored = await client.query(
    "select identifier from app_auth.verification",
  );
  assert.ok(stored.rows.every((row) => !row.identifier.includes(token)));
  const newPassword = randomBytes(20).toString("hex");
  assert.equal(
    (await request("/reset-password", { token, newPassword })).status,
    200,
  );
  assert.notEqual(
    (await request("/reset-password", { token, newPassword })).status,
    200,
  );
  assert.equal(
    await (await request("/get-session", undefined, cookie)).json(),
    null,
  );
  const again = await request("/sign-in/email", {
    email,
    password: newPassword,
  });
  assert.equal(again.status, 200);
  const newCookie = again.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join(";");
  assert.equal((await request("/sign-out", {}, newCookie)).status, 200);
  assert.equal(
    await (await request("/get-session", undefined, newCookie)).json(),
    null,
  );
  console.log(
    "PASS: atomic first-owner bootstrap/repeat refusal, public signup denied, password failure, persisted login/session, hashed single-use recovery, reset session revocation, logout.",
  );
} finally {
  if (owner) {
    await client.query(
      "delete from gym.staff_branch_grants where organization_id=$1",
      [owner.organizationId],
    );
    await client.query(
      "delete from gym.staff_memberships where organization_id=$1",
      [owner.organizationId],
    );
    await client.query("delete from gym.branches where organization_id=$1", [
      owner.organizationId,
    ]);
    await client.query(
      "delete from gym.audit_events where organization_id=$1",
      [owner.organizationId],
    );
    await client.query("delete from gym.organizations where id=$1", [
      owner.organizationId,
    ]);
    await client.query('delete from app_auth."user" where id=$1', [
      owner.userId,
    ]);
  }
  await client.end();
  await runtime.end();
}
