import { config } from "dotenv";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
const url = "http://127.0.0.1:3200/dashboard";
let occupied = false;
try {
  await fetch(url);
  occupied = true;
} catch {}
if (occupied)
  throw new Error(
    "Production test port 3200 is occupied; refusing to reuse it",
  );
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3200",
  ],
  {
    env: { ...process.env, NODE_ENV: "production", DEMO_MODE: "false" },
    stdio: "ignore",
  },
);
try {
  let response;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production server exited");
    try {
      response = await fetch(url);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  assert.ok(response, "Production server must start");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("dashboard preview is disabled"));
  assert.ok(!html.includes("Good afternoon, Ali"));
  assert.ok(!html.includes("Demo data"));
  const denied = await fetch("http://127.0.0.1:3200/api/workspace");
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("cache-control"), "no-store");
  assert.equal((await denied.json()).error.code, "UNAUTHENTICATED");
  const org = "00000000-0000-4000-8000-000000000001";
  for (const [path, method, body] of [
    ["/api/settings", "GET"],
    ["/api/members", "GET"],
    [
      "/api/members",
      "POST",
      {
        organizationId: org,
        registrationKey: org,
        name: "Blocked member",
        phone: "",
        email: "blocked@example.invalid",
        homeBranchId: org,
        joinedOn: "2026-01-01",
      },
    ],
    [
      "/api/members",
      "PATCH",
      {
        organizationId: org,
        id: org,
        version: 1,
        name: "Blocked edit",
        phone: "",
        email: "blocked@example.invalid",
        homeBranchId: org,
        joinedOn: "2026-01-01",
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/settings",
      "PATCH",
      {
        organizationId: org,
        version: 1,
        changes: { phone: "0300-0000000" },
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/staff",
      "PATCH",
      {
        organizationId: org,
        id: org,
        version: 1,
        role: "owner",
        active: true,
        branchIds: [],
        reason: "Anonymous denial check",
      },
    ],
    [
      "/api/branches",
      "POST",
      {
        organizationId: org,
        name: "Blocked branch",
        code: "BLOCKED",
        active: true,
        reason: "Anonymous denial check",
      },
    ],
  ]) {
    const result = await fetch("http://127.0.0.1:3200" + path, {
      method,
      headers: {
        Origin: new URL(process.env.APP_URL).origin,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(result.status, 401, path + " requires authentication");
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal((await result.json()).error.code, "UNAUTHENTICATED");
  }
  for (const path of ["/workspace", "/members", "/settings"]) {
    const protectedPage = await fetch("http://127.0.0.1:3200" + path);
    // Next inserts a meta redirect when the loading boundary has already streamed.
    assert.ok(
      protectedPage.url.endsWith("/sign-in") ||
        (await protectedPage.text()).includes("url=/sign-in"),
    );
  }
  const configured = new URL(process.env.APP_URL);
  if (["localhost", "127.0.0.1"].includes(configured.hostname)) {
    configured.hostname =
      configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
    const rejected = await fetch("http://127.0.0.1:3200/api/members", {
      method: "POST",
      headers: {
        Origin: configured.origin,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(
      rejected.status,
      403,
      "Production rejects the unconfigured loopback alias",
    );
    const rejectedAuth=await fetch("http://127.0.0.1:3200/api/auth/sign-in/email",{method:"POST",headers:{Origin:configured.origin,"Content-Type":"application/json"},body:JSON.stringify({email:"blocked@example.invalid",password:"Fictional test password"})});
    assert.equal(rejectedAuth.status,403,"Production auth rejects the unconfigured alias");
  }
  const files = await readdir(".next/static", {
    recursive: true,
    withFileTypes: true,
  });
  let count = 0;
  const sensitive = [
    process.env.DATABASE_URL,
    process.env.MIGRATION_DATABASE_URL,
    process.env.BETTER_AUTH_SECRET,
  ].filter(Boolean);
  for (const file of files) {
    if (!file.isFile()) continue;
    const bytes = await readFile(file.parentPath + "/" + file.name);
    count++;
    for (const secret of sensitive)
      assert.ok(
        !bytes.includes(Buffer.from(secret)),
        "Server secret appeared in client asset",
      );
  }
  console.log(
    `PASS: production preview disabled; workspace/settings/staff/branch/member APIs 401/no-store and protected pages redirect to sign-in; ${count} client assets contain no configured database URLs/auth secret.`,
  );
} finally {
  server.kill();
}
